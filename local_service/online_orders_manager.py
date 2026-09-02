"""Background orchestration for the Pool Petiscos online-order inbox."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from collections.abc import Callable
from typing import Any, Mapping
from urllib.parse import urlsplit

from local_service.online_orders import (
    OnlineOrderStorage,
    OnlineOrdersApiError,
    OnlineOrdersClient,
    OnlineOrdersConfiguration,
    OnlineOrdersError,
    OnlineOrdersNetworkError,
    OutboxCommand,
)
from local_service.secure_store import ProtectedFileStore
from local_service.storage import StateStorage


ONLINE_API_URL_ENVIRONMENT_KEY = "POOL_ONLINE_API_URL"
ONLINE_INSTALLATION_TOKEN_ENVIRONMENT_KEY = "POOL_ONLINE_INSTALLATION_TOKEN"
ONLINE_PUBLIC_MENU_URL_ENVIRONMENT_KEY = "POOL_ONLINE_PUBLIC_MENU_URL"
ACTIVE_ORDER_STATUSES = ("pending", "accepted", "preparing", "ready")
logger = logging.getLogger("pool_petiscos.online_orders")


@dataclass(frozen=True)
class OnlineOrdersSettings:
    api_base_url: str
    installation_token: str
    public_menu_url: str
    enabled: bool = True

    def __post_init__(self) -> None:
        OnlineOrdersConfiguration(
            self.api_base_url,
            self.installation_token,
        )
        parsed_menu = urlsplit(self.public_menu_url.strip())
        if (
            parsed_menu.scheme != "https"
            or not parsed_menu.netloc
            or parsed_menu.username is not None
            or parsed_menu.password is not None
            or parsed_menu.fragment
        ):
            raise ValueError("O endereço público do cardápio deve usar HTTPS.")

    def protected_payload(self) -> bytes:
        return json.dumps(
            {
                "version": 1,
                "api_base_url": self.api_base_url.strip().rstrip("/"),
                "installation_token": self.installation_token.strip(),
                "public_menu_url": self.public_menu_url.strip(),
                "enabled": self.enabled,
            },
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")


def _read_settings_payload(payload: bytes) -> OnlineOrdersSettings:
    try:
        value = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("A configuração do cardápio online está inválida.") from error
    if not isinstance(value, dict) or value.get("version") != 1:
        raise ValueError("A configuração do cardápio online está inválida.")
    return OnlineOrdersSettings(
        api_base_url=str(value.get("api_base_url", "")),
        installation_token=str(value.get("installation_token", "")),
        public_menu_url=str(value.get("public_menu_url", "")),
        enabled=value.get("enabled") is True,
    )


def _iso_from_millis(value: int | None) -> str | None:
    if value is None or value <= 0:
        return None
    return (
        datetime.fromtimestamp(value / 1000, tz=timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )


def _money_cents(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("O preço de um produto é inválido.")
    cents = round(float(value) * 100)
    if cents < 0 or cents > 100_000_000:
        raise ValueError("O preço de um produto é inválido.")
    return cents


def _catalog_payload(state: Mapping[str, Any]) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]]]:
    raw_products = state.get("products")
    if not isinstance(raw_products, list):
        raise ValueError("O catálogo local está inválido.")
    categories: list[dict[str, Any]] = []
    category_positions: dict[str, int] = {}
    products: list[dict[str, Any]] = []
    for index, raw in enumerate(raw_products):
        if not isinstance(raw, dict):
            raise ValueError("O catálogo local está inválido.")
        product_id = str(raw.get("id", "")).strip()
        name = str(raw.get("name", "")).strip()
        category = str(raw.get("category", "")).strip()
        emoji = str(raw.get("emoji", "🍔")).strip() or "🍔"
        stock = raw.get("stock")
        if (
            not product_id
            or not name
            or not category
            or isinstance(stock, bool)
            or not isinstance(stock, int)
            or stock < 0
        ):
            raise ValueError("O catálogo local está inválido.")
        if category not in category_positions:
            category_positions[category] = len(categories)
            categories.append(
                {
                    "key": category,
                    "name": category,
                    "sortOrder": len(categories),
                }
            )
        products.append(
            {
                "id": product_id,
                "categoryKey": category,
                "name": name,
                "description": "",
                "imageUrl": None,
                "emoji": emoji[:16],
                "priceCents": _money_cents(raw.get("price")),
                "available": stock > 0,
                "visible": True,
                "sortOrder": index,
            }
        )
    canonical = json.dumps(
        {"categories": categories, "products": products},
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    fingerprint = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return fingerprint, categories, products


class OnlineOrdersManager:
    """Keeps the local inbox synchronized using outbound HTTPS only."""

    def __init__(
        self,
        state_storage: StateStorage,
        home_directory: Path,
        app_version: str,
        *,
        clock: Callable[[], float] = time.time,
        sync_interval_seconds: float = 5.0,
        client_factory: Callable[
            [OnlineOrdersConfiguration], OnlineOrdersClient
        ] = OnlineOrdersClient,
    ) -> None:
        self.state_storage = state_storage
        self.storage = OnlineOrderStorage(state_storage.database_path, clock=clock)
        self.settings_store = ProtectedFileStore(
            home_directory.expanduser().resolve()
            / "config"
            / "online-orders.bin"
        )
        self.app_version = app_version
        self._clock = clock
        self._sync_interval_seconds = max(5.0, sync_interval_seconds)
        self._client_factory = client_factory
        self._settings_lock = threading.RLock()
        self._lifecycle_lock = threading.RLock()
        self._sync_lock = threading.Lock()
        self._stop_event = threading.Event()
        self._wake_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._settings_error: str | None = None
        self._settings = self._load_settings()

    def _load_settings(self) -> OnlineOrdersSettings | None:
        try:
            if self.settings_store.exists():
                return _read_settings_payload(self.settings_store.load())
            api_url = os.environ.get(ONLINE_API_URL_ENVIRONMENT_KEY, "").strip()
            token = os.environ.get(
                ONLINE_INSTALLATION_TOKEN_ENVIRONMENT_KEY, ""
            ).strip()
            public_url = os.environ.get(
                ONLINE_PUBLIC_MENU_URL_ENVIRONMENT_KEY, ""
            ).strip()
            if api_url and token and public_url:
                return OnlineOrdersSettings(api_url, token, public_url, True)
        except (OSError, ValueError) as error:
            self._settings_error = str(error)
        return None

    def configure(self, settings: OnlineOrdersSettings) -> dict[str, Any]:
        self.settings_store.save(settings.protected_payload())
        with self._settings_lock:
            self._settings = settings
            self._settings_error = None
        self._wake_event.set()
        return self.status()

    def update_enabled(self, enabled: bool) -> dict[str, Any]:
        with self._settings_lock:
            current = self._settings
            if current is None:
                raise ValueError("A conexão do cardápio ainda não foi configurada.")
            updated = OnlineOrdersSettings(
                current.api_base_url,
                current.installation_token,
                current.public_menu_url,
                bool(enabled),
            )
        return self.configure(updated)

    def start(self) -> None:
        with self._lifecycle_lock:
            if self._thread is not None and self._thread.is_alive():
                return
            self._stop_event.clear()
            self._thread = threading.Thread(
                target=self._run,
                name="pool-online-orders",
                daemon=True,
            )
            self._thread.start()

    def ensure_running(self) -> bool:
        """Ensure a crashed or interrupted worker is recreated before use."""

        with self._lifecycle_lock:
            running = self._thread is not None and self._thread.is_alive()
        if not running:
            self.start()
        return self.is_running()

    def is_running(self) -> bool:
        with self._lifecycle_lock:
            return self._thread is not None and self._thread.is_alive()

    def stop(self) -> None:
        with self._lifecycle_lock:
            self._stop_event.set()
            self._wake_event.set()
            thread = self._thread
        if thread is not None and thread.is_alive():
            thread.join(timeout=5)
        with self._lifecycle_lock:
            if self._thread is thread:
                self._thread = None

    def _run(self) -> None:
        while not self._stop_event.is_set():
            try:
                self.sync_once()
            except Exception as error:
                # Uma falha inesperada não pode encerrar silenciosamente o
                # recebimento de pedidos. Registra o diagnóstico e tenta de
                # novo no próximo ciclo; BaseException continua reservada para
                # encerramentos reais do processo.
                logger.exception("Falha no ciclo automático de pedidos online.")
                message = str(error).strip() or "Falha inesperada na sincronização."
                try:
                    self.storage.record_error(message)
                except Exception:
                    logger.exception(
                        "Não foi possível registrar a falha da sincronização."
                    )
            self._wake_event.wait(self._sync_interval_seconds)
            self._wake_event.clear()

    def sync_now(self) -> dict[str, Any]:
        """Synchronize immediately and restore the worker if it had stopped."""

        try:
            return self.sync_once()
        finally:
            # Mesmo quando a consulta manual falha, a próxima tentativa
            # automática deve continuar agendada.
            thread = self._thread
            if thread is None or not thread.is_alive():
                self.start()

    def _settings_snapshot(self) -> OnlineOrdersSettings | None:
        with self._settings_lock:
            return self._settings

    def _client(self) -> OnlineOrdersClient:
        settings = self._settings_snapshot()
        if settings is None:
            raise ValueError("A conexão do cardápio ainda não foi configurada.")
        return self._client_factory(
            OnlineOrdersConfiguration(
                settings.api_base_url,
                settings.installation_token,
            )
        )

    def sync_once(self) -> dict[str, Any]:
        settings = self._settings_snapshot()
        if settings is None:
            return self._snapshot_data()
        if not self._sync_lock.acquire(blocking=False):
            return self._snapshot_data()
        try:
            self.storage.ensure_initialized()
            client = self._client()
            snapshot = self.state_storage.read()
            state = snapshot.state or {}
            heartbeat = client.heartbeat(
                cash_open=state.get("cashOpen") is True,
                orders_enabled=settings.enabled,
                app_version=self.app_version,
                local_revision=snapshot.revision,
            )
            self.storage.record_heartbeat(heartbeat)

            fingerprint, categories, products = _catalog_payload(state)
            sync_state = self.storage.sync_state()
            if fingerprint != sync_state.catalog_fingerprint:
                publication_revision = max(
                    snapshot.revision,
                    (sync_state.source_revision or 0) + 1,
                    int(self._clock() * 1000),
                )
                publication = client.sync_catalog(
                    source_revision=publication_revision,
                    categories=categories,
                    products=products,
                )
                self.storage.record_catalog_publication(
                    source_revision=publication_revision,
                    response=publication,
                    catalog_fingerprint=fingerprint,
                )

            self._flush_outbox(client)
            for _ in range(10):
                sync_state = self.storage.sync_state()
                page = client.poll_order_events(
                    after=sync_state.event_cursor,
                    limit=50,
                )
                ingested = self.storage.ingest_event_page(page)
                if not ingested.has_more:
                    break
            return self._snapshot_data()
        except (OSError, ValueError, OnlineOrdersError) as error:
            self.storage.record_error(str(error))
            raise
        finally:
            self._sync_lock.release()

    def _flush_outbox(self, client: OnlineOrdersClient) -> None:
        for command in self.storage.pending_actions(limit=20):
            try:
                self._deliver_command(client, command)
            except OnlineOrdersApiError as error:
                permanent = 400 <= error.status < 500 and error.status != 429
                self.storage.mark_action_failed(
                    command.mutation_id,
                    str(error),
                    retry_after_seconds=60 if error.status == 429 else 15,
                    permanent=permanent,
                )
            except OnlineOrdersNetworkError as error:
                self.storage.mark_action_failed(
                    command.mutation_id,
                    str(error),
                    retry_after_seconds=15,
                )

    def _deliver_command(
        self,
        client: OnlineOrdersClient,
        command: OutboxCommand,
    ) -> dict[str, Any]:
        payload = command.payload
        response = client.send_action(
            command.order_id,
            action=command.action,
            expected_version=command.expected_version,
            local_mutation_id=command.mutation_id,
            reason=str(payload.get("reason", "")),
            local_sale_id=(
                str(payload["localSaleId"])
                if "localSaleId" in payload
                else None
            ),
            payment_method=(
                str(payload["paymentMethod"])
                if "paymentMethod" in payload
                else None
            ),
        )
        remote_order = response.get("order")
        if not isinstance(remote_order, Mapping):
            raise OnlineOrdersError("A API não devolveu o pedido atualizado.")
        self.storage.mark_action_delivered(
            command.mutation_id,
            remote_order=remote_order,
        )
        return dict(remote_order)

    def perform_action(
        self,
        order_id: str,
        *,
        action: str,
        expected_version: int,
        mutation_id: str,
        reason: str = "",
        local_sale_id: str | None = None,
        payment_method: str | None = None,
    ) -> dict[str, Any]:
        command = self.storage.enqueue_action(
            order_id,
            action=action,
            expected_version=expected_version,
            mutation_id=mutation_id,
            reason=reason,
            local_sale_id=local_sale_id,
            payment_method=payment_method,
        )
        settings = self._settings_snapshot()
        if settings is None or not settings.enabled:
            return {"order": self.storage.get_order(order_id), "queued": True}
        try:
            order = self._deliver_command(self._client(), command)
            return {"order": order, "queued": False}
        except OnlineOrdersApiError as error:
            permanent = 400 <= error.status < 500 and error.status != 429
            self.storage.mark_action_failed(
                command.mutation_id,
                str(error),
                retry_after_seconds=60 if error.status == 429 else 15,
                permanent=permanent,
            )
            if permanent:
                raise
            return {"order": self.storage.get_order(order_id), "queued": True}
        except OnlineOrdersNetworkError as error:
            self.storage.mark_action_failed(
                command.mutation_id,
                str(error),
                retry_after_seconds=15,
            )
            return {"order": self.storage.get_order(order_id), "queued": True}

    def status(self) -> dict[str, Any]:
        self.storage.ensure_initialized()
        settings = self._settings_snapshot()
        state = self.storage.sync_state()
        now_ms = int(self._clock() * 1000)
        connected = bool(
            settings
            and state.last_heartbeat_at
            and now_ms - state.last_heartbeat_at <= 45_000
        )
        active_orders = self.storage.list_orders(
            statuses=ACTIVE_ORDER_STATUSES,
            limit=500,
        )
        pending_count = sum(
            1 for order in active_orders if order.get("status") == "pending"
        )
        return {
            "configured": settings is not None,
            "enabled": bool(settings and settings.enabled),
            "connected": connected,
            "acceptingOrders": bool(connected and state.accepting_orders),
            "lastSyncAt": _iso_from_millis(state.last_heartbeat_at),
            "lastError": self._settings_error or state.last_error,
            "publicMenuUrl": settings.public_menu_url if settings else None,
            "pendingCount": pending_count,
            "workerRunning": self.is_running(),
            "syncIntervalSeconds": self._sync_interval_seconds,
        }

    def snapshot(self) -> dict[str, Any]:
        self.ensure_running()
        return self._snapshot_data()

    def _snapshot_data(self) -> dict[str, Any]:
        return {
            "orders": self.storage.list_orders(limit=200),
            "status": self.status(),
        }


__all__ = [
    "OnlineOrdersManager",
    "OnlineOrdersSettings",
]
