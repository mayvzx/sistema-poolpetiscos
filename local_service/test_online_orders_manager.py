from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from typing import Any

from local_service.online_orders import OnlineOrdersNetworkError
from local_service.online_orders_manager import (
    OnlineOrdersManager,
    OnlineOrdersSettings,
)
from local_service.storage import StateStorage


TOKEN = "manager-test-installation-token-with-32-chars"


def pool_state(*, product_name: str = "X-Bacon") -> dict[str, Any]:
    return {
        "products": [
            {
                "id": "x-bacon",
                "name": product_name,
                "category": "Hambúrgueres",
                "price": 14.99,
                "stock": 5,
                "minimum": 1,
                "emoji": "🥓",
            }
        ],
        "sales": [],
        "expenses": [],
        "cashOpen": True,
        "openingBalance": 130,
        "cashFund": 130,
        "cashOpenedAt": 1_788_230_000_000,
        "activeCashSession": {
            "id": "CX-1",
            "openedAt": 1_788_230_000_000,
            "openingBalance": 130,
            "openedByOperatorId": "elaine",
            "openedByOperatorName": "Elaine",
        },
        "cashMovements": [],
        "cashClosures": [],
        "ordersEnabled": True,
        "operatorCredentials": {},
    }


def remote_order(*, version: int = 1, status: str = "pending") -> dict[str, Any]:
    return {
        "id": "remote-1",
        "number": 9,
        "status": status,
        "version": version,
        "fulfillmentMode": "pickup",
        "tableLabel": None,
        "customerName": "Maria",
        "customerNote": "",
        "paymentMethod": "Pix",
        "subtotalCents": 1499,
        "surchargeRate": 0,
        "surchargeCents": 0,
        "totalCents": 1499,
        "catalogVersion": 1,
        "localSaleId": None,
        "rejectionReason": None,
        "createdAt": 1_788_230_000_000,
        "updatedAt": 1_788_230_000_000 + version,
        "expiresAt": 1_788_230_600_000,
        "items": [
            {
                "id": "remote-item-1",
                "productId": "x-bacon",
                "name": "X-Bacon",
                "unitPriceCents": 1499,
                "quantity": 1,
                "note": "",
                "lineTotalCents": 1499,
            }
        ],
    }


class FakeClient:
    def __init__(self, clock: list[float]) -> None:
        self.clock = clock
        self.catalog_revisions: list[int] = []
        self.actions: list[str] = []
        self.fail_actions = False

    def heartbeat(self, **_: Any) -> dict[str, Any]:
        return {
            "serverTime": int(self.clock[0] * 1000),
            "catalogVersion": len(self.catalog_revisions),
            "eventCursor": 1,
            "acceptingOrders": True,
        }

    def sync_catalog(self, *, source_revision: int, **_: Any) -> dict[str, Any]:
        self.catalog_revisions.append(source_revision)
        return {
            "published": True,
            "catalogVersion": len(self.catalog_revisions),
            "repeated": False,
        }

    def poll_order_events(self, *, after: int, limit: int) -> dict[str, Any]:
        del limit
        if after >= 1:
            return {"events": [], "nextCursor": after, "hasMore": False}
        order = remote_order()
        return {
            "events": [
                {
                    "cursor": 1,
                    "type": "order.created",
                    "orderVersion": 1,
                    "createdAt": order["createdAt"],
                    "order": order,
                }
            ],
            "nextCursor": 1,
            "hasMore": False,
        }

    def send_action(self, _: str, *, action: str, **__: Any) -> dict[str, Any]:
        self.actions.append(action)
        if self.fail_actions:
            raise OnlineOrdersNetworkError("Sem internet")
        status = "accepted" if action == "accept" else "completed"
        return {
            "order": remote_order(version=2, status=status),
            "repeated": False,
        }


class OnlineOrdersManagerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.clock = [1_788_230_100.0]
        self.state_storage = StateStorage(
            database_path=self.root / "data" / "pool-petiscos.db",
            backup_directory=self.root / "backups",
        )
        self.state_storage.save(pool_state())
        self.client = FakeClient(self.clock)
        self.manager = OnlineOrdersManager(
            self.state_storage,
            self.root,
            "1.9.0",
            clock=lambda: self.clock[0],
            client_factory=lambda _: self.client,  # type: ignore[arg-type]
        )

    def tearDown(self) -> None:
        self.manager.stop()
        self.temporary.cleanup()

    def configure(self) -> None:
        self.manager.configure(
            OnlineOrdersSettings(
                "https://pool.example",
                TOKEN,
                "https://pool.example/cardapio/pool-petiscos",
            )
        )

    def test_sync_publishes_catalog_once_and_ingests_order(self) -> None:
        self.configure()
        first = self.manager.sync_once()
        second = self.manager.sync_once()

        self.assertEqual(len(self.client.catalog_revisions), 1)
        self.assertGreaterEqual(self.client.catalog_revisions[0], int(self.clock[0] * 1000))
        self.assertEqual(first["orders"][0]["id"], "remote-1")
        self.assertEqual(second["status"]["pendingCount"], 1)
        self.assertTrue(second["status"]["connected"])
        self.assertTrue(second["status"]["acceptingOrders"])

    def test_catalog_change_uses_a_new_monotonic_publication_revision(self) -> None:
        self.configure()
        self.manager.sync_once()
        self.clock[0] += 1
        current = self.state_storage.read()
        self.state_storage.save(
            pool_state(product_name="X-Bacon especial"),
            expected_revision=current.revision,
        )
        self.manager.sync_once()

        self.assertEqual(len(self.client.catalog_revisions), 2)
        self.assertGreater(
            self.client.catalog_revisions[1],
            self.client.catalog_revisions[0],
        )

    def test_action_is_queued_durably_when_network_fails(self) -> None:
        self.configure()
        self.manager.sync_once()
        self.client.fail_actions = True

        response = self.manager.perform_action(
            "remote-1",
            action="accept",
            expected_version=1,
            mutation_id="manager-action-000001",
        )

        self.assertTrue(response["queued"])
        command = self.manager.storage.get_outbox_command(
            "manager-action-000001"
        )
        self.assertIsNotNone(command)
        assert command is not None
        self.assertEqual(command.state, "pending")
        self.assertEqual(command.attempts, 1)
        pending_order = self.manager.storage.get_order("remote-1")
        self.assertIsNotNone(pending_order)
        assert pending_order is not None
        self.assertTrue(pending_order["syncPending"])

    def test_unconfigured_manager_does_not_contact_remote(self) -> None:
        snapshot = self.manager.sync_once()
        self.assertFalse(snapshot["status"]["configured"])
        self.assertEqual(snapshot["orders"], [])
        self.assertEqual(self.client.catalog_revisions, [])


if __name__ == "__main__":
    unittest.main()
