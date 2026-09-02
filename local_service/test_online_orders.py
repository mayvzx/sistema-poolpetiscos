from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
import urllib.request
from contextlib import closing
from pathlib import Path
from typing import Any

from local_service.online_orders import (
    HttpResponse,
    IdempotencyConflictError,
    InvalidRemotePayloadError,
    OnlineOrderStorage,
    OnlineOrdersApiError,
    OnlineOrdersClient,
    OnlineOrdersConfiguration,
)


TOKEN = "test-installation-token-that-is-long-enough"


def sample_order(*, version: int = 1, status: str = "pending") -> dict[str, Any]:
    return {
        "id": "order-001",
        "number": 41,
        "status": status,
        "version": version,
        "fulfillmentMode": "table",
        "tableLabel": "Mesa 04",
        "customerName": "",
        "customerNote": "Sem cebola",
        "paymentMethod": "Pix",
        "subtotalCents": 2500,
        "surchargeRate": 0,
        "surchargeCents": 0,
        "totalCents": 2500,
        "catalogVersion": 7,
        "localSaleId": None,
        "rejectionReason": None,
        "createdAt": 1_788_230_000_000,
        "updatedAt": 1_788_230_000_000 + version,
        "expiresAt": 1_788_230_600_000,
        "items": [
            {
                "id": "item-001",
                "productId": "xbacon-trad",
                "name": "X-Bacon tradicional",
                "unitPriceCents": 1250,
                "quantity": 2,
                "note": "",
                "lineTotalCents": 2500,
            }
        ],
    }


def event_page(*, cursor: int, order: dict[str, Any], has_more: bool = False) -> dict[str, Any]:
    return {
        "events": [
            {
                "cursor": cursor,
                "type": f"order.{order['status']}",
                "orderVersion": order["version"],
                "createdAt": order["updatedAt"],
                "order": order,
            }
        ],
        "nextCursor": cursor,
        "hasMore": has_more,
    }


class OnlineOrderStorageTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.clock_value = 1_788_230_000.0
        self.path = Path(self.temporary.name) / "online-orders.sqlite3"
        self.storage = OnlineOrderStorage(self.path, clock=lambda: self.clock_value)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_initializes_only_external_tables_and_keeps_cursors_distinct(self) -> None:
        with closing(sqlite3.connect(self.path)) as connection:
            tables = {
                row[0]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                )
            }
        self.assertNotIn("app_state", tables)
        self.assertTrue(
            {
                "external_sync_state",
                "external_orders",
                "external_order_items",
                "external_outbox",
            }.issubset(tables)
        )

        state = self.storage.record_heartbeat(
            {
                "eventCursor": 12,
                "catalogVersion": 5,
                "serverTime": 1_788_230_100_000,
                "acceptingOrders": True,
            }
        )
        self.assertEqual(state.event_cursor, 0)
        self.assertEqual(state.remote_event_cursor, 12)
        self.assertTrue(state.accepting_orders)

        stale_state = self.storage.record_heartbeat(
            {
                "eventCursor": 7,
                "catalogVersion": 3,
                "serverTime": 1_788_230_050_000,
                "acceptingOrders": False,
            }
        )
        self.assertEqual(stale_state.remote_event_cursor, 12)
        self.assertEqual(stale_state.catalog_version, 5)
        self.assertTrue(stale_state.accepting_orders)

    def test_existing_app_state_and_schema_version_are_not_modified(self) -> None:
        other_path = Path(self.temporary.name) / "existing-cashier.sqlite3"
        with closing(sqlite3.connect(other_path)) as connection:
            connection.execute(
                "CREATE TABLE app_state (id INTEGER PRIMARY KEY, state_json TEXT, revision INTEGER)"
            )
            connection.execute(
                "INSERT INTO app_state (id, state_json, revision) VALUES (1, ?, 27)",
                ('{"cash":"preserve-me"}',),
            )
            connection.execute("PRAGMA user_version = 5")
            connection.commit()

        OnlineOrderStorage(other_path, clock=lambda: self.clock_value)

        with closing(sqlite3.connect(other_path)) as connection:
            state_row = connection.execute(
                "SELECT state_json, revision FROM app_state WHERE id = 1"
            ).fetchone()
            user_version = connection.execute("PRAGMA user_version").fetchone()[0]
        self.assertEqual(state_row, ('{"cash":"preserve-me"}', 27))
        self.assertEqual(user_version, 5)

    def test_event_ingestion_is_idempotent_and_older_versions_do_not_win(self) -> None:
        first = self.storage.ingest_event_page(
            event_page(cursor=9, order=sample_order())
        )
        repeated = self.storage.ingest_event_page(
            event_page(cursor=9, order=sample_order())
        )
        updated = self.storage.ingest_event_page(
            event_page(cursor=10, order=sample_order(version=2, status="accepted"))
        )
        stale = self.storage.ingest_event_page(
            event_page(cursor=11, order=sample_order(version=1, status="pending"))
        )

        self.assertEqual(first.changed_orders, 1)
        self.assertEqual(repeated.changed_orders, 0)
        self.assertEqual(updated.changed_orders, 1)
        self.assertEqual(stale.changed_orders, 0)
        self.assertEqual(self.storage.sync_state().event_cursor, 11)
        order = self.storage.get_order("order-001")
        self.assertIsNotNone(order)
        assert order is not None
        self.assertEqual(order["version"], 2)
        self.assertEqual(order["status"], "accepted")
        self.assertEqual(len(self.storage.list_orders()), 1)
        with closing(sqlite3.connect(self.path)) as connection:
            item_count = connection.execute(
                "SELECT COUNT(*) FROM external_order_items"
            ).fetchone()[0]
        self.assertEqual(item_count, 1)

    def test_invalid_page_rolls_back_without_advancing_cursor(self) -> None:
        broken = event_page(cursor=2, order=sample_order())
        broken["events"][0]["order"]["totalCents"] = 999
        with self.assertRaises(InvalidRemotePayloadError):
            self.storage.ingest_event_page(broken)
        self.assertEqual(self.storage.sync_state().event_cursor, 0)
        self.assertEqual(self.storage.list_orders(), [])

    def test_rejects_unknown_or_noncanonical_payment_method(self) -> None:
        for payment_method in ("pix", "Cartão", ""):
            with self.subTest(payment_method=payment_method):
                invalid_order = sample_order()
                invalid_order["paymentMethod"] = payment_method
                with self.assertRaises(InvalidRemotePayloadError):
                    self.storage.ingest_event_page(
                        event_page(cursor=1, order=invalid_order)
                    )
        self.assertEqual(self.storage.sync_state().event_cursor, 0)
        self.assertEqual(self.storage.list_orders(), [])

    def test_empty_page_cannot_skip_unseen_events(self) -> None:
        with self.assertRaises(InvalidRemotePayloadError):
            self.storage.ingest_event_page(
                {"events": [], "nextCursor": 9, "hasMore": False}
            )
        self.assertEqual(self.storage.sync_state().event_cursor, 0)

    def test_outbox_is_idempotent_and_supports_retry_and_delivery(self) -> None:
        self.storage.ingest_event_page(event_page(cursor=1, order=sample_order()))
        mutation_id = "local-action-00000001"
        command = self.storage.enqueue_action(
            "order-001",
            action="accept",
            expected_version=1,
            mutation_id=mutation_id,
        )
        repeated = self.storage.enqueue_action(
            "order-001",
            action="accept",
            expected_version=1,
            mutation_id=mutation_id,
        )
        self.assertEqual(command, repeated)
        self.assertEqual(len(self.storage.pending_actions()), 1)

        with self.assertRaises(IdempotencyConflictError):
            self.storage.enqueue_action(
                "order-001",
                action="reject",
                expected_version=1,
                mutation_id=mutation_id,
                reason="Sem estoque",
            )

        failed = self.storage.mark_action_failed(
            mutation_id, "Sem internet", retry_after_seconds=30
        )
        self.assertEqual(failed.attempts, 1)
        self.assertEqual(self.storage.pending_actions(), [])
        self.clock_value += 31
        self.assertEqual(len(self.storage.pending_actions()), 1)

        delivered = self.storage.mark_action_delivered(
            mutation_id,
            remote_order=sample_order(version=2, status="accepted"),
        )
        self.assertEqual(delivered.state, "delivered")
        self.assertEqual(delivered.attempts, 2)
        self.assertEqual(self.storage.pending_actions(), [])
        self.assertEqual(self.storage.get_order("order-001")["status"], "accepted")
        still_delivered = self.storage.mark_action_failed(
            mutation_id, "Resposta atrasada", retry_after_seconds=0
        )
        self.assertEqual(still_delivered.state, "delivered")
        self.assertEqual(still_delivered.attempts, 2)


