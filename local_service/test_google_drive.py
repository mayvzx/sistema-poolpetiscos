from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from local_service.google_drive import (
    DRIVE_FILE_SCOPE,
    GoogleDriveClient,
    GoogleDriveError,
    load_oauth_configuration,
)
from local_service.secure_store import ProtectedFileStore


class GoogleDriveConfigurationTest(unittest.TestCase):
    def test_loads_desktop_oauth_configuration_and_builds_pkce_url(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            configuration_path = root / "google-drive-oauth.json"
            configuration_path.write_text(
                json.dumps(
                    {
                        "installed": {
                            "client_id": "client.apps.googleusercontent.com",
                            "client_secret": "desktop-secret",
                        }
                    }
                ),
                encoding="utf-8",
            )
            configuration = load_oauth_configuration([configuration_path])
            self.assertIsNotNone(configuration)
            client = GoogleDriveClient(
                [configuration_path],
                root / "token.dpapi",
                clock=lambda: 1000.0,
            )

            authorization_url = client.begin_authorization(
                "http://127.0.0.1:18765/api/google-drive/oauth/callback"
            )
            parameters = parse_qs(urlparse(authorization_url).query)

            self.assertEqual(
                parameters["client_id"],
                ["client.apps.googleusercontent.com"],
            )
            self.assertEqual(parameters["scope"], [DRIVE_FILE_SCOPE])
            self.assertEqual(parameters["code_challenge_method"], ["S256"])
            self.assertNotIn("client_secret", parameters)
            self.assertGreater(len(parameters["state"][0]), 20)
            self.assertGreater(len(parameters["code_challenge"][0]), 20)

    def test_unconfigured_client_reports_status_and_blocks_connection(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            client = GoogleDriveClient(
                [root / "missing.json"], root / "token.dpapi"
            )
            self.assertEqual(client.status()["configured"], False)
            self.assertEqual(client.status()["connected"], False)
            with self.assertRaises(GoogleDriveError):
                client.begin_authorization("http://127.0.0.1/callback")

    def test_protected_file_store_round_trip(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = ProtectedFileStore(Path(directory) / "token.dpapi")
            store.save(b'{"refresh_token":"test"}')
            self.assertEqual(store.load(), b'{"refresh_token":"test"}')
            store.delete()
            self.assertFalse(store.exists())


if __name__ == "__main__":
    unittest.main()
