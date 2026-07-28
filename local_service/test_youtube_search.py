import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.parse import quote_plus

from local_service.server import (
    PoolCompanionHandler,
    PoolCompanionServer,
)
from local_service.storage import StateStorage
from local_service.youtube_search import (
    YouTubeSearchUnavailable,
    normalize_youtube_search_results,
    search_youtube,
    validate_youtube_search_limit,
    validate_youtube_search_query,
)


class FakeDownloader:
    def __init__(
        self,
        options: dict[str, object],
        extracted: dict[str, object],
        calls: list[tuple[str, bool]],
    ) -> None:
        self.options = options
        self.extracted = extracted
        self.calls = calls

    def __enter__(self) -> "FakeDownloader":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def extract_info(self, target: str, *, download: bool) -> dict[str, object]:
        self.calls.append((target, download))
        return self.extracted


class YouTubeSearchRulesTest(unittest.TestCase):
    def test_validates_query_and_limit(self) -> None:
        self.assertEqual(
            validate_youtube_search_query("  Gal   Costa  "),
            "Gal Costa",
        )
        self.assertEqual(validate_youtube_search_limit(None), 5)
        self.assertEqual(validate_youtube_search_limit("3"), 3)

        for invalid_query in (None, "", "   ", "música\nartista", "a" * 121):
            with self.subTest(query=invalid_query):
                with self.assertRaises(ValueError):
                    validate_youtube_search_query(invalid_query)
        for invalid_limit in (True, "", "abc", 0, 6):
            with self.subTest(limit=invalid_limit):
                with self.assertRaises(ValueError):
                    validate_youtube_search_limit(invalid_limit)

    def test_search_uses_flat_yt_dlp_without_downloading(self) -> None:
        calls: list[tuple[str, bool]] = []
        received_options: list[dict[str, object]] = []
        extracted = {
            "entries": [
                {
                    "id": "abcdefghijk",
                    "title": "Chuva de Prata",
                    "channel": "Gal Costa",
                    "duration": 188.9,
                    "thumbnail": "https://i.ytimg.com/vi/abcdefghijk/hq.jpg",
                }
            ]
        }

        def factory(options: dict[str, object]) -> FakeDownloader:
            received_options.append(options)
            return FakeDownloader(options, extracted, calls)

        results = search_youtube(
            "Chuva de Prata",
            5,
            downloader_factory=factory,
        )

        self.assertEqual(calls, [("ytsearch5:Chuva de Prata", False)])
        self.assertEqual(received_options[0]["extract_flat"], "in_playlist")
        self.assertTrue(received_options[0]["skip_download"])
        self.assertEqual(received_options[0]["playlistend"], 5)
        self.assertEqual(received_options[0]["socket_timeout"], 8)
        self.assertFalse(received_options[0]["ignoreerrors"])
        self.assertEqual(
            results,
            [
                {
                    "id": "abcdefghijk",
                    "title": "Chuva de Prata",
                    "url": (
                        "https://www.youtube.com/watch?v=abcdefghijk"
                    ),
                    "channel": "Gal Costa",
                    "duration": 188,
                    "thumbnail": (
                        "https://i.ytimg.com/vi/abcdefghijk/hq.jpg"
                    ),
                }
            ],
        )

    def test_normalizes_deduplicates_and_caps_flat_entries(self) -> None:
        extracted = {
            "entries": [
                None,
                {"id": "sem-titulo"},
                {
                    "id": "primeiro001",
                    "title": "Primeira",
                    "uploader": "Canal 1",
                    "duration": "42",
                    "thumbnails": [
                        {"url": "not-a-url"},
                        {"url": "https://img.example/primeira.jpg"},
                    ],
                },
                {
                    "id": "primeiro001",
                    "title": "Duplicada",
                },
                {
                    "id": "segundo0002",
                    "title": "Segunda",
                    "duration": -1,
                },
                {
                    "id": "terceiro003",
                    "title": "Não deve ultrapassar o limite",
                },
            ]
        }

        results = normalize_youtube_search_results(extracted, 2)

        self.assertEqual([result["id"] for result in results], [
            "primeiro001",
            "segundo0002",
        ])
        self.assertEqual(results[0]["channel"], "Canal 1")
        self.assertEqual(
            results[0]["thumbnail"],
            "https://img.example/primeira.jpg",
        )
        self.assertIsNone(results[1]["duration"])
        self.assertIsNone(results[1]["thumbnail"])


class YouTubeSearchApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        root = Path(self.temporary_directory.name)
        self.search_calls: list[tuple[str, int]] = []

        def fake_search(query: str, limit: int) -> list[dict[str, object]]:
            self.search_calls.append((query, limit))
            return [
                {
                    "id": f"video{number:06d}",
                    "title": f"Resultado {number}",
                    "url": (
                        "https://www.youtube.com/watch?v="
                        f"video{number:06d}"
                    ),
                    "channel": "Canal",
                    "duration": 180,
                    "thumbnail": (
                        f"https://img.example/video{number:06d}.jpg"
                    ),
                }
                for number in range(1, 8)
            ]

        self.storage = StateStorage(
            database_path=root / "data" / "state.db",
            backup_directory=root / "backups",
        )
        self.server = PoolCompanionServer(
            ("127.0.0.1", 0),
            PoolCompanionHandler,
            root / "music",
            self.storage,
            youtube_searcher=fake_search,
            youtube_search_timeout_seconds=0.1,
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

    def _request(self, path: str) -> tuple[int, dict[str, object]]:
        connection = http.client.HTTPConnection(
            "127.0.0.1",
            self.server.server_port,
            timeout=2,
        )
        connection.request(
            "GET",
            path,
            headers={"Origin": "http://127.0.0.1:4173"},
        )
        response = connection.getresponse()
        payload = json.loads(response.read().decode("utf-8"))
        connection.close()
        return response.status, payload

    def test_returns_five_results_by_default_and_honors_a_smaller_limit(
        self,
    ) -> None:
        status, payload = self._request(
            f"/api/youtube/search?q={quote_plus('Gal Costa')}"
        )
        self.assertEqual(status, 200)
        self.assertEqual(len(payload["results"]), 5)
        self.assertEqual(self.search_calls[-1], ("Gal Costa", 5))

        status, payload = self._request(
            "/api/youtube/search?q=Tim%20Maia&limit=2"
        )
        self.assertEqual(status, 200)
        self.assertEqual(len(payload["results"]), 2)
        self.assertEqual(self.search_calls[-1], ("Tim Maia", 2))

    def test_rejects_invalid_search_parameters_without_calling_provider(
        self,
    ) -> None:
        invalid_paths = [
            "/api/youtube/search",
            "/api/youtube/search?q=",
            "/api/youtube/search?q=uma&q=duas",
            "/api/youtube/search?q=teste&limit=",
            "/api/youtube/search?q=teste&limit=0",
            "/api/youtube/search?q=teste&limit=6",
            "/api/youtube/search?q=teste&limit=abc",
            f"/api/youtube/search?q={quote_plus('a' * 121)}",
        ]
        for path in invalid_paths:
            with self.subTest(path=path):
                status, payload = self._request(path)
                self.assertEqual(status, 400)
                self.assertEqual(payload["code"], "invalid_search")
                self.assertIsInstance(payload["error"], str)
        self.assertEqual(self.search_calls, [])

    def test_reports_busy_search_with_retryable_status(self) -> None:
        self.assertTrue(self.server.youtube_search_slots.acquire(blocking=False))
        self.assertTrue(self.server.youtube_search_slots.acquire(blocking=False))
        try:
            status, payload = self._request("/api/youtube/search?q=teste")
        finally:
            self.server.youtube_search_slots.release()
            self.server.youtube_search_slots.release()

        self.assertEqual(status, 429)
        self.assertEqual(payload["code"], "search_busy")

    def test_translates_provider_failure_without_exposing_details(self) -> None:
        def fail_search(_query: str, _limit: int) -> list[dict[str, object]]:
            raise RuntimeError("token-secreto-do-provedor")

        self.server.youtube_searcher = fail_search
        status, payload = self._request("/api/youtube/search?q=teste")

        self.assertEqual(status, 502)
        self.assertEqual(payload["code"], "search_failed")
        self.assertNotIn("token-secreto", json.dumps(payload))
        self.assertIn("Tente novamente", str(payload["error"]))

    def test_translates_missing_component_to_friendly_unavailable_error(
        self,
    ) -> None:
        def unavailable(
            _query: str,
            _limit: int,
        ) -> list[dict[str, object]]:
            raise YouTubeSearchUnavailable("detalhe interno")

        self.server.youtube_searcher = unavailable
        status, payload = self._request("/api/youtube/search?q=teste")

        self.assertEqual(status, 503)
        self.assertEqual(payload["code"], "search_unavailable")
        self.assertNotIn("detalhe interno", json.dumps(payload))
        self.assertIn("não está disponível", str(payload["error"]))

    def test_stops_waiting_and_returns_a_friendly_timeout(self) -> None:
        release_search = threading.Event()

        def slow_search(
            _query: str,
            _limit: int,
        ) -> list[dict[str, object]]:
            release_search.wait(1)
            return []

        self.server.youtube_searcher = slow_search
        self.server.youtube_search_timeout_seconds = 0.02
        try:
            status, payload = self._request(
                "/api/youtube/search?q=pesquisa%20lenta"
            )
        finally:
            release_search.set()

        self.assertEqual(status, 504)
        self.assertEqual(payload["code"], "search_timeout")
        self.assertIn("demorou", str(payload["error"]))
        self.assertNotIn("tempo limite", json.dumps(payload))


if __name__ == "__main__":
    unittest.main()
