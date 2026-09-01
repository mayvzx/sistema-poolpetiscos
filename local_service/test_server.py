import http.client
import json
import sqlite3
import tempfile
import threading
import unittest
from collections.abc import Callable
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from local_service.backups import BackupManager
from local_service.server import (
    MAX_STATE_BODY_BYTES,
    PRODUCTION_ORIGIN,
    SERVICE_VERSION,
    PoolCompanionHandler,
    PoolCompanionServer,
    find_downloaded_audio,
    friendly_download_error,
    human_size,
    is_allowed_origin,
    is_local_origin,
    library_fingerprints,
    library_item,
    list_library,
    validate_media_url,
)
from local_service.storage import (
    RevisionConflict,
    STATE_HISTORY_RETENTION,
    StateStorage,
    _is_pool_state,
    default_database_path,
    resolve_backup_directory,
)


def minimal_pool_state(number: int | None = None) -> dict[str, object]:
    state: dict[str, object] = {
        "products": [],
        "sales": [],
        "expenses": [],
        "cashOpen": False,
        "openingBalance": 0,
        "cashFund": 130,
        "cashOpenedAt": 1,
        "cashMovements": [],
        "cashClosures": [],
        "ordersEnabled": True,
        "operatorCredentials": {},
    }
    if number is not None:
        state["testNumber"] = number
    return state


class FakeUpdateChecker:
    def check(self, *, force: bool = False) -> dict[str, object]:
        return {
            "current_version": SERVICE_VERSION,
            "latest_version": "1.7.1",
            "available": True,
            "release_url": (
                "https://github.com/mayvzx/sistema-poolpetiscos/"
                "releases/tag/v1.7.1"
            ),
            "release_name": "Versão 1.7.1",
            "published_at": "2026-08-22T12:00:00Z",
            "notes": "Atualização de teste",
            "verified_installer": None,
            "checked_at": 1,
            "forced": force,
        }

    def download_verified_installer(self) -> dict[str, object]:
        return {"downloaded": True, "version": "1.7.1"}

    def open_update_folder(self) -> dict[str, str]:
        return {"folder": "C:\\PoolPetiscos\\updates"}


class FakeOnlineOrdersManager:
    def __init__(self) -> None:
        self.actions: list[dict[str, object]] = []
        self.configured = False

    def _status(self) -> dict[str, object]:
        return {
            "configured": self.configured,
            "enabled": self.configured,
            "connected": self.configured,
            "acceptingOrders": self.configured,
            "lastSyncAt": None,
            "lastError": None,
            "publicMenuUrl": (
                "https://pool.example/cardapio/pool-petiscos"
                if self.configured
                else None
            ),
            "pendingCount": 1,
        }

    def snapshot(self) -> dict[str, object]:
        return {"orders": [], "status": self._status()}

    def sync_once(self) -> dict[str, object]:
        return self.snapshot()

    def perform_action(self, order_id: str, **payload: object) -> dict[str, object]:
        self.actions.append({"orderId": order_id, **payload})
        return {
            "order": {
                "id": order_id,
                "status": "accepted",
                "version": 2,
            },
            "queued": False,
        }

    def configure(self, _: object) -> dict[str, object]:
        self.configured = True
        return self._status()

    def update_enabled(self, enabled: bool) -> dict[str, object]:
        self.configured = enabled
        return self._status()

    def start(self) -> None:
        return

    def stop(self) -> None:
        return


