from __future__ import annotations

import json
import os
import sqlite3
import threading
import uuid
from collections.abc import Callable, Mapping
from contextlib import closing
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DATABASE_FILENAME = "pool-petiscos.db"
DATA_DIRECTORY_ENVIRONMENT_KEY = "POOL_PETISCOS_DATA_DIR"
BACKUP_DIRECTORY_ENVIRONMENT_KEY = "POOL_PETISCOS_BACKUP_DIR"
BACKUP_PREFIX = "pool-petiscos-"
BACKUP_SUFFIX = ".db"
BACKUP_RETENTION_DAYS = 30
STATE_HISTORY_RETENTION = 50
ONEDRIVE_ENVIRONMENT_KEYS = (
    "OneDriveCommercial",
    "OneDriveConsumer",
    "OneDrive",
)


def _local_app_data(
    environment: Mapping[str, str] | None = None,
) -> Path:
    values = os.environ if environment is None else environment
    local_data = values.get("LOCALAPPDATA")
    if local_data:
        return Path(local_data)
    return Path.home() / ".pool-petiscos"


def default_database_path(
    environment: Mapping[str, str] | None = None,
) -> Path:
    values = os.environ if environment is None else environment
    override = values.get(DATA_DIRECTORY_ENVIRONMENT_KEY)
    if override:
        return Path(override) / DATABASE_FILENAME
    return (
        _local_app_data(values)
        / "PoolPetiscos"
        / "data"
        / DATABASE_FILENAME
    )


def resolve_backup_directory(
    environment: Mapping[str, str] | None = None,
) -> Path:
    values = os.environ if environment is None else environment
    override = values.get(BACKUP_DIRECTORY_ENVIRONMENT_KEY)
    if override:
        candidate = Path(override)
        candidate.mkdir(parents=True, exist_ok=True)
        return candidate

    for key in ONEDRIVE_ENVIRONMENT_KEYS:
        root_value = values.get(key)
        if not root_value:
            continue
        candidate = Path(root_value) / "Pool Petiscos" / "Backups"
        try:
            candidate.mkdir(parents=True, exist_ok=True)
        except OSError:
            continue
        return candidate

    fallback = _local_app_data(values) / "PoolPetiscos" / "backups"
    fallback.mkdir(parents=True, exist_ok=True)
    return fallback


def _utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace(
        "+00:00", "Z"
    )


@dataclass(frozen=True)
class StateSnapshot:
    state: dict[str, Any] | None
    revision: int
    saved_at: str | None


class RevisionConflict(Exception):
    def __init__(self, snapshot: StateSnapshot) -> None:
        super().__init__("O estado foi alterado por outra sessão.")
        self.snapshot = snapshot


