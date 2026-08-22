from __future__ import annotations

import base64
import binascii
import json
import math
import os
import shutil
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
BACKUP_RETENTION_WEEKS = 12
BACKUP_RETENTION_MONTHS = 12
PRE_RESTORE_BACKUP_RETENTION = 10
STATE_HISTORY_RETENTION = 50
ONEDRIVE_ENVIRONMENT_KEYS = (
    "OneDriveCommercial",
    "OneDriveConsumer",
    "OneDrive",
)
READABLE_VIEW_NAMES = (
    "vw_produtos",
    "vw_vendas",
    "vw_comandas",
    "vw_itens_venda",
    "vw_despesas",
    "vw_movimentos_caixa",
    "vw_fechamentos_caixa",
    "vw_operadores",
)
PAYMENT_METHODS = frozenset({"Pix", "Dinheiro", "Débito", "Crédito", "Cartão"})
PRODUCT_CATEGORIES = frozenset(
    {"Hambúrgueres", "Salgados", "Petiscos", "Sobremesas", "Bebidas", "Adicionais"}
)
ORDER_STATUSES = frozenset({"aguardando", "em-preparo", "pronto", "entregue"})
SALE_OPERATOR_IDS = frozenset({"elaine", "poolblay", "nao-identificado"})


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


def _is_finite_number(value: object, *, non_negative: bool = False) -> bool:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    number = float(value)
    return math.isfinite(number) and (not non_negative or number >= 0)


def _is_integer(value: object, *, minimum: int | None = None) -> bool:
    if isinstance(value, bool) or not isinstance(value, int):
        return False
    return minimum is None or value >= minimum


def _is_non_empty_string(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_allowed_string(value: object, allowed: frozenset[str]) -> bool:
    return isinstance(value, str) and value in allowed


def _is_timestamp(value: object) -> bool:
    return _is_finite_number(value) and float(value) > 0


def _is_base64(value: object, minimum_bytes: int) -> bool:
    if not isinstance(value, str) or not value:
        return False
    try:
        decoded = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError):
        return False
    return len(decoded) >= minimum_bytes


