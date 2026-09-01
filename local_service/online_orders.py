"""Outbound client and isolated SQLite inbox for Pool Petiscos online orders.

This module deliberately has no HTTP server and never reads or writes ``app_state``.
The launcher/service can compose it later with the existing local application while
the browser-facing ordering API remains the only public network surface.
"""

from __future__ import annotations

import json
import math
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections.abc import Callable, Mapping, Sequence
from contextlib import closing
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


MAX_RESPONSE_BYTES = 2 * 1024 * 1024
ORDER_ACTIONS = frozenset({"accept", "reject", "start", "ready", "complete", "cancel"})
PAYMENT_METHODS = frozenset({"Pix", "Dinheiro", "Débito", "Crédito"})
ORDER_STATUSES = frozenset(
    {
        "pending",
        "accepted",
        "preparing",
        "ready",
        "completed",
        "rejected",
        "cancelled",
        "expired",
    }
)


class OnlineOrdersError(RuntimeError):
    """Base error raised by the online-orders integration."""


class OnlineOrdersNetworkError(OnlineOrdersError):
    """The remote API could not be reached."""


class OnlineOrdersApiError(OnlineOrdersError):
    """The remote API returned a non-success response."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code


class InvalidRemotePayloadError(OnlineOrdersError):
    """The remote response or event page does not satisfy the local contract."""


class IdempotencyConflictError(OnlineOrdersError):
    """A mutation identifier was reused with different action data."""


@dataclass(frozen=True)
class OnlineOrdersConfiguration:
    """Runtime-only remote configuration.

    ``installation_token`` is excluded from ``repr`` and is never persisted by
    :class:`OnlineOrderStorage`. The caller remains responsible for loading it
    from an OS-protected store.
    """

    api_base_url: str
    installation_token: str = field(repr=False)
    timeout_seconds: float = 15.0

    def __post_init__(self) -> None:
        parsed = urllib.parse.urlsplit(self.api_base_url.strip())
        if (
            parsed.scheme != "https"
            or not parsed.netloc
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("A API de pedidos precisa usar uma URL HTTPS válida.")
        if len(self.installation_token.strip()) < 32:
            raise ValueError("O token da instalação é inválido.")
        if not 0 < float(self.timeout_seconds) <= 60:
            raise ValueError("O tempo limite da API deve ficar entre 0 e 60 segundos.")

    @property
    def normalized_base_url(self) -> str:
        return self.api_base_url.strip().rstrip("/")


@dataclass(frozen=True)
class HttpResponse:
    status: int
    headers: Mapping[str, str]
    body: bytes


HttpTransport = Callable[[urllib.request.Request, float], HttpResponse]


class _RejectRedirects(urllib.request.HTTPRedirectHandler):
    """Do not forward the installation bearer token to a redirected host."""

    def redirect_request(self, request: Any, *args: Any, **kwargs: Any) -> None:
        return None


def urllib_transport(request: urllib.request.Request, timeout: float) -> HttpResponse:
    """Execute one request with urllib and preserve error response bodies."""

    try:
        opener = urllib.request.build_opener(_RejectRedirects())
        with opener.open(request, timeout=timeout) as response:
            body = response.read(MAX_RESPONSE_BYTES + 1)
            if len(body) > MAX_RESPONSE_BYTES:
                raise InvalidRemotePayloadError("A API devolveu uma resposta muito grande.")
            return HttpResponse(response.status, dict(response.headers.items()), body)
    except urllib.error.HTTPError as error:
        body = error.read(MAX_RESPONSE_BYTES + 1)
        if len(body) > MAX_RESPONSE_BYTES:
            body = b""
        headers = dict(error.headers.items()) if error.headers is not None else {}
        return HttpResponse(error.code, headers, body)
    except (OSError, TimeoutError, urllib.error.URLError) as error:
        raise OnlineOrdersNetworkError(
            "Não foi possível conectar ao cardápio online. Confira a internet."
        ) from error


class OnlineOrdersClient:
    """Small authenticated client for the operator-only cloud endpoints."""

    def __init__(
        self,
        configuration: OnlineOrdersConfiguration,
        *,
        transport: HttpTransport = urllib_transport,
    ) -> None:
        self.configuration = configuration
        self._transport = transport

    def heartbeat(
        self,
        *,
        cash_open: bool,
        orders_enabled: bool,
        app_version: str,
        local_revision: int,
    ) -> dict[str, Any]:
        return self._json_request(
            "/api/v1/operator/heartbeat",
            method="POST",
            payload={
                "cashOpen": bool(cash_open),
                "ordersEnabled": bool(orders_enabled),
                "appVersion": str(app_version).strip(),
                "localRevision": _non_negative_integer(local_revision, "local_revision"),
            },
        )

    def sync_catalog(
        self,
        *,
        source_revision: int,
        categories: Sequence[Mapping[str, Any]],
        products: Sequence[Mapping[str, Any]],
    ) -> dict[str, Any]:
        return self._json_request(
            "/api/v1/operator/catalog",
            method="PUT",
            payload={
                "sourceRevision": _non_negative_integer(source_revision, "source_revision"),
                "categories": [dict(category) for category in categories],
                "products": [dict(product) for product in products],
            },
        )

    def poll_order_events(self, *, after: int, limit: int = 50) -> dict[str, Any]:
        cursor = _non_negative_integer(after, "after")
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 100:
            raise ValueError("limit deve ficar entre 1 e 100.")
        query = urllib.parse.urlencode({"after": cursor, "limit": limit})
        return self._json_request(f"/api/v1/operator/order-events?{query}")

    def send_action(
        self,
        order_id: str,
        *,
        action: str,
        expected_version: int,
        local_mutation_id: str,
        reason: str = "",
        local_sale_id: str | None = None,
        payment_method: str | None = None,
    ) -> dict[str, Any]:
        clean_order_id = _bounded_text(order_id, "order_id", 160, required=True)
        clean_action = str(action).strip().lower()
        if clean_action not in ORDER_ACTIONS:
            raise ValueError("Ação de pedido inválida.")
        clean_mutation_id = _bounded_text(
            local_mutation_id, "local_mutation_id", 100, required=True
        )
        if len(clean_mutation_id) < 16 or not all(
            character.isalnum() or character in "_-" for character in clean_mutation_id
        ):
            raise ValueError("Identificador de mutação inválido.")
        payload: dict[str, Any] = {
            "action": clean_action,
            "expectedVersion": _positive_integer(expected_version, "expected_version"),
            "localMutationId": clean_mutation_id,
        }
        clean_reason = _bounded_text(reason, "reason", 180)
        if clean_reason:
            payload["reason"] = clean_reason
        if local_sale_id is not None:
            payload["localSaleId"] = _bounded_text(
                local_sale_id, "local_sale_id", 120, required=True
            )
        if payment_method is not None:
            payload["paymentMethod"] = _bounded_text(
                payment_method, "payment_method", 20, required=True
            )
        if clean_action == "complete" and (
            "localSaleId" not in payload or "paymentMethod" not in payload
        ):
            raise ValueError("Concluir um pedido exige a venda local e a forma de pagamento.")
        encoded_id = urllib.parse.quote(clean_order_id, safe="")
        return self._json_request(
            f"/api/v1/operator/orders/{encoded_id}/actions",
            method="POST",
            payload=payload,
        )

    def _json_request(
        self,
        path: str,
        *,
        method: str = "GET",
        payload: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        data = None
        if payload is not None:
            data = _canonical_json(payload).encode("utf-8")
        request = urllib.request.Request(
            f"{self.configuration.normalized_base_url}{path}",
            data=data,
            method=method,
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {self.configuration.installation_token.strip()}",
                "Content-Type": "application/json; charset=utf-8",
                "User-Agent": "PoolPetiscos-LocalService/1",
            },
        )
        response = self._transport(request, float(self.configuration.timeout_seconds))
        body = _decode_json_object(response.body)
        if not 200 <= response.status < 300:
            error = body.get("error")
            if isinstance(error, Mapping):
                code = str(error.get("code") or "REMOTE_ERROR")[:80]
                message = str(error.get("message") or "A API recusou a operação.")[:500]
            else:
                code = "REMOTE_ERROR"
                message = "A API recusou a operação."
            raise OnlineOrdersApiError(response.status, code, message)
        return body


@dataclass(frozen=True)
class SyncState:
    event_cursor: int
    remote_event_cursor: int
    source_revision: int | None
    catalog_version: int | None
    catalog_fingerprint: str | None
    accepting_orders: bool
    last_heartbeat_at: int | None
    last_event_poll_at: int | None
    last_error: str | None
    updated_at: int


@dataclass(frozen=True)
class IngestResult:
    received_events: int
    changed_orders: int
    event_cursor: int
    has_more: bool


@dataclass(frozen=True)
class OutboxCommand:
    mutation_id: str
    order_id: str
    action: str
    expected_version: int
    payload: dict[str, Any]
    state: str
    attempts: int
    next_attempt_at: int
    last_error: str | None
    created_at: int
    updated_at: int


class OnlineOrderStorage:
    """SQLite inbox/outbox isolated from the cashier's atomic ``app_state``.

    A caller may point this class at the existing database file or at a dedicated
    companion database. Only tables prefixed with ``external_`` are managed.
    """

    def __init__(
        self,
        database_path: Path,
        *,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.database_path = Path(database_path).expanduser().resolve()
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._clock = clock
        self._lock = threading.RLock()
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            self.database_path,
            timeout=5,
            isolation_level=None,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 5000")
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _initialize(self) -> None:
        with self._lock, closing(self._connect()) as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.execute("PRAGMA synchronous = FULL")
            connection.execute("BEGIN IMMEDIATE")
            try:
                connection.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS external_sync_state (
                        id INTEGER PRIMARY KEY CHECK (id = 1),
                        event_cursor INTEGER NOT NULL DEFAULT 0 CHECK (event_cursor >= 0),
                        remote_event_cursor INTEGER NOT NULL DEFAULT 0
                            CHECK (remote_event_cursor >= 0),
                        source_revision INTEGER CHECK (source_revision >= 0),
                        catalog_version INTEGER CHECK (catalog_version >= 0),
                        catalog_fingerprint TEXT,
                        accepting_orders INTEGER NOT NULL DEFAULT 0
                            CHECK (accepting_orders IN (0, 1)),
                        last_heartbeat_at INTEGER,
                        last_event_poll_at INTEGER,
                        last_error TEXT,
                        updated_at INTEGER NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS external_orders (
                        external_order_id TEXT PRIMARY KEY,
                        order_number INTEGER NOT NULL CHECK (order_number > 0),
                        status TEXT NOT NULL CHECK (status IN (
                            'pending', 'accepted', 'preparing', 'ready', 'completed',
                            'rejected', 'cancelled', 'expired'
                        )),
                        version INTEGER NOT NULL CHECK (version > 0),
                        fulfillment_mode TEXT NOT NULL CHECK (
                            fulfillment_mode IN ('table', 'pickup')
                        ),
                        table_label TEXT,
                        customer_name TEXT NOT NULL,
                        customer_note TEXT NOT NULL DEFAULT '',
                        payment_method TEXT NOT NULL,
                        subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
                        surcharge_rate REAL NOT NULL DEFAULT 0 CHECK (surcharge_rate >= 0),
                        surcharge_cents INTEGER NOT NULL DEFAULT 0
                            CHECK (surcharge_cents >= 0),
                        total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
                        catalog_version INTEGER NOT NULL CHECK (catalog_version >= 0),
                        local_sale_id TEXT,
                        rejection_reason TEXT,
                        remote_created_at INTEGER NOT NULL,
                        remote_updated_at INTEGER NOT NULL,
                        expires_at INTEGER NOT NULL,
                        last_event_cursor INTEGER NOT NULL DEFAULT 0
                            CHECK (last_event_cursor >= 0),
                        snapshot_json TEXT NOT NULL,
                        received_at INTEGER NOT NULL,
                        updated_at INTEGER NOT NULL
                    );

                    CREATE INDEX IF NOT EXISTS idx_external_orders_status_created
                    ON external_orders (status, remote_created_at, order_number);

                    CREATE TABLE IF NOT EXISTS external_order_items (
                        external_order_id TEXT NOT NULL REFERENCES
                            external_orders(external_order_id) ON DELETE CASCADE,
                        item_id TEXT NOT NULL,
                        product_id TEXT NOT NULL,
                        name TEXT NOT NULL,
                        unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
                        quantity INTEGER NOT NULL CHECK (quantity > 0),
                        note TEXT NOT NULL DEFAULT '',
                        line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0),
                        sort_order INTEGER NOT NULL DEFAULT 0,
                        PRIMARY KEY (external_order_id, item_id)
                    );

                    CREATE INDEX IF NOT EXISTS idx_external_order_items_order
                    ON external_order_items (external_order_id, sort_order);

                    CREATE TABLE IF NOT EXISTS external_outbox (
                        mutation_id TEXT PRIMARY KEY,
                        external_order_id TEXT NOT NULL REFERENCES
                            external_orders(external_order_id) ON DELETE CASCADE,
                        action TEXT NOT NULL CHECK (action IN (
                            'accept', 'reject', 'start', 'ready', 'complete', 'cancel'
                        )),
                        expected_version INTEGER NOT NULL CHECK (expected_version > 0),
                        payload_json TEXT NOT NULL,
                        state TEXT NOT NULL DEFAULT 'pending'
                            CHECK (state IN ('pending', 'delivered', 'failed')),
                        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
                        next_attempt_at INTEGER NOT NULL,
                        last_error TEXT,
                        created_at INTEGER NOT NULL,
                        updated_at INTEGER NOT NULL
                    );

                    CREATE INDEX IF NOT EXISTS idx_external_outbox_ready
                    ON external_outbox (state, next_attempt_at, created_at);
                    """
                )
                sync_columns = {
                    str(row[1])
                    for row in connection.execute(
                        "PRAGMA table_info(external_sync_state)"
                    ).fetchall()
                }
                if "catalog_fingerprint" not in sync_columns:
                    connection.execute(
                        "ALTER TABLE external_sync_state "
                        "ADD COLUMN catalog_fingerprint TEXT"
                    )
                now = self._now_ms()
                connection.execute(
                    """
                    INSERT OR IGNORE INTO external_sync_state (
                        id, event_cursor, remote_event_cursor, accepting_orders, updated_at
                    ) VALUES (1, 0, 0, 0, ?)
                    """,
                    (now,),
                )
                connection.commit()
            except Exception:
                if connection.in_transaction:
                    connection.rollback()
                raise

    def ensure_initialized(self) -> None:
        """Recreate integration tables after a full database restore."""

        self._initialize()

    def sync_state(self) -> SyncState:
        with self._lock, closing(self._connect()) as connection:
            row = connection.execute(
                "SELECT * FROM external_sync_state WHERE id = 1"
            ).fetchone()
        if row is None:
            raise sqlite3.DatabaseError("O estado da sincronização não foi inicializado.")
        return SyncState(
            event_cursor=int(row["event_cursor"]),
            remote_event_cursor=int(row["remote_event_cursor"]),
            source_revision=(
                int(row["source_revision"]) if row["source_revision"] is not None else None
            ),
            catalog_version=(
                int(row["catalog_version"]) if row["catalog_version"] is not None else None
            ),
            catalog_fingerprint=(
                str(row["catalog_fingerprint"])
                if row["catalog_fingerprint"] is not None
                else None
            ),
            accepting_orders=bool(row["accepting_orders"]),
            last_heartbeat_at=(
                int(row["last_heartbeat_at"])
                if row["last_heartbeat_at"] is not None
                else None
            ),
            last_event_poll_at=(
                int(row["last_event_poll_at"])
                if row["last_event_poll_at"] is not None
                else None
            ),
            last_error=str(row["last_error"]) if row["last_error"] is not None else None,
            updated_at=int(row["updated_at"]),
        )

    def record_heartbeat(self, response: Mapping[str, Any]) -> SyncState:
        remote_cursor = _non_negative_integer(response.get("eventCursor"), "eventCursor")
        catalog_version = _non_negative_integer(
            response.get("catalogVersion"), "catalogVersion"
        )
        server_time = _non_negative_integer(response.get("serverTime"), "serverTime")
        accepting = response.get("acceptingOrders") is True
        now = self._now_ms()
        with self._write_connection() as connection:
            connection.execute(
                """
                UPDATE external_sync_state SET
                    remote_event_cursor = MAX(remote_event_cursor, ?),
                    catalog_version = CASE
                        WHEN catalog_version IS NULL OR ? > catalog_version THEN ?
                        ELSE catalog_version
                    END,
                    accepting_orders = CASE
                        WHEN last_heartbeat_at IS NULL OR ? >= last_heartbeat_at THEN ?
                        ELSE accepting_orders
                    END,
                    last_heartbeat_at = MAX(COALESCE(last_heartbeat_at, 0), ?),
                    last_error = NULL, updated_at = ?
                WHERE id = 1
                """,
                (
                    remote_cursor,
                    catalog_version,
                    catalog_version,
                    server_time,
                    1 if accepting else 0,
                    server_time,
                    now,
                ),
            )
        return self.sync_state()

    def record_catalog_publication(
        self,
        *,
        source_revision: int,
        response: Mapping[str, Any],
        catalog_fingerprint: str | None = None,
    ) -> SyncState:
        revision = _non_negative_integer(source_revision, "source_revision")
        catalog_version = _non_negative_integer(
            response.get("catalogVersion"), "catalogVersion"
        )
        now = self._now_ms()
        clean_fingerprint = (
            _bounded_text(
                catalog_fingerprint,
                "catalog_fingerprint",
                128,
                required=True,
            )
            if catalog_fingerprint is not None
            else None
        )
        with self._write_connection() as connection:
            connection.execute(
                """
                UPDATE external_sync_state SET
                    source_revision = CASE
                        WHEN source_revision IS NULL OR ? > source_revision THEN ?
                        ELSE source_revision
                    END,
                    catalog_version = CASE
                        WHEN catalog_version IS NULL OR ? > catalog_version THEN ?
                        ELSE catalog_version
                    END,
                    catalog_fingerprint = COALESCE(?, catalog_fingerprint),
                    last_error = NULL, updated_at = ? WHERE id = 1
                """,
                (
                    revision,
                    revision,
                    catalog_version,
                    catalog_version,
                    clean_fingerprint,
                    now,
                ),
            )
        return self.sync_state()

    def record_error(self, message: str) -> SyncState:
        clean_message = _bounded_text(message, "message", 500, required=True)
        now = self._now_ms()
        with self._write_connection() as connection:
            connection.execute(
                "UPDATE external_sync_state SET last_error = ?, updated_at = ? WHERE id = 1",
                (clean_message, now),
            )
        return self.sync_state()

    def ingest_event_page(self, page: Mapping[str, Any]) -> IngestResult:
        events = page.get("events")
        if not isinstance(events, list):
            raise InvalidRemotePayloadError("A página de eventos não contém uma lista válida.")
        next_cursor = _non_negative_integer(page.get("nextCursor"), "nextCursor")
        has_more = page.get("hasMore") is True
        normalized: list[tuple[int, dict[str, Any]]] = []
        for event in events:
            if not isinstance(event, Mapping):
                raise InvalidRemotePayloadError("A página contém um evento inválido.")
            cursor = _positive_integer(event.get("cursor"), "cursor")
            order = event.get("order")
            if not isinstance(order, Mapping):
                raise InvalidRemotePayloadError("O evento não contém o pedido correspondente.")
            normalized.append((cursor, _normalize_order(order)))
        event_cursors = [cursor for cursor, _ in normalized]
        if event_cursors and (
            event_cursors != sorted(set(event_cursors)) or next_cursor != event_cursors[-1]
        ):
            raise InvalidRemotePayloadError("O cursor da página de eventos é inconsistente.")

        changed = 0
        now = self._now_ms()
        with self._write_connection() as connection:
            current_cursor = int(
                connection.execute(
                    "SELECT event_cursor FROM external_sync_state WHERE id = 1"
                ).fetchone()[0]
            )
            if not normalized and next_cursor > current_cursor:
                raise InvalidRemotePayloadError(
                    "Uma página vazia não pode avançar o cursor de eventos."
                )
            for cursor, order in normalized:
                if self._upsert_order(connection, order, cursor, now):
                    changed += 1
            consumed_cursor = max(current_cursor, next_cursor)
            connection.execute(
                """
                UPDATE external_sync_state SET event_cursor = ?,
                    remote_event_cursor = MAX(remote_event_cursor, ?),
                    last_event_poll_at = ?, last_error = NULL, updated_at = ?
                WHERE id = 1
                """,
                (consumed_cursor, consumed_cursor, now, now),
            )
        return IngestResult(len(normalized), changed, consumed_cursor, has_more)

    def get_order(self, external_order_id: str) -> dict[str, Any] | None:
        clean_id = _bounded_text(
            external_order_id, "external_order_id", 160, required=True
        )
        with self._lock, closing(self._connect()) as connection:
            row = connection.execute(
                """
                SELECT orders.snapshot_json,
                    EXISTS(
                        SELECT 1 FROM external_outbox AS outbox
                        WHERE outbox.external_order_id = orders.external_order_id
                          AND outbox.state = 'pending'
                    ) AS sync_pending
                FROM external_orders AS orders
                WHERE orders.external_order_id = ?
                """,
                (clean_id,),
            ).fetchone()
        if row is None:
            return None
        order = _decode_json_object(str(row["snapshot_json"]).encode("utf-8"))
        order["syncPending"] = bool(row["sync_pending"])
        return order

    def list_orders(
        self,
        *,
        statuses: Sequence[str] | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 500:
            raise ValueError("limit deve ficar entre 1 e 500.")
        parameters: list[Any] = []
        where = ""
        if statuses:
            clean_statuses = tuple(dict.fromkeys(str(status).strip() for status in statuses))
            if not clean_statuses or any(status not in ORDER_STATUSES for status in clean_statuses):
                raise ValueError("Filtro de status inválido.")
            placeholders = ",".join("?" for _ in clean_statuses)
            where = f"WHERE orders.status IN ({placeholders})"
            parameters.extend(clean_statuses)
        parameters.append(limit)
        with self._lock, closing(self._connect()) as connection:
            rows = connection.execute(
                f"""
                SELECT orders.snapshot_json,
                    EXISTS(
                        SELECT 1 FROM external_outbox AS outbox
                        WHERE outbox.external_order_id = orders.external_order_id
                          AND outbox.state = 'pending'
                    ) AS sync_pending
                FROM external_orders AS orders {where}
                ORDER BY orders.remote_created_at DESC, orders.order_number DESC LIMIT ?
                """,
                parameters,
            ).fetchall()
        orders: list[dict[str, Any]] = []
        for row in rows:
            order = _decode_json_object(
                str(row["snapshot_json"]).encode("utf-8")
            )
            order["syncPending"] = bool(row["sync_pending"])
            orders.append(order)
        return orders

    def enqueue_action(
        self,
        external_order_id: str,
        *,
        action: str,
        expected_version: int,
        mutation_id: str | None = None,
        reason: str = "",
        local_sale_id: str | None = None,
        payment_method: str | None = None,
    ) -> OutboxCommand:
        clean_order_id = _bounded_text(
            external_order_id, "external_order_id", 160, required=True
        )
        clean_action = str(action).strip().lower()
        if clean_action not in ORDER_ACTIONS:
            raise ValueError("Ação de pedido inválida.")
        version = _positive_integer(expected_version, "expected_version")
        clean_mutation_id = mutation_id or uuid.uuid4().hex
        clean_mutation_id = _bounded_text(
            clean_mutation_id, "mutation_id", 100, required=True
        )
        if len(clean_mutation_id) < 16 or not all(
            character.isalnum() or character in "_-" for character in clean_mutation_id
        ):
            raise ValueError("Identificador de mutação inválido.")
        payload: dict[str, Any] = {
            "action": clean_action,
            "expectedVersion": version,
            "localMutationId": clean_mutation_id,
        }
        clean_reason = _bounded_text(reason, "reason", 180)
        if clean_reason:
            payload["reason"] = clean_reason
        if local_sale_id is not None:
            payload["localSaleId"] = _bounded_text(
                local_sale_id, "local_sale_id", 120, required=True
            )
        if payment_method is not None:
            payload["paymentMethod"] = _bounded_text(
                payment_method, "payment_method", 20, required=True
            )
        if clean_action == "complete" and (
            "localSaleId" not in payload or "paymentMethod" not in payload
        ):
            raise ValueError("Concluir um pedido exige a venda local e a forma de pagamento.")
        serialized = _canonical_json(payload)
        now = self._now_ms()
        with self._write_connection() as connection:
            order_exists = connection.execute(
                "SELECT 1 FROM external_orders WHERE external_order_id = ?",
                (clean_order_id,),
            ).fetchone()
            if order_exists is None:
                raise ValueError("O pedido ainda não existe na caixa de entrada local.")
            existing = connection.execute(
                "SELECT external_order_id, payload_json FROM external_outbox WHERE mutation_id = ?",
                (clean_mutation_id,),
            ).fetchone()
            if existing is not None:
                if existing["external_order_id"] != clean_order_id or existing["payload_json"] != serialized:
                    raise IdempotencyConflictError(
                        "O identificador da ação já foi usado com outros dados."
                    )
            else:
                connection.execute(
                    """
                    INSERT INTO external_outbox (
                        mutation_id, external_order_id, action, expected_version,
                        payload_json, state, attempts, next_attempt_at,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)
                    """,
                    (
                        clean_mutation_id,
                        clean_order_id,
                        clean_action,
                        version,
                        serialized,
                        now,
                        now,
                        now,
                    ),
                )
        command = self.get_outbox_command(clean_mutation_id)
        if command is None:
            raise sqlite3.DatabaseError("A ação não foi gravada na fila local.")
        return command

    def get_outbox_command(self, mutation_id: str) -> OutboxCommand | None:
        clean_id = _bounded_text(mutation_id, "mutation_id", 100, required=True)
        with self._lock, closing(self._connect()) as connection:
            row = connection.execute(
                "SELECT * FROM external_outbox WHERE mutation_id = ?", (clean_id,)
            ).fetchone()
        return _row_to_outbox(row) if row is not None else None

    def pending_actions(self, *, limit: int = 20) -> list[OutboxCommand]:
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 100:
            raise ValueError("limit deve ficar entre 1 e 100.")
        now = self._now_ms()
        with self._lock, closing(self._connect()) as connection:
            rows = connection.execute(
                """
                SELECT * FROM external_outbox
                WHERE state = 'pending' AND next_attempt_at <= ?
                ORDER BY created_at, mutation_id LIMIT ?
                """,
                (now, limit),
            ).fetchall()
        return [_row_to_outbox(row) for row in rows]

    def mark_action_delivered(
        self, mutation_id: str, *, remote_order: Mapping[str, Any] | None = None
    ) -> OutboxCommand:
        clean_id = _bounded_text(mutation_id, "mutation_id", 100, required=True)
        normalized = _normalize_order(remote_order) if remote_order is not None else None
        now = self._now_ms()
        with self._write_connection() as connection:
            row = connection.execute(
                "SELECT external_order_id FROM external_outbox WHERE mutation_id = ?",
                (clean_id,),
            ).fetchone()
            if row is None:
                raise ValueError("A ação não existe na fila local.")
            if normalized is not None:
                if normalized["id"] != row["external_order_id"]:
                    raise InvalidRemotePayloadError(
                        "A resposta da ação pertence a outro pedido."
                    )
                current_cursor = int(
                    connection.execute(
                        "SELECT event_cursor FROM external_sync_state WHERE id = 1"
                    ).fetchone()[0]
                )
                self._upsert_order(connection, normalized, current_cursor, now)
            connection.execute(
                """
                UPDATE external_outbox SET state = 'delivered',
                    attempts = CASE
                        WHEN state = 'delivered' THEN attempts ELSE attempts + 1
                    END,
                    last_error = NULL, updated_at = ? WHERE mutation_id = ?
                """,
                (now, clean_id),
            )
        command = self.get_outbox_command(clean_id)
        if command is None:
            raise sqlite3.DatabaseError("A confirmação da ação não foi gravada.")
        return command

    def mark_action_failed(
        self,
        mutation_id: str,
        error: str,
        *,
        retry_after_seconds: float = 15.0,
        permanent: bool = False,
    ) -> OutboxCommand:
        clean_id = _bounded_text(mutation_id, "mutation_id", 100, required=True)
        clean_error = _bounded_text(error, "error", 500, required=True)
        if retry_after_seconds < 0 or retry_after_seconds > 86_400:
            raise ValueError("O intervalo de nova tentativa é inválido.")
        now = self._now_ms()
        next_attempt = now + int(retry_after_seconds * 1000)
        with self._write_connection() as connection:
            cursor = connection.execute(
                """
                UPDATE external_outbox SET state = ?, attempts = attempts + 1,
                    next_attempt_at = ?, last_error = ?, updated_at = ?
                WHERE mutation_id = ? AND state <> 'delivered'
                """,
                (
                    "failed" if permanent else "pending",
                    next_attempt,
                    clean_error,
                    now,
                    clean_id,
                ),
            )
            if cursor.rowcount != 1:
                existing = connection.execute(
                    "SELECT state FROM external_outbox WHERE mutation_id = ?",
                    (clean_id,),
                ).fetchone()
                if existing is None:
                    raise ValueError("A ação não existe na fila local.")
        command = self.get_outbox_command(clean_id)
        if command is None:
            raise sqlite3.DatabaseError("A falha da ação não foi gravada.")
        return command

    def _upsert_order(
        self,
        connection: sqlite3.Connection,
        order: Mapping[str, Any],
        event_cursor: int,
        now: int,
    ) -> bool:
        snapshot_json = _canonical_json(order)
        existing = connection.execute(
            """
            SELECT version, snapshot_json FROM external_orders
            WHERE external_order_id = ?
            """,
            (order["id"],),
        ).fetchone()
        if existing is not None and (
            order["version"] < int(existing["version"])
            or (
                order["version"] == int(existing["version"])
                and snapshot_json == str(existing["snapshot_json"])
            )
        ):
            connection.execute(
                """
                UPDATE external_orders SET last_event_cursor = MAX(last_event_cursor, ?),
                    updated_at = ? WHERE external_order_id = ?
                """,
                (event_cursor, now, order["id"]),
            )
            return False
        connection.execute(
            """
            INSERT INTO external_orders (
                external_order_id, order_number, status, version, fulfillment_mode,
                table_label, customer_name, customer_note, payment_method,
                subtotal_cents, surcharge_rate, surcharge_cents, total_cents,
                catalog_version, local_sale_id, rejection_reason, remote_created_at,
                remote_updated_at, expires_at, last_event_cursor, snapshot_json,
                received_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(external_order_id) DO UPDATE SET
                order_number = excluded.order_number, status = excluded.status,
                version = excluded.version, fulfillment_mode = excluded.fulfillment_mode,
                table_label = excluded.table_label, customer_name = excluded.customer_name,
                customer_note = excluded.customer_note, payment_method = excluded.payment_method,
                subtotal_cents = excluded.subtotal_cents,
                surcharge_rate = excluded.surcharge_rate,
                surcharge_cents = excluded.surcharge_cents, total_cents = excluded.total_cents,
                catalog_version = excluded.catalog_version,
                local_sale_id = excluded.local_sale_id,
                rejection_reason = excluded.rejection_reason,
                remote_created_at = excluded.remote_created_at,
                remote_updated_at = excluded.remote_updated_at,
                expires_at = excluded.expires_at,
                last_event_cursor = MAX(external_orders.last_event_cursor,
                    excluded.last_event_cursor),
                snapshot_json = excluded.snapshot_json, updated_at = excluded.updated_at
            WHERE excluded.version >= external_orders.version
            """,
            (
                order["id"],
                order["number"],
                order["status"],
                order["version"],
                order["fulfillmentMode"],
                order["tableLabel"],
                order["customerName"],
                order["customerNote"],
                order["paymentMethod"],
                order["subtotalCents"],
                order["surchargeRate"],
                order["surchargeCents"],
                order["totalCents"],
                order["catalogVersion"],
                order["localSaleId"],
                order["rejectionReason"],
                order["createdAt"],
                order["updatedAt"],
                order["expiresAt"],
                event_cursor,
                snapshot_json,
                now,
                now,
            ),
        )
        connection.execute(
            "DELETE FROM external_order_items WHERE external_order_id = ?",
            (order["id"],),
        )
        for index, item in enumerate(order["items"]):
            connection.execute(
                """
                INSERT INTO external_order_items (
                    external_order_id, item_id, product_id, name, unit_price_cents,
                    quantity, note, line_total_cents, sort_order
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    order["id"],
                    item["id"],
                    item["productId"],
                    item["name"],
                    item["unitPriceCents"],
                    item["quantity"],
                    item["note"],
                    item["lineTotalCents"],
                    index,
                ),
            )
        return True

    def _now_ms(self) -> int:
        return int(self._clock() * 1000)

    class _WriteContext:
        def __init__(self, owner: "OnlineOrderStorage") -> None:
            self.owner = owner
            self.connection: sqlite3.Connection | None = None

        def __enter__(self) -> sqlite3.Connection:
            self.owner._lock.acquire()
            try:
                self.connection = self.owner._connect()
                self.connection.execute("BEGIN IMMEDIATE")
                return self.connection
            except Exception:
                self.owner._lock.release()
                raise

        def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> None:
            try:
                if self.connection is not None:
                    if exc_type is None:
                        self.connection.commit()
                    elif self.connection.in_transaction:
                        self.connection.rollback()
                    self.connection.close()
            finally:
                self.owner._lock.release()

    def _write_connection(self) -> "OnlineOrderStorage._WriteContext":
        return self._WriteContext(self)


def _row_to_outbox(row: sqlite3.Row) -> OutboxCommand:
    return OutboxCommand(
        mutation_id=str(row["mutation_id"]),
        order_id=str(row["external_order_id"]),
        action=str(row["action"]),
        expected_version=int(row["expected_version"]),
        payload=_decode_json_object(str(row["payload_json"]).encode("utf-8")),
        state=str(row["state"]),
        attempts=int(row["attempts"]),
        next_attempt_at=int(row["next_attempt_at"]),
        last_error=str(row["last_error"]) if row["last_error"] is not None else None,
        created_at=int(row["created_at"]),
        updated_at=int(row["updated_at"]),
    )


def _normalize_order(value: Mapping[str, Any]) -> dict[str, Any]:
    status = _bounded_text(value.get("status"), "status", 20, required=True)
    if status not in ORDER_STATUSES:
        raise InvalidRemotePayloadError("O pedido remoto possui status inválido.")
    fulfillment = _bounded_text(
        value.get("fulfillmentMode"), "fulfillmentMode", 20, required=True
    )
    if fulfillment not in {"table", "pickup"}:
        raise InvalidRemotePayloadError("O tipo de retirada do pedido é inválido.")
    payment_method = _bounded_text(
        value.get("paymentMethod"), "paymentMethod", 30, required=True
    )
    if payment_method not in PAYMENT_METHODS:
        raise InvalidRemotePayloadError("A forma de pagamento do pedido é inválida.")
    raw_items = value.get("items")
    if not isinstance(raw_items, list) or not raw_items:
        raise InvalidRemotePayloadError("O pedido remoto não possui itens válidos.")
    items: list[dict[str, Any]] = []
    for raw_item in raw_items:
        if not isinstance(raw_item, Mapping):
            raise InvalidRemotePayloadError("Um item remoto é inválido.")
        item = {
            "id": _bounded_text(raw_item.get("id"), "item.id", 160, required=True),
            "productId": _bounded_text(
                raw_item.get("productId"), "item.productId", 160, required=True
            ),
            "name": _bounded_text(raw_item.get("name"), "item.name", 160, required=True),
            "unitPriceCents": _non_negative_integer(
                raw_item.get("unitPriceCents"), "item.unitPriceCents"
            ),
            "quantity": _positive_integer(raw_item.get("quantity"), "item.quantity"),
            "note": _bounded_text(raw_item.get("note", ""), "item.note", 300),
            "lineTotalCents": _non_negative_integer(
                raw_item.get("lineTotalCents"), "item.lineTotalCents"
            ),
        }
        if item["quantity"] > 20:
            raise InvalidRemotePayloadError("A quantidade de um item remoto é inválida.")
        if item["lineTotalCents"] != item["unitPriceCents"] * item["quantity"]:
            raise InvalidRemotePayloadError("O total de um item remoto é inconsistente.")
        items.append(item)
    if len(items) > 100 or len({item["id"] for item in items}) != len(items):
        raise InvalidRemotePayloadError("A lista de itens remotos é inválida.")

    table_label = value.get("tableLabel")
    local_sale_id = value.get("localSaleId")
    rejection_reason = value.get("rejectionReason")
    normalized = {
        "id": _bounded_text(value.get("id"), "id", 160, required=True),
        "number": _positive_integer(value.get("number"), "number"),
        "status": status,
        "version": _positive_integer(value.get("version"), "version"),
        "fulfillmentMode": fulfillment,
        "tableLabel": (
            _bounded_text(table_label, "tableLabel", 80, required=True)
            if table_label is not None
            else None
        ),
        "customerName": _bounded_text(
            value.get("customerName", ""), "customerName", 100
        ),
        "customerNote": _bounded_text(
            value.get("customerNote", ""), "customerNote", 500
        ),
        "paymentMethod": payment_method,
        "subtotalCents": _non_negative_integer(
            value.get("subtotalCents"), "subtotalCents"
        ),
        "surchargeRate": _non_negative_number(
            value.get("surchargeRate"), "surchargeRate"
        ),
        "surchargeCents": _non_negative_integer(
            value.get("surchargeCents"), "surchargeCents"
        ),
        "totalCents": _non_negative_integer(value.get("totalCents"), "totalCents"),
        "catalogVersion": _non_negative_integer(
            value.get("catalogVersion"), "catalogVersion"
        ),
        "localSaleId": (
            _bounded_text(local_sale_id, "localSaleId", 120, required=True)
            if local_sale_id is not None
            else None
        ),
        "rejectionReason": (
            _bounded_text(rejection_reason, "rejectionReason", 180, required=True)
            if rejection_reason is not None
            else None
        ),
        "createdAt": _non_negative_integer(value.get("createdAt"), "createdAt"),
        "updatedAt": _non_negative_integer(value.get("updatedAt"), "updatedAt"),
        "expiresAt": _non_negative_integer(value.get("expiresAt"), "expiresAt"),
        "items": items,
    }
    if fulfillment == "table" and normalized["tableLabel"] is None:
        raise InvalidRemotePayloadError("O pedido de mesa não informa a mesa.")
    if normalized["subtotalCents"] != sum(item["lineTotalCents"] for item in items):
        raise InvalidRemotePayloadError("O subtotal do pedido remoto é inconsistente.")
    if normalized["totalCents"] != normalized["subtotalCents"] + normalized["surchargeCents"]:
        raise InvalidRemotePayloadError("O total do pedido remoto é inconsistente.")
    return normalized


def _canonical_json(value: Mapping[str, Any]) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
        allow_nan=False,
    )


def _decode_json_object(body: bytes) -> dict[str, Any]:
    try:
        value = json.loads(body.decode("utf-8")) if body else {}
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise InvalidRemotePayloadError("A API devolveu uma resposta inválida.") from error
    if not isinstance(value, dict):
        raise InvalidRemotePayloadError("A API devolveu uma resposta inválida.")
    return value


def _bounded_text(
    value: Any,
    field_name: str,
    maximum: int,
    *,
    required: bool = False,
) -> str:
    if not isinstance(value, str):
        exception = InvalidRemotePayloadError if not isinstance(value, (type(None), str)) else ValueError
        raise exception(f"{field_name} deve ser um texto.")
    cleaned = value.strip()
    if len(cleaned) > maximum or (required and not cleaned):
        raise InvalidRemotePayloadError(f"{field_name} possui valor inválido.")
    return cleaned


def _non_negative_integer(value: Any, field_name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise InvalidRemotePayloadError(f"{field_name} deve ser um número inteiro positivo.")
    return value


def _positive_integer(value: Any, field_name: str) -> int:
    result = _non_negative_integer(value, field_name)
    if result <= 0:
        raise InvalidRemotePayloadError(f"{field_name} deve ser maior que zero.")
    return result


def _non_negative_number(value: Any, field_name: str) -> float:
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
        or value < 0
    ):
        raise InvalidRemotePayloadError(f"{field_name} deve ser um número positivo.")
    return float(value)


__all__ = [
    "HttpResponse",
    "IdempotencyConflictError",
    "IngestResult",
    "InvalidRemotePayloadError",
    "OnlineOrderStorage",
    "OnlineOrdersApiError",
    "OnlineOrdersClient",
    "OnlineOrdersConfiguration",
    "OnlineOrdersError",
    "OnlineOrdersNetworkError",
    "OutboxCommand",
    "SyncState",
    "urllib_transport",
]