class FakeTransport:
    def __init__(self) -> None:
        self.requests: list[tuple[urllib.request.Request, float, dict[str, Any]]] = []

    def __call__(self, request: urllib.request.Request, timeout: float) -> HttpResponse:
        payload = json.loads(request.data.decode("utf-8")) if request.data else {}
        self.requests.append((request, timeout, payload))
        path = urllib.parse.urlsplit(request.full_url).path
        if path.endswith("/heartbeat"):
            response = {
                "connected": True,
                "serverTime": 123,
                "catalogVersion": 4,
                "eventCursor": 8,
                "acceptingOrders": True,
            }
        elif path.endswith("/catalog"):
            response = {"published": True, "catalogVersion": 5, "repeated": False}
        elif path.endswith("/order-events"):
            response = {"events": [], "nextCursor": 8, "hasMore": False}
        else:
            response = {"order": sample_order(version=2, status="accepted"), "repeated": False}
        return HttpResponse(200, {"Content-Type": "application/json"}, json.dumps(response).encode())


class OnlineOrdersClientTest(unittest.TestCase):
    def setUp(self) -> None:
        self.transport = FakeTransport()
        self.client = OnlineOrdersClient(
            OnlineOrdersConfiguration("https://orders.pool.example/", TOKEN, 7),
            transport=self.transport,
        )

    def test_all_operator_calls_use_expected_contract_and_bearer_token(self) -> None:
        self.client.heartbeat(
            cash_open=True,
            orders_enabled=True,
            app_version="1.9.0",
            local_revision=22,
        )
        self.client.sync_catalog(
            source_revision=22,
            categories=[{"key": "lanches", "name": "Lanches", "sortOrder": 0}],
            products=[
                {
                    "id": "x-bacon",
                    "categoryKey": "lanches",
                    "name": "X-Bacon",
                    "description": "",
                    "imageUrl": None,
                    "emoji": "🥓",
                    "priceCents": 1499,
                    "available": True,
                    "visible": True,
                    "sortOrder": 0,
                }
            ],
        )
        self.client.poll_order_events(after=8, limit=25)
        self.client.send_action(
            "order/001",
            action="accept",
            expected_version=1,
            local_mutation_id="local-action-00000001",
        )

        self.assertEqual([item[0].method for item in self.transport.requests], ["POST", "PUT", "GET", "POST"])
        for request, timeout, _ in self.transport.requests:
            self.assertEqual(request.get_header("Authorization"), f"Bearer {TOKEN}")
            self.assertEqual(timeout, 7)
        heartbeat_payload = self.transport.requests[0][2]
        self.assertEqual(heartbeat_payload["localRevision"], 22)
        event_url = urllib.parse.urlsplit(self.transport.requests[2][0].full_url)
        self.assertEqual(urllib.parse.parse_qs(event_url.query), {"after": ["8"], "limit": ["25"]})
        self.assertIn("order%2F001", self.transport.requests[3][0].full_url)

    def test_api_error_preserves_status_code_and_safe_message(self) -> None:
        def reject(_: urllib.request.Request, __: float) -> HttpResponse:
            return HttpResponse(
                409,
                {},
                json.dumps(
                    {"error": {"code": "VERSION_CONFLICT", "message": "Pedido atualizado."}}
                ).encode(),
            )

        client = OnlineOrdersClient(self.client.configuration, transport=reject)
        with self.assertRaises(OnlineOrdersApiError) as raised:
            client.poll_order_events(after=0)
        self.assertEqual(raised.exception.status, 409)
        self.assertEqual(raised.exception.code, "VERSION_CONFLICT")
        self.assertEqual(str(raised.exception), "Pedido atualizado.")

    def test_configuration_rejects_plain_http_and_never_prints_token(self) -> None:
        with self.assertRaises(ValueError):
            OnlineOrdersConfiguration("http://orders.pool.example", TOKEN)
        configuration = OnlineOrdersConfiguration("https://orders.pool.example", TOKEN)
        self.assertNotIn(TOKEN, repr(configuration))


if __name__ == "__main__":
    unittest.main()