class CompanionRulesTest(unittest.TestCase):
    def test_service_version_matches_package(self) -> None:
        package_path = Path(__file__).resolve().parents[1] / "package.json"
        package = json.loads(package_path.read_text(encoding="utf-8"))
        self.assertEqual(SERVICE_VERSION, package["version"])

    def test_accepts_only_pool_and_loopback_origins(self) -> None:
        self.assertTrue(is_allowed_origin(None))
        self.assertTrue(is_allowed_origin("http://127.0.0.1:4173"))
        self.assertTrue(is_allowed_origin("http://localhost:5173"))
        self.assertFalse(
            is_allowed_origin(
                "https://pool-petiscos-caixa.mayrom.chatgpt.site"
            )
        )
        self.assertFalse(is_allowed_origin("https://example.com"))
        self.assertTrue(is_local_origin("http://127.0.0.1:4173"))
        self.assertFalse(is_local_origin(PRODUCTION_ORIGIN))

    def test_rejects_local_or_non_http_media_urls(self) -> None:
        self.assertEqual(
            validate_media_url("https://www.youtube.com/watch?v=abc"),
            "https://www.youtube.com/watch?v=abc",
        )
        with self.assertRaises(ValueError):
            validate_media_url("file:///C:/musica.mp3")
        with self.assertRaises(ValueError):
            validate_media_url("http://127.0.0.1/faixa")

    def test_translates_download_failures_without_exposing_technical_details(
        self,
    ) -> None:
        refused = friendly_download_error(
            RuntimeError("HTTP Error 403: Forbidden; cookies required")
        )
        unavailable = friendly_download_error(
            RuntimeError("ERROR: Video unavailable")
        )
        unsupported = friendly_download_error(
            RuntimeError("Unsupported URL: https://example.com")
        )

        self.assertIn("YouTube recusou", refused)
        self.assertIn("não está disponível", unavailable)
        self.assertIn("link não é compatível", unsupported)
        self.assertNotIn("403", refused)

    def test_lists_only_supported_audio_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            audio = root / "Faixa autorizada [abc123].mp3"
            audio.write_bytes(b"audio")
            (root / "ignorar.txt").write_text("texto", encoding="utf-8")

            tracks = list_library(root)

            self.assertEqual(len(tracks), 1)
            self.assertEqual(tracks[0]["name"], "Faixa autorizada")
            self.assertEqual(tracks[0]["media_url"], f"/media/{audio.name}")
            self.assertEqual(library_item(audio)["size"], "1 KB")
            self.assertEqual(human_size(2 * 1024 * 1024), "2.0 MB")

    def test_finds_only_the_audio_created_by_the_current_download(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            previous = root / "Faixa anterior [old].mp3"
            previous.write_bytes(b"previous")
            fingerprints = library_fingerprints(root)

            with self.assertRaises(RuntimeError):
                find_downloaded_audio(root, "new", fingerprints)

            downloaded = root / "Faixa nova [new].mp3"
            downloaded.write_bytes(b"downloaded")
            self.assertEqual(
                find_downloaded_audio(root, "new", fingerprints),
                downloaded,
            )


class StateStorageTest(unittest.TestCase):
    def _storage(
        self,
        root: Path,
        *,
        clock: Callable[[], datetime] | None = None,
        backup_retention: int = 30,
        history_retention: int = STATE_HISTORY_RETENTION,
    ) -> StateStorage:
        return StateStorage(
            database_path=root / "data" / "pool-petiscos.db",
            backup_directory=root / "backups",
            clock=clock,
            backup_retention=backup_retention,
            history_retention=history_retention,
        )

    def test_default_paths_and_onedrive_preference(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            commercial = root / "OneDrive Empresa"
            consumer = root / "OneDrive Pessoal"
            environment = {
                "LOCALAPPDATA": str(root / "local"),
                "OneDriveCommercial": str(commercial),
                "OneDriveConsumer": str(consumer),
            }

            self.assertEqual(
                default_database_path(environment),
                root
                / "local"
                / "PoolPetiscos"
                / "data"
                / "pool-petiscos.db",
            )
            self.assertEqual(
                resolve_backup_directory(environment),
                commercial / "Pool Petiscos" / "Backups",
            )
            self.assertEqual(
                resolve_backup_directory(
                    {"LOCALAPPDATA": str(root / "fallback")}
                ),
                root / "fallback" / "PoolPetiscos" / "backups",
            )
            overrides = {
                "LOCALAPPDATA": str(root / "ignored-local"),
                "OneDriveCommercial": str(commercial),
                "POOL_PETISCOS_DATA_DIR": str(root / "isolated-data"),
                "POOL_PETISCOS_BACKUP_DIR": str(root / "isolated-backups"),
            }
            self.assertEqual(
                default_database_path(overrides),
                root / "isolated-data" / "pool-petiscos.db",
            )
            self.assertEqual(
                resolve_backup_directory(overrides),
                root / "isolated-backups",
            )

    def test_save_is_transactional_and_conflict_does_not_add_history(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            storage = self._storage(root)

            initial = storage.read()
            self.assertIsNone(initial.state)
            self.assertEqual(initial.revision, 0)

            first_state = minimal_pool_state(1)
            saved = storage.save(first_state, 0)
            self.assertEqual(saved.revision, 1)

            with self.assertRaises(RevisionConflict) as raised:
                storage.save(minimal_pool_state(2), 0)
            self.assertEqual(raised.exception.snapshot.state, saved.state)

            current = storage.read()
            self.assertEqual(current, saved)
            with closing(sqlite3.connect(storage.database_path)) as connection:
                history = connection.execute(
                    """
                    SELECT revision, state_json
                    FROM state_history
                    ORDER BY revision
                    """
                ).fetchall()
            self.assertEqual(len(history), 1)
            self.assertEqual(history[0][0], 1)
            self.assertEqual(json.loads(history[0][1]), first_state)

    def test_rejects_invalid_state_and_duplicate_record_ids(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            storage = self._storage(Path(directory))
            with self.assertRaises(ValueError):
                storage.save({"cash": {"open": True}}, 0)

            duplicated = minimal_pool_state()
            product = {
                "id": "P1",
                "name": "Batata frita",
                "category": "Petiscos",
                "price": 18.5,
                "stock": 7,
                "minimum": 3,
                "emoji": "🍟",
            }
            duplicated["products"] = [product, dict(product)]
            with self.assertRaises(ValueError):
                storage.save(duplicated, 0)

            self.assertEqual(storage.read().revision, 0)

    def test_accepts_legacy_state_and_validates_new_cash_closing_fields(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            storage = self._storage(Path(directory))
            legacy = minimal_pool_state()
            legacy.pop("cashFund")
            saved = storage.save(legacy, 0)
            self.assertEqual(saved.revision, 1)

            modern = minimal_pool_state()
            modern["cashClosures"] = [
                {
                    "id": "FC-TESTE",
                    "openedAt": 100,
                    "closedAt": 200,
                    "openingBalance": 130,
                    "expectedBalance": 152,
                    "countedBalance": 152,
                    "difference": 0,
                    "cashFund": 130,
                    "withdrawalAmount": 22,
                    "remainingBalance": 130,
                }
            ]
            self.assertEqual(storage.save(modern, 1).revision, 2)

            invalid = minimal_pool_state()
            invalid["cashClosures"] = [
                {
                    "id": "FC-INVALIDO",
                    "openedAt": 100,
                    "closedAt": 200,
                    "openingBalance": 130,
                    "expectedBalance": 152,
                    "countedBalance": 152,
                    "difference": 0,
                    "cashFund": 130,
                    "withdrawalAmount": 22,
                }
            ]
            with self.assertRaises(ValueError):
                storage.save(invalid, 2)

    def test_rejects_inconsistent_cash_session_timelines(self) -> None:
        active = minimal_pool_state()
        active.update(
            {
                "cashOpen": True,
                "openingBalance": 130,
                "cashOpenedAt": 1_000,
                "activeCashSession": {
                    "id": "CX-ATIVA",
                    "openedAt": 1_000,
                    "openingBalance": 130,
                    "openedByOperatorId": "elaine",
                    "openedByOperatorName": "Elaine",
                },
            }
        )
        active["cashClosures"] = [
            {
                "id": "FC-ANTERIOR",
                "sessionId": "CX-ATIVA",
                "openedAt": 100,
                "closedAt": 900,
                "openedByOperatorId": "elaine",
                "openedByOperatorName": "Elaine",
                "closedByOperatorId": "elaine",
                "closedByOperatorName": "Elaine",
                "openingBalance": 130,
                "expectedBalance": 130,
                "countedBalance": 130,
                "difference": 0,
                "cashFund": 130,
                "withdrawalAmount": 0,
                "remainingBalance": 130,
            }
        ]
        self.assertFalse(_is_pool_state(active))

        outside_period = minimal_pool_state()
        outside_period.update(active)
        outside_period["cashClosures"] = []
        outside_period["sales"] = [
            {
                "id": "PV-ANTERIOR",
                "cashSessionId": "CX-ATIVA",
                "timestamp": 999,
                "total": 10,
                "payment": "Dinheiro",
                "operatorId": "elaine",
                "operatorName": "Elaine",
                "customerName": "Balcão 01",
                "orderStatus": "entregue",
                "statusUpdatedAt": 999,
                "items": [
                    {
                        "productId": "P1",
                        "name": "Pastel",
                        "price": 10,
                        "quantity": 1,
                    }
                ],
            }
        ]
        self.assertFalse(_is_pool_state(outside_period))

        overlapping = minimal_pool_state()
        first_closure = {
            "id": "FC-1",
            "openedAt": 100,
            "closedAt": 300,
            "openingBalance": 130,
            "expectedBalance": 130,
            "countedBalance": 130,
            "difference": 0,
        }
        overlapping["cashClosures"] = [
            first_closure,
            {
                **first_closure,
                "id": "FC-2",
                "openedAt": 200,
                "closedAt": 400,
            },
        ]
        self.assertFalse(_is_pool_state(overlapping))

    def test_read_rejects_externally_corrupted_state(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            storage = self._storage(Path(directory))
            storage.save(minimal_pool_state(1), 0)
            with closing(sqlite3.connect(storage.database_path)) as connection:
                connection.execute(
                    "UPDATE app_state SET state_json = ? WHERE id = 1",
                    ('{"cash":"invalid"}',),
                )
                connection.commit()

            with self.assertRaises(RuntimeError):
                storage.read()

    def test_backup_manager_records_local_backup_failure(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            storage = self._storage(root)
            storage.save(minimal_pool_state(1), 0)
            manager = BackupManager(storage, root, root)

            with mock.patch.object(
                storage,
                "ensure_automatic_backups",
                side_effect=OSError("disco sem espaço"),
            ):
                with self.assertRaisesRegex(OSError, "disco sem espaço"):
                    manager.run(force=True)

            self.assertIn("disco sem espaço", manager.status()["last_error"])

    def test_failed_history_insert_rolls_back_the_current_state(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            storage = self._storage(Path(directory))
            saved = storage.save(minimal_pool_state(1), 0)

            with closing(sqlite3.connect(storage.database_path)) as connection:
                connection.execute(
                    """
                    CREATE TRIGGER reject_second_revision
                    BEFORE INSERT ON state_history
                    WHEN NEW.revision = 2
                    BEGIN
                        SELECT RAISE(ABORT, 'forced rollback');
                    END
                    """
                )
                connection.commit()

            with self.assertRaises(sqlite3.IntegrityError):
                storage.save(minimal_pool_state(2), 1)

            self.assertEqual(storage.read(), saved)
            with closing(sqlite3.connect(storage.database_path)) as connection:
                history_count = connection.execute(
                    "SELECT COUNT(*) FROM state_history"
                ).fetchone()[0]
            self.assertEqual(history_count, 1)

    def test_history_keeps_only_the_bounded_recent_snapshots(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            storage = self._storage(Path(directory))
            for number in range(STATE_HISTORY_RETENTION + 5):
                storage.save(minimal_pool_state(number))

            with closing(sqlite3.connect(storage.database_path)) as connection:
                first, last, count = connection.execute(
                    """
                    SELECT MIN(revision), MAX(revision), COUNT(*)
                    FROM state_history
                    """
                ).fetchone()
            self.assertEqual(
                (first, last, count),
                (6, STATE_HISTORY_RETENTION + 5, STATE_HISTORY_RETENTION),
            )

    def test_backup_is_restorable_and_retention_is_enforced(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            now = datetime(2026, 7, 26, 12, 30, tzinfo=timezone.utc)
            storage = self._storage(
                root,
                clock=lambda: now,
                backup_retention=3,
            )
            first_state = minimal_pool_state(1)
            second_state = minimal_pool_state(2)
            storage.save(first_state, 0)
            storage.save(second_state, 1)

            for offset in range(1, 5):
                date = (now - timedelta(days=offset)).date().isoformat()
                (storage.backup_directory / f"pool-petiscos-{date}.db").write_bytes(
                    b"old"
                )

            backup = storage.ensure_daily_backup(force=True)
            daily_backups = [
                record for record in storage.list_backups() if record.tier == "daily"
            ]
            weekly_backups = [
                record for record in storage.list_backups() if record.tier == "weekly"
            ]
            monthly_backups = [
                record for record in storage.list_backups() if record.tier == "monthly"
            ]
            self.assertEqual(len(daily_backups), 3)
            self.assertEqual(len(weekly_backups), 1)
            self.assertEqual(len(monthly_backups), 1)
            self.assertIn(backup, [record.path for record in daily_backups])

            with closing(sqlite3.connect(backup)) as connection:
                encoded_state, revision = connection.execute(
                    """
                    SELECT state_json, revision
                    FROM app_state
                    WHERE id = 1
                    """
                ).fetchone()
                history_count = connection.execute(
                    "SELECT COUNT(*) FROM state_history"
                ).fetchone()[0]
            self.assertEqual(
                json.loads(encoded_state),
                second_state,
            )
            self.assertEqual(revision, 2)
            self.assertEqual(history_count, 0)

    def test_restore_validates_database_and_keeps_pre_restore_copy(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            storage = self._storage(root)
            first_state = minimal_pool_state(1)
            second_state = minimal_pool_state(2)
            storage.save(first_state, 0)
            source = root / "restore.db"
            source.write_bytes(storage.export_database())
            storage.save(second_state, 1)

            restored = storage.restore_database(source)

            self.assertEqual(restored.state, first_state)
            self.assertEqual(storage.read().state, first_state)
            self.assertEqual(
                len(list(storage.backup_directory.glob("*antes-restauracao*.db"))),
                1,
            )

            invalid = root / "invalid.db"
            invalid.write_bytes(b"not-a-database")
            with self.assertRaises(sqlite3.DatabaseError):
                storage.restore_database(invalid)
            self.assertEqual(storage.read().state, first_state)

    def test_readable_views_and_exported_database_are_consistent(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            storage = self._storage(root)
            storage.save(
                {
                    "products": [
                        {
                            "id": "P1",
                            "name": "Batata frita",
                            "category": "Petiscos",
                            "price": 18.5,
                            "stock": 7,
                            "minimum": 3,
                            "emoji": "🍟",
                        }
                    ],
                    "sales": [
                        {
                            "id": "V1",
                            "cashSessionId": "CX-ATIVA",
                            "timestamp": 1_700_000_000_000,
                            "subtotal": 37,
                            "surchargeRate": 0.06,
                            "surchargeAmount": 2.22,
                            "total": 39.22,
                            "payment": "Crédito",
                            "operatorId": "elaine",
                            "operatorName": "Elaine",
                            "customerName": "Ana",
                            "serviceMode": "comanda",
                            "orderStatus": "em-preparo",
                            "statusUpdatedAt": 1_700_000_300_000,
                            "items": [
                                {
                                    "productId": "P1",
                                    "name": "Batata frita",
                                    "price": 18.5,
                                    "quantity": 2,
                                    "observation": "Sem sal",
                                }
                            ],
                        }
                    ],
                    "expenses": [],
                    "cashOpen": True,
                    "openingBalance": 100,
                    "cashFund": 130,
                    "cashOpenedAt": 1_700_000_000_000,
                    "activeCashSession": {
                        "id": "CX-ATIVA",
                        "openedAt": 1_700_000_000_000,
                        "openingBalance": 100,
                        "openedByOperatorId": "elaine",
                        "openedByOperatorName": "Elaine",
                    },
                    "cashMovements": [],
                    "cashClosures": [
                        {
                            "id": "FC1",
                            "openedAt": 1_699_999_000_000,
                            "closedAt": 1_699_999_500_000,
                            "openingBalance": 130,
                            "expectedBalance": 152,
                            "countedBalance": 152,
                            "difference": 0,
                            "cashFund": 130,
                            "withdrawalAmount": 22,
                            "remainingBalance": 130,
                        }
                    ],
                    "ordersEnabled": True,
                    "operatorCredentials": {
                        "elaine": {
                            "algorithm": "PBKDF2-SHA-256",
                            "iterations": 210000,
                            "salt": "MTIzNDU2Nzg5MGFiY2RlZg==",
                            "hash": (
                                "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI="
                            ),
                            "updatedAt": 1_700_000_400_000,
                        }
                    },
                }
            )

            exported = root / "exported.db"
            exported.write_bytes(storage.export_database())
            with closing(sqlite3.connect(exported)) as connection:
                self.assertEqual(
                    connection.execute("PRAGMA integrity_check").fetchone()[0],
                    "ok",
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT nome, preco, estoque_atual FROM vw_produtos"
                    ).fetchone(),
                    ("Batata frita", 18.5, 7),
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT sessao_caixa_id, subtotal, "
                        "acrescimo_percentual, acrescimo_valor, total, "
                        "forma_pagamento, operador, quantidade_itens "
                        "FROM vw_vendas"
                    ).fetchone(),
                    (
                        "CX-ATIVA",
                        37.0,
                        6.0,
                        2.22,
                        39.22,
                        "Crédito",
                        "Elaine",
                        2,
                    ),
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT sessao_caixa_id, cliente, modo_atendimento, "
                        "situacao, operador, quantidade_itens "
                        "FROM vw_comandas"
                    ).fetchone(),
                    (
                        "CX-ATIVA",
                        "Ana",
                        "comanda",
                        "em-preparo",
                        "Elaine",
                        2,
                    ),
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT produto, quantidade, observacao, total_item "
                        "FROM vw_itens_venda"
                    ).fetchone(),
                    ("Batata frita", 2, "Sem sal", 37.0),
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT nome, pin_configurado "
                        "FROM vw_operadores ORDER BY id"
                    ).fetchall(),
                    [("Elaine", 1), ("Poolblay", 0)],
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT saldo_esperado, saldo_contado, diferenca, "
                        "fundo_troco, retirada_fechamento, saldo_deixado "
                        "FROM vw_fechamentos_caixa"
                    ).fetchone(),
                    (152.0, 152.0, 0.0, 130.0, 22.0, 130.0),
                )


class StateApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        root = Path(self.temporary_directory.name)
        self.storage = StateStorage(
            database_path=root / "data" / "state.db",
            backup_directory=root / "backups",
        )
        self.online_orders_manager = FakeOnlineOrdersManager()
        self.server = PoolCompanionServer(
            ("127.0.0.1", 0),
            PoolCompanionHandler,
            root / "music",
            self.storage,
            update_checker=FakeUpdateChecker(),
            online_orders_manager=self.online_orders_manager,  # type: ignore[arg-type]
        )
        self.worker = threading.Thread(
            target=self.server.serve_forever,
            daemon=True,
        )
        self.worker.start()

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.worker.join(timeout=2)
        self.temporary_directory.cleanup()

    def _request(
        self,
        method: str,
        path: str,
        payload: dict[str, object] | None = None,
    ) -> tuple[int, dict[str, object]]:
        connection = http.client.HTTPConnection(
            "127.0.0.1",
            self.server.server_port,
            timeout=2,
        )
        body = json.dumps(payload) if payload is not None else None
        headers = {
            "Origin": "http://127.0.0.1:4173",
            "Content-Type": "application/json",
        }
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        decoded = json.loads(response.read().decode("utf-8"))
        connection.close()
        return response.status, decoded

    def test_state_api_save_read_conflict_and_manual_backup(self) -> None:
        status, initial = self._request("GET", "/api/state")
        self.assertEqual(status, 200)
        self.assertEqual(initial["state"], None)
        self.assertEqual(initial["revision"], 0)
        self.assertEqual(initial["storage"], "sqlite")

        first_state = minimal_pool_state(1)
        status, saved = self._request(
            "PUT",
            "/api/state",
            {"state": first_state, "expected_revision": 0},
        )
        self.assertEqual(status, 200)
        self.assertEqual(saved["revision"], 1)
        self.assertIsNotNone(saved["saved_at"])
        self.assertIsNotNone(saved["last_backup_at"])

        large_note = "x" * (40 * 1024)
        second_state = minimal_pool_state(2)
        second_state["testNote"] = large_note
        status, large_saved = self._request(
            "PUT",
            "/api/state",
            {
                "state": second_state,
                "expected_revision": 1,
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(large_saved["revision"], 2)

        status, conflict = self._request(
            "PUT",
            "/api/state",
            {"state": minimal_pool_state(3), "expected_revision": 0},
        )
        self.assertEqual(status, 409)
        self.assertEqual(conflict["revision"], 2)
        self.assertEqual(
            conflict["state"],
            second_state,
        )

        status, backup = self._request("POST", "/api/backups")
        self.assertEqual(status, 201)
        self.assertTrue(str(backup["filename"]).endswith(".db"))

        connection = http.client.HTTPConnection(
            "127.0.0.1",
            self.server.server_port,
            timeout=2,
        )
        connection.request(
            "GET",
            "/api/database/export",
            headers={"Origin": "http://127.0.0.1:4173"},
        )
        response = connection.getresponse()
        exported_database = response.read()
        content_type = response.getheader("Content-Type")
        connection.close()
        self.assertEqual(response.status, 200)
        self.assertEqual(content_type, "application/vnd.sqlite3")

        downloaded = self.storage.database_path.parent / "downloaded.db"
        downloaded.write_bytes(exported_database)
        with closing(sqlite3.connect(downloaded)) as exported:
            self.assertEqual(
                exported.execute("PRAGMA integrity_check").fetchone()[0],
                "ok",
            )
            self.assertEqual(
                exported.execute(
                    "SELECT COUNT(*) FROM state_history"
                ).fetchone()[0],
                0,
            )

    def test_update_api_is_notice_first_and_does_not_run_an_installer(self) -> None:
        status, update = self._request("GET", "/api/update/status?force=1")
        self.assertEqual(status, 200)
        self.assertEqual(update["latest_version"], "1.7.1")
        self.assertEqual(update["forced"], True)

        status, downloaded = self._request("POST", "/api/update/download")
        self.assertEqual(status, 201)
        self.assertEqual(downloaded["downloaded"], True)

        status, opened = self._request("POST", "/api/update/open-folder")
        self.assertEqual(status, 200)
        self.assertIn("updates", opened["folder"])

    def test_online_orders_api_lists_syncs_configures_and_applies_action(self) -> None:
        status, initial = self._request("GET", "/api/online-orders")
        self.assertEqual(status, 200)
        self.assertFalse(initial["status"]["configured"])

        status, configured = self._request(
            "POST",
            "/api/online-orders/configure",
            {
                "apiBaseUrl": "https://pool.example",
                "installationToken": "test-token-that-is-longer-than-thirty-two",
                "publicMenuUrl": (
                    "https://pool.example/cardapio/pool-petiscos"
                ),
                "enabled": True,
            },
        )
        self.assertEqual(status, 201)
        self.assertTrue(configured["configured"])

        status, synced = self._request(
            "POST", "/api/online-orders/sync", {}
        )
        self.assertEqual(status, 200)
        self.assertTrue(synced["status"]["connected"])

        status, action = self._request(
            "POST",
            "/api/online-orders/actions",
            {
                "orderId": "remote-1",
                "action": "accept",
                "expectedVersion": 1,
                "localMutationId": "test-action-00000001",
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(action["order"]["status"], "accepted")
        self.assertEqual(
            self.online_orders_manager.actions[0]["orderId"], "remote-1"
        )

    def test_state_api_rejects_incomplete_state_without_writing(self) -> None:
        status, invalid = self._request(
            "PUT",
            "/api/state",
            {"state": {"cash": {"open": True}}, "expected_revision": 0},
        )
        self.assertEqual(status, 400)
        self.assertIn("dados válidos", invalid["error"])

        status, current = self._request("GET", "/api/state")
        self.assertEqual(status, 200)
        self.assertIsNone(current["state"])
        self.assertEqual(current["revision"], 0)

    def test_backup_status_and_local_restore_api(self) -> None:
        status, saved = self._request(
            "PUT",
            "/api/state",
            {"state": minimal_pool_state(1), "expected_revision": 0},
        )
        self.assertEqual(status, 200)
        self.assertEqual(saved["revision"], 1)

        status, backup_status = self._request("GET", "/api/backups/status")
        self.assertEqual(status, 200)
        self.assertEqual(
            [item["tier"] for item in backup_status["schedules"]],
            ["daily", "weekly", "monthly"],
        )

        status, backup_run = self._request("POST", "/api/backups/run")
        self.assertEqual(status, 201)
        daily = next(
            item for item in backup_run["created"] if item["tier"] == "daily"
        )

        status, saved = self._request(
            "PUT",
            "/api/state",
            {"state": minimal_pool_state(2), "expected_revision": 1},
        )
        self.assertEqual(status, 200)
        self.assertEqual(saved["revision"], 2)

        status, restored = self._request(
            "POST",
            "/api/backups/restore",
            {"source": "local", "filename": daily["filename"]},
        )
        self.assertEqual(status, 200)
        self.assertEqual(restored["restored"], True)

        status, current = self._request("GET", "/api/state")
        self.assertEqual(status, 200)
        self.assertEqual(current["state"], minimal_pool_state(1))

    def test_database_file_restore_api(self) -> None:
        status, _ = self._request(
            "PUT",
            "/api/state",
            {"state": minimal_pool_state(1), "expected_revision": 0},
        )
        self.assertEqual(status, 200)

        connection = http.client.HTTPConnection(
            "127.0.0.1", self.server.server_port, timeout=3
        )
        connection.request(
            "GET",
            "/api/database/export",
            headers={"Origin": "http://127.0.0.1:4173"},
        )
        response = connection.getresponse()
        database = response.read()
        self.assertEqual(response.status, 200)
        connection.close()

        status, _ = self._request(
            "PUT",
            "/api/state",
            {"state": minimal_pool_state(2), "expected_revision": 1},
        )
        self.assertEqual(status, 200)

        connection = http.client.HTTPConnection(
            "127.0.0.1", self.server.server_port, timeout=3
        )
        connection.request(
            "POST",
            "/api/database/restore",
            body=database,
            headers={
                "Origin": "http://127.0.0.1:4173",
                "Content-Type": "application/vnd.sqlite3",
            },
        )
        response = connection.getresponse()
        restored = json.loads(response.read().decode("utf-8"))
        connection.close()
        self.assertEqual(response.status, 200)
        self.assertEqual(restored["restored"], True)

        status, current = self._request("GET", "/api/state")
        self.assertEqual(status, 200)
        self.assertEqual(current["state"], minimal_pool_state(1))

    def test_public_demo_cannot_read_or_change_local_state(self) -> None:
        for method, path, payload in (
            ("GET", "/api/state", None),
            ("GET", "/api/database/export", None),
            ("GET", "/api/backups/status", None),
            ("GET", "/api/backups/google", None),
            ("GET", "/api/update/status", None),
            ("GET", "/api/online-orders", None),
            ("POST", "/api/backups", None),
            ("POST", "/api/backups/run", None),
            ("POST", "/api/database/restore", {"invalid": True}),
            (
                "POST",
                "/api/backups/restore",
                {"source": "local", "filename": "backup.db"},
            ),
            ("POST", "/api/google-drive/connect", None),
            ("POST", "/api/google-drive/disconnect", None),
            ("POST", "/api/update/download", None),
            ("POST", "/api/update/open-folder", None),
            ("POST", "/api/online-orders/sync", {}),
            (
                "POST",
                "/api/online-orders/actions",
                {
                    "orderId": "remote-1",
                    "action": "accept",
                    "expectedVersion": 1,
                    "localMutationId": "test-action-00000001",
                },
            ),
            (
                "POST",
                "/api/online-orders/configure",
                {
                    "apiBaseUrl": "https://pool.example",
                    "installationToken": "test-token-that-is-longer-than-thirty-two",
                    "publicMenuUrl": "https://pool.example/cardapio/pool-petiscos",
                },
            ),
            (
                "PUT",
                "/api/state",
                {"state": {"cash": {"open": True}}, "expected_revision": 0},
            ),
        ):
            connection = http.client.HTTPConnection(
                "127.0.0.1",
                self.server.server_port,
                timeout=2,
            )
            body = json.dumps(payload) if payload is not None else None
            connection.request(
                method,
                path,
                body=body,
                headers={
                    "Origin": PRODUCTION_ORIGIN,
                    "Content-Type": "application/json",
                },
            )
            response = connection.getresponse()
            response.read()
            connection.close()
            self.assertEqual(response.status, 403, f"{method} {path}")

    def test_state_api_rejects_body_above_the_ten_megabyte_limit(self) -> None:
        connection = http.client.HTTPConnection(
            "127.0.0.1",
            self.server.server_port,
            timeout=2,
        )
        connection.putrequest("PUT", "/api/state")
        connection.putheader("Origin", "http://127.0.0.1:4173")
        connection.putheader("Content-Type", "application/json")
        connection.putheader("Content-Length", str(MAX_STATE_BODY_BYTES + 1))
        connection.endheaders()
        response = connection.getresponse()
        payload = json.loads(response.read().decode("utf-8"))
        connection.close()

        self.assertEqual(response.status, 400)
        self.assertIn("grande", str(payload["error"]))


if __name__ == "__main__":
    unittest.main()