def _is_credential(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    return (
        value.get("algorithm") == "PBKDF2-SHA-256"
        and isinstance(value.get("iterations"), int)
        and not isinstance(value.get("iterations"), bool)
        and 100_000 <= value["iterations"] <= 1_000_000
        and _is_base64(value.get("salt"), 16)
        and _is_base64(value.get("hash"), 32)
        and _is_timestamp(value.get("updatedAt"))
    )


def _is_product(value: object) -> bool:
    return bool(
        isinstance(value, dict)
        and _is_non_empty_string(value.get("id"))
        and _is_non_empty_string(value.get("name"))
        and _is_allowed_string(value.get("category"), PRODUCT_CATEGORIES)
        and _is_finite_number(value.get("price"), non_negative=True)
        and _is_integer(value.get("stock"), minimum=0)
        and _is_integer(value.get("minimum"), minimum=0)
        and isinstance(value.get("emoji"), str)
    )


def _is_sale_item(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    observation = value.get("observation")
    return bool(
        _is_non_empty_string(value.get("productId"))
        and _is_non_empty_string(value.get("name"))
        and _is_finite_number(value.get("price"), non_negative=True)
        and _is_integer(value.get("quantity"), minimum=1)
        and (
            observation is None
            or (isinstance(observation, str) and len(observation) <= 180)
        )
    )


def _has_valid_optional_session_id(value: dict[str, Any]) -> bool:
    return "cashSessionId" not in value or _is_non_empty_string(
        value.get("cashSessionId")
    )


def _is_sale(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    items = value.get("items")
    timestamp = value.get("timestamp")
    if (
        not _is_non_empty_string(value.get("id"))
        or not _has_valid_optional_session_id(value)
        or not _is_timestamp(timestamp)
        or not _is_finite_number(value.get("total"), non_negative=True)
        or not _is_allowed_string(value.get("payment"), PAYMENT_METHODS)
        or not isinstance(items, list)
        or not items
        or any(not _is_sale_item(item) for item in items)
    ):
        return False
    expected_total = math.fsum(
        float(item["price"]) * int(item["quantity"]) for item in items
    )
    if abs(expected_total - float(value["total"])) > 0.005:
        return False
    operator_id = value.get("operatorId")
    if operator_id is not None and not _is_allowed_string(
        operator_id, SALE_OPERATOR_IDS
    ):
        return False
    order_status = value.get("orderStatus")
    if order_status is not None and not _is_allowed_string(
        order_status, ORDER_STATUSES
    ):
        return False
    status_updated_at = value.get("statusUpdatedAt")
    return bool(
        status_updated_at is None
        or (
            _is_timestamp(status_updated_at)
            and float(status_updated_at) >= float(timestamp)
        )
    )


def _is_expense(value: object) -> bool:
    return bool(
        isinstance(value, dict)
        and _is_non_empty_string(value.get("id"))
        and _has_valid_optional_session_id(value)
        and _is_timestamp(value.get("timestamp"))
        and _is_non_empty_string(value.get("description"))
        and _is_non_empty_string(value.get("category"))
        and _is_finite_number(value.get("amount"), non_negative=True)
        and _is_allowed_string(value.get("payment", "Dinheiro"), PAYMENT_METHODS)
    )


def _is_cash_movement(value: object) -> bool:
    return bool(
        isinstance(value, dict)
        and _is_non_empty_string(value.get("id"))
        and _has_valid_optional_session_id(value)
        and _is_timestamp(value.get("timestamp"))
        and _is_non_empty_string(value.get("description"))
        and _is_finite_number(value.get("amount"), non_negative=True)
        and isinstance(value.get("kind"), str)
        and value.get("kind") in {"suprimento", "sangria"}
    )


def _is_cash_closure(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    opened_at = value.get("openedAt")
    closed_at = value.get("closedAt")
    expected_balance = value.get("expectedBalance")
    counted_balance = value.get("countedBalance")
    difference = value.get("difference")
    if not (
        _is_non_empty_string(value.get("id"))
        and _is_timestamp(opened_at)
        and _is_timestamp(closed_at)
        and float(closed_at) >= float(opened_at)
        and _is_finite_number(value.get("openingBalance"), non_negative=True)
        and _is_finite_number(expected_balance)
        and _is_finite_number(counted_balance, non_negative=True)
        and _is_finite_number(difference)
        and abs(
            (float(counted_balance) - float(expected_balance)) - float(difference)
        )
        <= 0.005
    ):
        return False
    session_fields = (
        "sessionId",
        "openedByOperatorId",
        "openedByOperatorName",
        "closedByOperatorId",
        "closedByOperatorName",
    )
    supplied_session_fields = [field in value for field in session_fields]
    if any(supplied_session_fields) and not (
        all(supplied_session_fields)
        and _is_non_empty_string(value.get("sessionId"))
        and _is_allowed_string(
            value.get("openedByOperatorId"), SALE_OPERATOR_IDS
        )
        and _is_non_empty_string(value.get("openedByOperatorName"))
        and _is_allowed_string(
            value.get("closedByOperatorId"), SALE_OPERATOR_IDS
        )
        and _is_non_empty_string(value.get("closedByOperatorName"))
    ):
        return False
    closing_fields = ("cashFund", "withdrawalAmount", "remainingBalance")
    supplied_fields = [field in value for field in closing_fields]
    if not any(supplied_fields):
        return True
    if not all(supplied_fields):
        return False
    cash_fund = value.get("cashFund")
    withdrawal_amount = value.get("withdrawalAmount")
    remaining_balance = value.get("remainingBalance")
    return bool(
        _is_finite_number(cash_fund, non_negative=True)
        and _is_finite_number(withdrawal_amount, non_negative=True)
        and _is_finite_number(remaining_balance, non_negative=True)
        and float(remaining_balance) <= float(cash_fund) + 0.005
        and abs(
            float(counted_balance)
            - float(withdrawal_amount)
            - float(remaining_balance)
        )
        <= 0.005
    )


def _has_unique_ids(values: list[object]) -> bool:
    identifiers = [
        value.get("id") if isinstance(value, dict) else None for value in values
    ]
    return len(identifiers) == len(set(identifiers))


def _is_pool_state(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    validators = {
        "products": _is_product,
        "sales": _is_sale,
        "expenses": _is_expense,
        "cashMovements": _is_cash_movement,
        "cashClosures": _is_cash_closure,
    }
    for key, validator in validators.items():
        entries = value.get(key)
        if (
            not isinstance(entries, list)
            or any(not validator(item) for item in entries)
            or not _has_unique_ids(entries)
        ):
            return False
    if (
        not isinstance(value.get("cashOpen"), bool)
        or not _is_finite_number(value.get("openingBalance"), non_negative=True)
        or (
            "cashFund" in value
            and not _is_finite_number(value.get("cashFund"), non_negative=True)
        )
        or not _is_timestamp(value.get("cashOpenedAt"))
    ):
        return False
    active_session = value.get("activeCashSession")
    if active_session is not None and not (
        isinstance(active_session, dict)
        and _is_non_empty_string(active_session.get("id"))
        and _is_timestamp(active_session.get("openedAt"))
        and _is_finite_number(
            active_session.get("openingBalance"), non_negative=True
        )
        and _is_allowed_string(
            active_session.get("openedByOperatorId"), SALE_OPERATOR_IDS
        )
        and _is_non_empty_string(active_session.get("openedByOperatorName"))
    ):
        return False
    if value.get("cashOpen") and "activeCashSession" in value and active_session is None:
        return False
    if not value.get("cashOpen") and active_session is not None:
        return False
    closures = value["cashClosures"]
    closure_session_ids = [
        closure.get("sessionId", f"SESSAO-{closure['id']}")
        for closure in closures
    ]
    if len(closure_session_ids) != len(set(closure_session_ids)):
        return False
    known_session_ids = set(closure_session_ids)
    if isinstance(active_session, dict):
        if (
            active_session["openedAt"] != value["cashOpenedAt"]
            or abs(
                float(active_session["openingBalance"])
                - float(value["openingBalance"])
            )
            > 0.005
        ):
            return False
        known_session_ids.add(active_session["id"])
    if any(
        record.get("cashSessionId") not in known_session_ids
        for collection in ("sales", "expenses", "cashMovements")
        for record in value[collection]
        if "cashSessionId" in record
    ):
        return False
    credentials = value.get("operatorCredentials")
    if not isinstance(credentials, dict) or any(
        key not in {"elaine", "poolblay"} or not _is_credential(credential)
        for key, credential in credentials.items()
    ):
        return False
    recovery = value.get("pinRecoveryCredential")
    return recovery is None or _is_credential(recovery)


@dataclass(frozen=True)
class StateSnapshot:
    state: dict[str, Any] | None
    revision: int
    saved_at: str | None


@dataclass(frozen=True)
class BackupRecord:
    filename: str
    tier: str
    period: str
    created_at: str
    size_bytes: int
    path: Path

    def public_dict(self) -> dict[str, str | int]:
        return {
            "filename": self.filename,
            "tier": self.tier,
            "period": self.period,
            "created_at": self.created_at,
            "size_bytes": self.size_bytes,
        }


class RevisionConflict(Exception):
    def __init__(self, snapshot: StateSnapshot) -> None:
        super().__init__("O estado foi alterado por outra sessão.")
        self.snapshot = snapshot


class StateStorage:
    """Transactional state storage, readable views and verified SQLite copies."""

    def __init__(
        self,
        database_path: Path | None = None,
        backup_directory: Path | None = None,
        *,
        clock: Callable[[], datetime] | None = None,
        backup_retention: int = BACKUP_RETENTION_DAYS,
        weekly_backup_retention: int = BACKUP_RETENTION_WEEKS,
        monthly_backup_retention: int = BACKUP_RETENTION_MONTHS,
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
        self._weekly_backup_retention = max(1, weekly_backup_retention)
        self._monthly_backup_retention = max(1, monthly_backup_retention)
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
                quick_check = connection.execute("PRAGMA quick_check").fetchone()
                if quick_check is None or quick_check[0] != "ok":
                    raise sqlite3.DatabaseError("O banco local está corrompido.")
                try:
                    connection.execute("BEGIN IMMEDIATE")
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
                    self._create_readable_views(connection)
                    connection.execute("PRAGMA user_version = 4")
                    connection.commit()
                except Exception:
                    if connection.in_transaction:
                        connection.rollback()
                    raise

    @staticmethod
    def _create_readable_views(connection: sqlite3.Connection) -> None:
        """Expose the current JSON state as read-only, spreadsheet-like views.

        The application keeps one atomic JSON document so a sale and its stock
        movement are always committed together. These views make the same data
        understandable in SQLite viewers without duplicating or normalizing it.
        """

        for view_name in READABLE_VIEW_NAMES:
            connection.execute(f'DROP VIEW IF EXISTS "{view_name}"')

        connection.executescript(
            """
            CREATE VIEW vw_produtos AS
            SELECT
                json_extract(product.value, '$.id') AS id,
                json_extract(product.value, '$.name') AS nome,
                json_extract(product.value, '$.category') AS categoria,
                CAST(json_extract(product.value, '$.price') AS REAL) AS preco,
                CAST(json_extract(product.value, '$.stock') AS INTEGER)
                    AS estoque_atual,
                CAST(json_extract(product.value, '$.minimum') AS INTEGER)
                    AS estoque_minimo
            FROM app_state
            JOIN json_each(
                COALESCE(app_state.state_json, '{}'),
                '$.products'
            ) AS product
            WHERE app_state.id = 1;

            CREATE VIEW vw_vendas AS
            SELECT
                json_extract(sale.value, '$.id') AS id,
                json_extract(sale.value, '$.cashSessionId') AS sessao_caixa_id,
                CAST(json_extract(sale.value, '$.timestamp') AS INTEGER)
                    AS data_hora_ms,
                datetime(
                    CAST(json_extract(sale.value, '$.timestamp') AS INTEGER)
                        / 1000,
                    'unixepoch',
                    'localtime'
                ) AS data_hora,
                CAST(json_extract(sale.value, '$.total') AS REAL) AS total,
                json_extract(sale.value, '$.payment') AS forma_pagamento,
                COALESCE(
                    NULLIF(
                        TRIM(json_extract(sale.value, '$.operatorName')),
                        ''
                    ),
                    'Não identificado'
                ) AS operador,
                (
                    SELECT COALESCE(
                        SUM(
                            CAST(
                                json_extract(item.value, '$.quantity')
                                AS INTEGER
                            )
                        ),
                        0
                    )
                    FROM json_each(
                        json_extract(sale.value, '$.items')
                    ) AS item
                ) AS quantidade_itens
            FROM app_state
            JOIN json_each(
                COALESCE(app_state.state_json, '{}'),
                '$.sales'
            ) AS sale
            WHERE app_state.id = 1;

            CREATE VIEW vw_comandas AS
            SELECT
                json_extract(sale.value, '$.id') AS venda_id,
                json_extract(sale.value, '$.cashSessionId') AS sessao_caixa_id,
                COALESCE(
                    NULLIF(
                        TRIM(json_extract(sale.value, '$.customerName')),
                        ''
                    ),
                    'Cliente sem nome'
                ) AS cliente,
                COALESCE(
                    json_extract(sale.value, '$.orderStatus'),
                    'entregue'
                ) AS situacao,
                CAST(json_extract(sale.value, '$.timestamp') AS INTEGER)
                    AS recebido_em_ms,
                datetime(
                    CAST(json_extract(sale.value, '$.timestamp') AS INTEGER)
                        / 1000,
                    'unixepoch',
                    'localtime'
                ) AS recebido_em,
                CAST(
                    COALESCE(
                        json_extract(sale.value, '$.statusUpdatedAt'),
                        json_extract(sale.value, '$.timestamp')
                    )
                    AS INTEGER
                ) AS situacao_atualizada_em_ms,
                CAST(json_extract(sale.value, '$.total') AS REAL) AS total,
                json_extract(sale.value, '$.payment') AS forma_pagamento,
                COALESCE(
                    NULLIF(
                        TRIM(json_extract(sale.value, '$.operatorName')),
                        ''
                    ),
                    'Não identificado'
                ) AS operador,
                (
                    SELECT COALESCE(
                        SUM(
                            CAST(
                                json_extract(item.value, '$.quantity')
                                AS INTEGER
                            )
                        ),
                        0
                    )
                    FROM json_each(
                        json_extract(sale.value, '$.items')
                    ) AS item
                ) AS quantidade_itens
            FROM app_state
            JOIN json_each(
                COALESCE(app_state.state_json, '{}'),
                '$.sales'
            ) AS sale
            WHERE app_state.id = 1;

            CREATE VIEW vw_itens_venda AS
            SELECT
                json_extract(sale.value, '$.id') AS venda_id,
                json_extract(sale.value, '$.cashSessionId') AS sessao_caixa_id,
                CAST(json_extract(sale.value, '$.timestamp') AS INTEGER)
                    AS venda_data_hora_ms,
                json_extract(item.value, '$.productId') AS produto_id,
                json_extract(item.value, '$.name') AS produto,
                CAST(json_extract(item.value, '$.price') AS REAL)
                    AS preco_unitario,
                CAST(json_extract(item.value, '$.quantity') AS INTEGER)
                    AS quantidade,
                NULLIF(
                    TRIM(json_extract(item.value, '$.observation')),
                    ''
                ) AS observacao,
                ROUND(
                    CAST(json_extract(item.value, '$.price') AS REAL)
                        * CAST(
                            json_extract(item.value, '$.quantity') AS INTEGER
                        ),
                    2
                ) AS total_item
            FROM app_state
            JOIN json_each(
                COALESCE(app_state.state_json, '{}'),
                '$.sales'
            ) AS sale
            JOIN json_each(
                json_extract(sale.value, '$.items')
            ) AS item
            WHERE app_state.id = 1;

            CREATE VIEW vw_despesas AS
            SELECT
                json_extract(expense.value, '$.id') AS id,
                json_extract(expense.value, '$.cashSessionId')
                    AS sessao_caixa_id,
                CAST(json_extract(expense.value, '$.timestamp') AS INTEGER)
                    AS data_hora_ms,
                datetime(
                    CAST(json_extract(expense.value, '$.timestamp') AS INTEGER)
                        / 1000,
                    'unixepoch',
                    'localtime'
                ) AS data_hora,
                json_extract(expense.value, '$.description') AS descricao,
                json_extract(expense.value, '$.category') AS categoria,
                CAST(json_extract(expense.value, '$.amount') AS REAL) AS valor,
                json_extract(expense.value, '$.payment') AS forma_pagamento
            FROM app_state
            JOIN json_each(
                COALESCE(app_state.state_json, '{}'),
                '$.expenses'
            ) AS expense
            WHERE app_state.id = 1;

            CREATE VIEW vw_movimentos_caixa AS
            SELECT
                json_extract(movement.value, '$.id') AS id,
                json_extract(movement.value, '$.cashSessionId')
                    AS sessao_caixa_id,
                CAST(json_extract(movement.value, '$.timestamp') AS INTEGER)
                    AS data_hora_ms,
                datetime(
                    CAST(json_extract(movement.value, '$.timestamp') AS INTEGER)
                        / 1000,
                    'unixepoch',
                    'localtime'
                ) AS data_hora,
                json_extract(movement.value, '$.kind') AS tipo,
                json_extract(movement.value, '$.description') AS descricao,
                CAST(json_extract(movement.value, '$.amount') AS REAL) AS valor
            FROM app_state
            JOIN json_each(
                COALESCE(app_state.state_json, '{}'),
                '$.cashMovements'
            ) AS movement
            WHERE app_state.id = 1;

            CREATE VIEW vw_fechamentos_caixa AS
            SELECT
                json_extract(closure.value, '$.id') AS id,
                COALESCE(
                    json_extract(closure.value, '$.sessionId'),
                    'SESSAO-' || json_extract(closure.value, '$.id')
                ) AS sessao_caixa_id,
                CAST(json_extract(closure.value, '$.openedAt') AS INTEGER)
                    AS abertura_ms,
                datetime(
                    CAST(json_extract(closure.value, '$.openedAt') AS INTEGER)
                        / 1000,
                    'unixepoch',
                    'localtime'
                ) AS abertura,
                CAST(json_extract(closure.value, '$.closedAt') AS INTEGER)
                    AS fechamento_ms,
                datetime(
                    CAST(json_extract(closure.value, '$.closedAt') AS INTEGER)
                        / 1000,
                    'unixepoch',
                    'localtime'
                ) AS fechamento,
                COALESCE(
                    json_extract(closure.value, '$.openedByOperatorName'),
                    'Não identificado'
                ) AS aberto_por,
                COALESCE(
                    json_extract(closure.value, '$.closedByOperatorName'),
                    'Não identificado'
                ) AS fechado_por,
                CAST(
                    json_extract(closure.value, '$.openingBalance') AS REAL
                ) AS saldo_inicial,
                CAST(
                    json_extract(closure.value, '$.expectedBalance') AS REAL
                ) AS saldo_esperado,
                CAST(
                    json_extract(closure.value, '$.countedBalance') AS REAL
                ) AS saldo_contado,
                CAST(json_extract(closure.value, '$.difference') AS REAL)
                    AS diferenca,
                CAST(json_extract(closure.value, '$.cashFund') AS REAL)
                    AS fundo_troco,
                CAST(
                    json_extract(closure.value, '$.withdrawalAmount') AS REAL
                ) AS retirada_fechamento,
                CAST(
                    json_extract(closure.value, '$.remainingBalance') AS REAL
                ) AS saldo_deixado
            FROM app_state
            JOIN json_each(
                COALESCE(app_state.state_json, '{}'),
                '$.cashClosures'
            ) AS closure
            WHERE app_state.id = 1;

            CREATE VIEW vw_operadores AS
            WITH perfis(id, nome) AS (
                VALUES ('elaine', 'Elaine'), ('poolblay', 'Poolblay')
            )
            SELECT
                perfis.id AS id,
                perfis.nome AS nome,
                CASE
                    WHEN json_type(
                        COALESCE(app_state.state_json, '{}'),
                        '$.operatorCredentials.' || perfis.id
                    ) = 'object'
                    THEN 1
                    ELSE 0
                END AS pin_configurado,
                CAST(
                    json_extract(
                        COALESCE(app_state.state_json, '{}'),
                        '$.operatorCredentials.' || perfis.id || '.updatedAt'
                    ) AS INTEGER
                ) AS pin_atualizado_em_ms
            FROM perfis
            CROSS JOIN app_state
            WHERE app_state.id = 1;
            """
        )

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
        if parsed_revision < 0 or (state is not None and not _is_pool_state(state)):
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
        if not _is_pool_state(state):
            raise ValueError("O estado não contém dados válidos do Pool Petiscos.")
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
                self.ensure_automatic_backups()
            except (OSError, sqlite3.Error):
                # O estado já foi confirmado. A falha de backup é informada
                # separadamente para não induzir o cliente a repetir a venda.
                pass
            return snapshot

    @staticmethod
    def _local_date(now: datetime):
        return now.astimezone().date() if now.tzinfo is not None else now.date()

    def _backup_period(self, tier: str, now: datetime) -> str:
        local_date = self._local_date(now)
        if tier == "daily":
            return local_date.isoformat()
        if tier == "weekly":
            iso_year, iso_week, _ = local_date.isocalendar()
            return f"{iso_year}-W{iso_week:02d}"
        if tier == "monthly":
            return f"{local_date.year:04d}-{local_date.month:02d}"
        raise ValueError(f"Categoria de backup desconhecida: {tier}")

    def _backup_path(self, tier: str, now: datetime) -> Path:
        labels = {
            "daily": "diario",
            "weekly": "semanal",
            "monthly": "mensal",
        }
        period = self._backup_period(tier, now)
        return self.backup_directory / (
            f"{BACKUP_PREFIX}{labels[tier]}-{period}{BACKUP_SUFFIX}"
        )

    def _daily_backup_path(self, now: datetime) -> Path:
        return self._backup_path("daily", now)

    def _write_verified_copy(self, destination: Path) -> None:
        """Create an atomic SQLite copy and verify it before publication."""

        temporary = destination.with_name(
            f".{destination.name}.{uuid.uuid4().hex}.tmp"
        )
        source = self._connect()
        target: sqlite3.Connection | None = None
        try:
            target = sqlite3.connect(temporary)
            source.backup(target)
            integrity = target.execute("PRAGMA integrity_check").fetchone()
            if integrity is None or integrity[0] != "ok":
                raise sqlite3.DatabaseError(
                    "A verificação da cópia SQLite falhou."
                )
            target.close()
            target = None
            os.replace(temporary, destination)
        finally:
            source.close()
            if target is not None:
                target.close()
            temporary.unlink(missing_ok=True)

    def export_database(self) -> bytes:
        """Return a verified snapshot suitable for a browser download."""

        destination = self.database_path.parent / (
            f".pool-petiscos-export-{uuid.uuid4().hex}.db"
        )
        with self._lock:
            try:
                self._write_verified_copy(destination)
                return destination.read_bytes()
            finally:
                destination.unlink(missing_ok=True)

    def ensure_daily_backup(self, *, force: bool = False) -> Path:
        return next(
            record.path
            for record in self.ensure_automatic_backups(force=force)
            if record.tier == "daily"
        )

    def ensure_automatic_backups(
        self, *, force: bool = False
    ) -> list[BackupRecord]:
        now = self._clock()
        created: list[BackupRecord] = []
        with self._lock:
            try:
                for tier in ("daily", "weekly", "monthly"):
                    destination = self._backup_path(tier, now)
                    if force or not destination.is_file():
                        self._write_verified_copy(destination)
                    created.append(self._backup_record(destination, tier))
                self._prune_automatic_backups()
                self._last_backup_error = None
                return created
            except (OSError, sqlite3.Error) as error:
                self._last_backup_error = str(error)
                raise

    def _backup_record(self, path: Path, tier: str) -> BackupRecord:
        stat = path.stat()
        name = path.name
        prefixes = {
            "daily": f"{BACKUP_PREFIX}diario-",
            "weekly": f"{BACKUP_PREFIX}semanal-",
            "monthly": f"{BACKUP_PREFIX}mensal-",
        }
        if name.startswith(prefixes[tier]):
            period = name.removeprefix(prefixes[tier]).removesuffix(BACKUP_SUFFIX)
        else:
            period = name.removeprefix(BACKUP_PREFIX).removesuffix(BACKUP_SUFFIX)
        return BackupRecord(
            filename=name,
            tier=tier,
            period=period,
            created_at=_utc_iso(
                datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
            ),
            size_bytes=stat.st_size,
            path=path,
        )

    def _daily_backups(self) -> list[Path]:
        current = [
            path
            for path in self.backup_directory.glob(
                f"{BACKUP_PREFIX}diario-????-??-??{BACKUP_SUFFIX}"
            )
            if path.is_file()
        ]
        legacy = [
            path
            for path in self.backup_directory.glob(
                f"{BACKUP_PREFIX}????-??-??{BACKUP_SUFFIX}"
            )
            if path.is_file()
        ]
        backups = current + legacy
        backups.sort(key=lambda path: path.name, reverse=True)
        return backups

    def _tier_backups(self, tier: str) -> list[Path]:
        if tier == "daily":
            return self._daily_backups()
        label = "semanal" if tier == "weekly" else "mensal"
        backups = [
            path
            for path in self.backup_directory.glob(
                f"{BACKUP_PREFIX}{label}-*{BACKUP_SUFFIX}"
            )
            if path.is_file()
        ]
        backups.sort(key=lambda path: path.name, reverse=True)
        return backups

    def _prune_automatic_backups(self) -> None:
        policies = {
            "daily": self._backup_retention,
            "weekly": self._weekly_backup_retention,
            "monthly": self._monthly_backup_retention,
        }
        for tier, retention in policies.items():
            for expired in self._tier_backups(tier)[retention:]:
                expired.unlink(missing_ok=True)

    def list_backups(self) -> list[BackupRecord]:
        with self._lock:
            records = [
                self._backup_record(path, tier)
                for tier in ("daily", "weekly", "monthly")
                for path in self._tier_backups(tier)
            ]
        records.sort(key=lambda item: item.created_at, reverse=True)
        return records

    def backup_path(self, filename: str) -> Path:
        if not filename or Path(filename).name != filename:
            raise ValueError("Nome de backup inválido.")
        allowed = {record.filename: record.path for record in self.list_backups()}
        try:
            return allowed[filename]
        except KeyError as error:
            raise FileNotFoundError("Backup não encontrado.") from error

    @staticmethod
    def _validate_database(path: Path) -> StateSnapshot:
        if not path.is_file():
            raise FileNotFoundError("O arquivo de backup não foi encontrado.")
        with closing(sqlite3.connect(path)) as connection:
            integrity = connection.execute("PRAGMA integrity_check").fetchone()
            if integrity is None or integrity[0] != "ok":
                raise sqlite3.DatabaseError("O arquivo SQLite está corrompido.")
            required = {"app_state", "state_history"}
            tables = {
                row[0]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                )
            }
            if not required.issubset(tables):
                raise sqlite3.DatabaseError(
                    "O arquivo não é um backup do Pool Petiscos."
                )
            row = connection.execute(
                "SELECT state_json, revision, saved_at FROM app_state WHERE id = 1"
            ).fetchone()
            if row is None:
                raise sqlite3.DatabaseError("O backup não contém o estado do caixa.")
            snapshot = StateStorage._decode_snapshot(row)
            if snapshot.state is None:
                raise sqlite3.DatabaseError("O backup está vazio.")
            if not _is_pool_state(snapshot.state):
                raise sqlite3.DatabaseError(
                    "O backup não contém um estado válido do Pool Petiscos."
                )
            return snapshot

    def restore_database(self, source: Path) -> StateSnapshot:
        source = source.expanduser().resolve()
        self._validate_database(source)
        with self._lock:
            timestamp = self._clock().astimezone(timezone.utc).strftime(
                "%Y%m%dT%H%M%SZ"
            )
            safety = self.backup_directory / (
                f"{BACKUP_PREFIX}antes-restauracao-{timestamp}-{uuid.uuid4().hex[:8]}"
                f"{BACKUP_SUFFIX}"
            )
            self._write_verified_copy(safety)
            temporary = self.database_path.with_name(
                f".{self.database_path.name}.{uuid.uuid4().hex}.restore"
            )
            database_replaced = False
            try:
                shutil.copyfile(source, temporary)
                self._validate_database(temporary)
                with closing(self._connect()) as connection:
                    connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                os.replace(temporary, self.database_path)
                database_replaced = True
                for suffix in ("-wal", "-shm"):
                    Path(f"{self.database_path}{suffix}").unlink(missing_ok=True)
                self._initialize()
                restored = self.read()
                self.ensure_automatic_backups(force=True)
            except Exception:
                if database_replaced and safety.is_file():
                    shutil.copyfile(safety, self.database_path)
                    for suffix in ("-wal", "-shm"):
                        Path(f"{self.database_path}{suffix}").unlink(missing_ok=True)
                    self._initialize()
                raise
            finally:
                temporary.unlink(missing_ok=True)
            safety_backups = sorted(
                self.backup_directory.glob(
                    f"{BACKUP_PREFIX}antes-restauracao-*{BACKUP_SUFFIX}"
                ),
                key=lambda path: path.name,
                reverse=True,
            )
            for expired in safety_backups[PRE_RESTORE_BACKUP_RETENTION:]:
                expired.unlink(missing_ok=True)
            return restored

    def last_backup_at(self) -> str | None:
        with self._lock:
            backups = [record.path for record in self.list_backups()]
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
