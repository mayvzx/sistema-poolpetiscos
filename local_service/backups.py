"""Automatic local backup policy and optional Google Drive synchronization."""

from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from local_service.google_drive import (
    GoogleDriveClient,
    GoogleDriveError,
    OAUTH_CONFIGURATION_FILENAME,
)
from local_service.storage import BackupRecord, StateSnapshot, StateStorage

SCHEDULER_INTERVAL_SECONDS = 30 * 60
logger = logging.getLogger("pool_petiscos.backups")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace(
        "+00:00", "Z"
    )


class BackupManager:
    def __init__(
        self,
        storage: StateStorage,
        home_directory: Path,
        installation_directory: Path,
        *,
        google_drive: GoogleDriveClient | None = None,
        interval_seconds: int = SCHEDULER_INTERVAL_SECONDS,
    ) -> None:
        self.storage = storage
        self.home_directory = home_directory.expanduser().resolve()
        self.installation_directory = installation_directory.expanduser().resolve()
        self.state_path = self.home_directory / "config" / "backup-state.json"
        self.google_drive = google_drive or GoogleDriveClient(
            [
                self.home_directory / "config" / OAUTH_CONFIGURATION_FILENAME,
                self.installation_directory
                / "config"
                / OAUTH_CONFIGURATION_FILENAME,
            ],
            self.home_directory / "config" / "google-drive-token.dpapi",
        )
        self.interval_seconds = max(60, interval_seconds)
        self._lock = threading.RLock()
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._run_loop,
            name="pool-petiscos-backups",
            daemon=True,
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3)

    def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                if self.storage.read().state is not None:
                    self.run()
            except Exception:
                logger.exception("Falha no ciclo automático de backups.")
            self._stop_event.wait(self.interval_seconds)

    def status(self) -> dict[str, Any]:
        with self._lock:
            state = self._read_state()
            records = self.storage.list_backups()
            storage_info = self.storage.backup_info()
            by_tier = {
                tier: sum(1 for record in records if record.tier == tier)
                for tier in ("daily", "weekly", "monthly")
            }
            return {
                "schedules": [
                    {"tier": "daily", "label": "Diário", "retention": 30},
                    {"tier": "weekly", "label": "Semanal", "retention": 12},
                    {"tier": "monthly", "label": "Mensal", "retention": 12},
                ],
                "counts": by_tier,
                "backup_directory": str(self.storage.backup_directory),
                "last_local_backup_at": storage_info["last_backup_at"],
                "last_google_sync_at": state.get("last_google_sync_at"),
                "last_error": (
                    state.get("last_error") or storage_info["backup_error"]
                ),
                "google_drive": self.google_drive.status(),
                "local_backups": [record.public_dict() for record in records],
            }

    def run(self, *, force: bool = False) -> dict[str, Any]:
        with self._lock:
            state = self._read_state()
            state["last_error"] = None
            uploaded = 0
            try:
                records = self.storage.ensure_automatic_backups(force=force)
                google_status = self.google_drive.status()
                if google_status["connected"]:
                    manifest = state.setdefault("manifest", {})
                    remote_files = {
                        str(item.get("name")): str(item.get("id"))
                        for item in self.google_drive.list_backups()
                        if item.get("name") and item.get("id")
                    }
                    for record in self.storage.list_backups():
                        signature = self._signature(record)
                        previous = manifest.get(record.filename)
                        if (
                            not force
                            and isinstance(previous, dict)
                            and all(previous.get(key) == value for key, value in signature.items())
                        ):
                            continue
                        file_id = self.google_drive.upload_backup(
                            record.path,
                            record.tier,
                            record.period,
                            remote_files.get(record.filename),
                        )
                        remote_files[record.filename] = file_id
                        manifest[record.filename] = {
                            **signature,
                            "file_id": file_id,
                        }
                        uploaded += 1
                    live_names = {
                        record.filename for record in self.storage.list_backups()
                    }
                    state["manifest"] = {
                        name: value
                        for name, value in manifest.items()
                        if name in live_names
                    }
                    state["last_google_sync_at"] = _utc_now()
            except (GoogleDriveError, OSError, ValueError) as error:
                state["last_error"] = str(error)[:500]
                self._write_state(state)
                raise
            self._write_state(state)
            return {
                "created": [record.public_dict() for record in records],
                "uploaded": uploaded,
                **self.status(),
            }

    def restore_local(self, filename: str) -> StateSnapshot:
        return self.storage.restore_database(self.storage.backup_path(filename))

    def list_google_backups(self) -> list[dict[str, Any]]:
        with self._lock:
            files = self.google_drive.list_backups()
        return [
            {
                "id": item.get("id"),
                "filename": item.get("name"),
                "size_bytes": int(item.get("size", 0) or 0),
                "created_at": item.get("modifiedTime"),
                "web_url": item.get("webViewLink"),
                "tier": (item.get("appProperties") or {}).get("tier"),
                "period": (item.get("appProperties") or {}).get("period"),
            }
            for item in files
            if item.get("id") and item.get("name")
        ]

    def restore_google(self, file_id: str) -> StateSnapshot:
        with self._lock:
            payload = self.google_drive.download_backup(file_id)
        temporary_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                prefix="pool-petiscos-google-",
                suffix=".db",
                dir=self.storage.database_path.parent,
                delete=False,
            ) as temporary:
                temporary.write(payload)
                temporary_path = Path(temporary.name)
            return self.storage.restore_database(temporary_path)
        finally:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)

    def begin_google_connection(self, redirect_uri: str) -> str:
        with self._lock:
            return self.google_drive.begin_authorization(redirect_uri)

    def complete_google_connection(self, state: str, code: str) -> None:
        with self._lock:
            self.google_drive.complete_authorization(state, code)
        threading.Thread(
            target=lambda: self._safe_force_sync(),
            name="pool-petiscos-google-first-sync",
            daemon=True,
        ).start()

    def _safe_force_sync(self) -> None:
        try:
            self.run(force=True)
        except Exception:
            logger.exception("Falha na primeira sincronização com o Google Drive.")

    def disconnect_google(self) -> None:
        with self._lock:
            revoked = self.google_drive.disconnect()
            state = self._read_state()
            state["manifest"] = {}
            state["last_google_sync_at"] = None
            state["last_error"] = (
                None
                if revoked
                else (
                    "A conta foi desconectada deste computador, mas a revogação "
                    "online não pôde ser confirmada."
                )
            )
            self._write_state(state)

    @staticmethod
    def _signature(record: BackupRecord) -> dict[str, int | str]:
        stat = record.path.stat()
        return {
            "size_bytes": stat.st_size,
            "modified_ns": stat.st_mtime_ns,
            "tier": record.tier,
            "period": record.period,
        }

    def _read_state(self) -> dict[str, Any]:
        try:
            payload = json.loads(self.state_path.read_text(encoding="utf-8"))
            return payload if isinstance(payload, dict) else {}
        except FileNotFoundError:
            return {}
        except (OSError, json.JSONDecodeError) as error:
            logger.warning("Estado de backup ilegível: %s", error)
            return {
                "last_error": (
                    "O histórico de sincronização dos backups estava ilegível e "
                    "será reconstruído."
                )
            }

    def _write_state(self, state: dict[str, Any]) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.state_path.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(state, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        os.replace(temporary, self.state_path)