class StateStorage:
    """Transactional state storage and daily SQLite snapshots."""

    def __init__(
        self,
        database_path: Path | None = None,
        backup_directory: Path | None = None,
        *,
        clock: Callable[[], datetime] | None = None,
        backup_retention: int = BACKUP_RETENTION_DAYS,
        history_retention: int = STATE_HISTORY_RETENTION,
    ) -> None:
        self.database_path = (
            database_path if database_path is not None else default_database_path()
        ).expanduser().resolve()
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.backup_directory = (
            backup_directory
            if backup_directory is not None
            else resolve_backup_directory()
        ).expanduser().resolve()
        self.backup_directory.mkdir(parents=True, exist_ok=True)
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self._backup_retention = max(1, backup_retention)
        self._history_retention = max(1, history_retention)
        self._last_backup_error: str | None = None
        self._lock = threading.RLock()
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            self.database_path,
            timeout=5,
            isolation_level=None,
        )
        connection.execute("PRAGMA busy_timeout = 5000")
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _initialize(self) -> None:
        with self._lock:
            with closing(self._connect()) as connection:
                connection.execute("PRAGMA journal_mode = WAL")
                connection.execute("PRAGMA synchronous = FULL")
                connection.execute(
                    """
                    CREATE TABLE IF NOT EXISTS app_state (
                        id INTEGER PRIMARY KEY CHECK (id = 1),
                        state_json TEXT,
                        revision INTEGER NOT NULL DEFAULT 0
                            CHECK (revision >= 0),
                        saved_at TEXT
                    )
                    """
                )
                connection.execute(
                    """
                    INSERT OR IGNORE INTO app_state
                        (id, state_json, revision, saved_at)
                    VALUES (1, NULL, 0, NULL)
                    """
                )
                connection.execute(
                    """
                    CREATE TABLE IF NOT EXISTS state_history (
                        revision INTEGER PRIMARY KEY CHECK (revision > 0),
                        saved_at TEXT NOT NULL,
                        state_json TEXT NOT NULL
                    )
                    """
                )
                connection.execute("PRAGMA user_version = 1")

    @staticmethod
    def _decode_snapshot(row: sqlite3.Row | tuple[Any, ...]) -> StateSnapshot:
        encoded_state, revision, saved_at = row
        try:
            state = (
                json.loads(encoded_state)
                if encoded_state is not None
                else None
            )
            parsed_revision = int(revision)
        except (TypeError, ValueError, json.JSONDecodeError) as error:
            raise RuntimeError(
                "O estado persistido no banco é inválido."
            ) from error
        if state is not None and not isinstance(state, dict):
            raise RuntimeError("O estado persistido no banco é inválido.")
        return StateSnapshot(
            state=state,
            revision=parsed_revision,
            saved_at=str(saved_at) if saved_at is not None else None,
        )

    def read(self) -> StateSnapshot:
        with self._lock:
            with closing(self._connect()) as connection:
                row = connection.execute(
                    """
                    SELECT state_json, revision, saved_at
                    FROM app_state
                    WHERE id = 1
                    """
                ).fetchone()
        if row is None:
            raise RuntimeError("O banco local não contém o registro de estado.")
        return self._decode_snapshot(row)

    def save(
        self,
        state: dict[str, Any],
        expected_revision: int | None = None,
    ) -> StateSnapshot:
        if not isinstance(state, dict):
            raise ValueError("O estado deve ser um objeto.")
        if expected_revision is not None and (
            isinstance(expected_revision, bool)
            or not isinstance(expected_revision, int)
            or expected_revision < 0
        ):
            raise ValueError(
                "A revisão esperada deve ser um inteiro maior ou igual a zero."
            )
        encoded_state = json.dumps(
            state,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        )
        saved_at = _utc_iso(self._clock())

        with self._lock:
            connection = self._connect()
            try:
                connection.execute("BEGIN IMMEDIATE")
                row = connection.execute(
                    """
                    SELECT state_json, revision, saved_at
                    FROM app_state
                    WHERE id = 1
                    """
                ).fetchone()
                if row is None:
                    raise RuntimeError(
                        "O banco local não contém o registro de estado."
                    )
                current = self._decode_snapshot(row)
                if (
                    expected_revision is not None
                    and expected_revision != current.revision
                ):
                    connection.rollback()
                    raise RevisionConflict(current)

                next_revision = current.revision + 1
                connection.execute(
                    """
                    UPDATE app_state
                    SET state_json = ?, revision = ?, saved_at = ?
                    WHERE id = 1
                    """,
                    (encoded_state, next_revision, saved_at),
                )
                connection.execute(
                    """
                    INSERT INTO state_history
                        (revision, saved_at, state_json)
                    VALUES (?, ?, ?)
                    """,
                    (next_revision, saved_at, encoded_state),
                )
                connection.execute(
                    """
                    DELETE FROM state_history
                    WHERE revision NOT IN (
                        SELECT revision
                        FROM state_history
                        ORDER BY revision DESC
                        LIMIT ?
                    )
                    """,
                    (self._history_retention,),
                )
                connection.commit()
            except Exception:
                if connection.in_transaction:
                    connection.rollback()
                raise
            finally:
                connection.close()

            snapshot = StateSnapshot(
                state=state,
                revision=next_revision,
                saved_at=saved_at,
            )
            try:
                self.ensure_daily_backup(force=True)
            except (OSError, sqlite3.Error):
                # O estado já foi confirmado. A falha de backup é informada
                # separadamente para não induzir o cliente a repetir a venda.
                pass
            return snapshot

    def _daily_backup_path(self, now: datetime) -> Path:
        local_date = (
            now.astimezone().date()
            if now.tzinfo is not None
            else now.date()
        )
        return (
            self.backup_directory
            / f"{BACKUP_PREFIX}{local_date.isoformat()}{BACKUP_SUFFIX}"
        )

    def ensure_daily_backup(self, *, force: bool = False) -> Path:
        now = self._clock()
        destination = self._daily_backup_path(now)
        with self._lock:
            try:
                if destination.is_file() and not force:
                    self._prune_daily_backups()
                    self._last_backup_error = None
                    return destination

                temporary = destination.with_name(
                    f".{destination.name}.{uuid.uuid4().hex}.tmp"
                )
                source = self._connect()
                target: sqlite3.Connection | None = None
                try:
                    target = sqlite3.connect(temporary)
                    source.backup(target)
                    integrity = target.execute(
                        "PRAGMA integrity_check"
                    ).fetchone()
                    if integrity is None or integrity[0] != "ok":
                        raise sqlite3.DatabaseError(
                            "A verificação do backup SQLite falhou."
                        )
                    target.close()
                    target = None
                    os.replace(temporary, destination)
                finally:
                    source.close()
                    if target is not None:
                        target.close()
                    temporary.unlink(missing_ok=True)

                self._prune_daily_backups()
                self._last_backup_error = None
                return destination
            except (OSError, sqlite3.Error) as error:
                self._last_backup_error = str(error)
                raise

    def _daily_backups(self) -> list[Path]:
        backups = [
            path
            for path in self.backup_directory.glob(
                f"{BACKUP_PREFIX}????-??-??{BACKUP_SUFFIX}"
            )
            if path.is_file()
        ]
        backups.sort(key=lambda path: path.name, reverse=True)
        return backups

    def _prune_daily_backups(self) -> None:
        for expired in self._daily_backups()[self._backup_retention :]:
            expired.unlink(missing_ok=True)

    def last_backup_at(self) -> str | None:
        with self._lock:
            backups = self._daily_backups()
            if not backups:
                return None
            newest = max(backups, key=lambda path: path.stat().st_mtime)
            return _utc_iso(
                datetime.fromtimestamp(newest.stat().st_mtime, tz=timezone.utc)
            )

    def backup_info(self) -> dict[str, str | None]:
        with self._lock:
            try:
                last_backup_at = self.last_backup_at()
            except OSError as error:
                self._last_backup_error = str(error)
                last_backup_at = None
            return {
                "last_backup_at": last_backup_at,
                "backup_directory": str(self.backup_directory),
                "backup_error": self._last_backup_error,
            }
