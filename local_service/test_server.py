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

from local_service.server import (
    MAX_STATE_BODY_BYTES,
    PRODUCTION_ORIGIN,
    SERVICE_VERSION,
    PoolCompanionHandler,
    PoolCompanionServer,
    find_downloaded_audio,
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
    StateStorage,
    default_database_path,
    resolve_backup_directory,
)


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
        history_retention: int = 50,
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

            saved = storage.save({"orders": [{"id": "pedido-1"}]}, 0)
            self.assertEqual(saved.revision, 1)

            with self.assertRaises(RevisionConflict) as raised:
                storage.save({"orders": []}, 0)
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
            self.assertEqual(
                history,
                [(1, '{"orders":[{"id":"pedido-1"}]}')],
            )

    def test_failed_history_insert_rolls_back_the_current_state(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            storage = self._storage(Path(directory))
            saved = storage.save({"number": 1}, 0)

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
                storage.save({"number": 2}, 1)

            self.assertEqual(storage.read(), saved)
            with closing(sqlite3.connect(storage.database_path)) as connection:
                history_count = connection.execute(
                    "SELECT COUNT(*) FROM state_history"
                ).fetchone()[0]
            self.assertEqual(history_count, 1)

    def test_history_keeps_the_latest_fifty_snapshots(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            storage = self._storage(Path(directory))
            for number in range(55):
                storage.save({"number": number})

            with closing(sqlite3.connect(storage.database_path)) as connection:
                first, last, count = connection.execute(
                    """
                    SELECT MIN(revision), MAX(revision), COUNT(*)
                    FROM state_history
                    """
                ).fetchone()
            self.assertEqual((first, last, count), (6, 55, 50))

    def test_backup_is_restorable_and_retention_is_enforced(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            now = datetime(2026, 7, 26, 12, 30, tzinfo=timezone.utc)
            storage = self._storage(
                root,
                clock=lambda: now,
                backup_retention=3,
            )
            storage.save({"products": [{"name": "Batata"}]}, 0)
            storage.save(
                {"products": [{"name": "Batata", "quantity": 2}]},
                1,
            )

            for offset in range(1, 5):
                date = (now - timedelta(days=offset)).date().isoformat()
                (storage.backup_directory / f"pool-petiscos-{date}.db").write_bytes(
                    b"old"
                )

            backup = storage.ensure_daily_backup(force=True)
            backups = sorted(storage.backup_directory.glob("*.db"))
            self.assertEqual(len(backups), 3)
            self.assertIn(backup, backups)

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
                {"products": [{"name": "Batata", "quantity": 2}]},
            )
            self.assertEqual(revision, 2)
            self.assertEqual(history_count, 2)

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
                            "timestamp": 1_700_000_000_000,
                            "total": 37,
                            "payment": "Pix",
                            "operatorId": "elaine",
                            "operatorName": "Elaine",
                            "customerName": "Ana",
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
                    "cashOpenedAt": 1_700_000_000_000,
                    "cashMovements": [],
                    "cashClosures": [],
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
                        "SELECT forma_pagamento, operador, quantidade_itens "
                        "FROM vw_vendas"
                    ).fetchone(),
                    ("Pix", "Elaine", 2),
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT cliente, situacao, operador, quantidade_itens "
                        "FROM vw_comandas"
                    ).fetchone(),
                    ("Ana", "em-preparo", "Elaine", 2),
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


class StateApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        root = Path(self.temporary_directory.name)
        self.storage = StateStorage(
            database_path=root / "data" / "state.db",
            backup_directory=root / "backups",
        )
        self.server = PoolCompanionServer(
            ("127.0.0.1", 0),
            PoolCompanionHandler,
            root / "music",
            self.storage,
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

        status, saved = self._request(
            "PUT",
            "/api/state",
            {"state": {"cash": {"open": True}}, "expected_revision": 0},
        )
        self.assertEqual(status, 200)
        self.assertEqual(saved["revision"], 1)
        self.assertIsNotNone(saved["saved_at"])
        self.assertIsNotNone(saved["last_backup_at"])

        large_note = "x" * (40 * 1024)
        status, large_saved = self._request(
            "PUT",
            "/api/state",
            {
                "state": {"cash": {"open": True}, "note": large_note},
                "expected_revision": 1,
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(large_saved["revision"], 2)

        status, conflict = self._request(
            "PUT",
            "/api/state",
            {"state": {"cash": {"open": False}}, "expected_revision": 0},
        )
        self.assertEqual(status, 409)
        self.assertEqual(conflict["revision"], 2)
        self.assertEqual(
            conflict["state"],
            {"cash": {"open": True}, "note": large_note},
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
                2,
            )

    def test_public_demo_cannot_read_or_change_local_state(self) -> None:
        for method, path, payload in (
            ("GET", "/api/state", None),
            ("GET", "/api/database/export", None),
            ("POST", "/api/backups", None),
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
