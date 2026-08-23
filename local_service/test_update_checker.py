import hashlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from local_service.update_checker import (
    UpdateCheckError,
    UpdateChecker,
    is_newer_version,
    parse_latest_release,
    parse_version,
)


class UpdateCheckerRulesTest(unittest.TestCase):
    def test_compares_only_strict_semantic_versions(self) -> None:
        self.assertEqual(parse_version("v1.7.0"), (1, 7, 0))
        self.assertTrue(is_newer_version("1.7.1", "1.7.0"))
        self.assertFalse(is_newer_version("1.7", "1.6.2"))
        self.assertFalse(is_newer_version("1.6.2", "1.6.2"))

    def test_accepts_only_the_exact_installer_with_sha256(self) -> None:
        digest = "a" * 64
        status = parse_latest_release(
            {
                "tag_name": "v1.7.1",
                "html_url": (
                    "https://github.com/mayvzx/sistema-poolpetiscos/"
                    "releases/tag/v1.7.1"
                ),
                "name": "Versão 1.7.1",
                "assets": [
                    {
                        "name": "PoolPetiscos-Setup-1.7.1.exe",
                        "size": 100,
                        "digest": f"sha256:{digest}",
                        "browser_download_url": (
                            "https://github.com/mayvzx/sistema-poolpetiscos/"
                            "releases/download/v1.7.1/"
                            "PoolPetiscos-Setup-1.7.1.exe"
                        ),
                    }
                ],
            },
            "1.7.0",
        )

        self.assertTrue(status["available"])
        self.assertEqual(status["verified_installer"]["digest"], f"sha256:{digest}")

    def test_rejects_release_outside_the_official_repository(self) -> None:
        with self.assertRaises(UpdateCheckError):
            parse_latest_release(
                {
                    "tag_name": "v9.0.0",
                    "html_url": "https://example.com/release",
                    "assets": [],
                },
                "1.7.0",
            )

    def test_uses_daily_cache_but_force_refreshes_immediately(self) -> None:
        now = [1_700_000_000.0]
        with tempfile.TemporaryDirectory() as directory:
            checker = UpdateChecker(
                "1.7.0",
                Path(directory),
                clock=lambda: now[0],
            )
            status = {
                "current_version": "1.7.0",
                "latest_version": "1.8.0",
                "available": True,
                "verified_installer": None,
            }
            with patch.object(checker, "_read_release", return_value=status) as read:
                checker.check()
                checker.check()
                self.assertEqual(read.call_count, 1)

                now[0] += 24 * 60 * 60
                checker.check()
                self.assertEqual(read.call_count, 2)

                checker.check(force=True)
                self.assertEqual(read.call_count, 3)

    def test_downloads_and_verifies_the_exact_installer(self) -> None:
        contents = b"installer-validado-1.8.0"
        digest = hashlib.sha256(contents).hexdigest()
        with tempfile.TemporaryDirectory() as directory:
            checker = UpdateChecker("1.7.0", Path(directory), clock=lambda: 1000)
            checker._cached_at = 1000
            checker._cached_status = {
                "current_version": "1.7.0",
                "latest_version": "1.8.0",
                "available": True,
                "verified_installer": {
                    "name": "PoolPetiscos-Setup-1.8.0.exe",
                    "size": len(contents),
                    "digest": f"sha256:{digest}",
                    "download_url": (
                        "https://github.com/mayvzx/sistema-poolpetiscos/"
                        "releases/download/v1.8.0/PoolPetiscos-Setup-1.8.0.exe"
                    ),
                },
            }

            with patch(
                "local_service.update_checker.urlopen",
                return_value=io.BytesIO(contents),
            ):
                result = checker.download_verified_installer()

            installer = Path(result["file_path"])
            self.assertEqual(installer.read_bytes(), contents)
            self.assertEqual(result["sha256"], digest)
            self.assertFalse(installer.with_suffix(".exe.part").exists())

    def test_removes_invalid_existing_or_partial_installer(self) -> None:
        contents = b"conteudo-corrompido"
        expected_digest = hashlib.sha256(b"conteudo-correto").hexdigest()
        with tempfile.TemporaryDirectory() as directory:
            update_directory = Path(directory)
            installer = update_directory / "PoolPetiscos-Setup-1.8.0.exe"
            installer.write_bytes(b"arquivo-antigo-invalido")
            checker = UpdateChecker("1.7.0", update_directory, clock=lambda: 1000)
            checker._cached_at = 1000
            checker._cached_status = {
                "current_version": "1.7.0",
                "latest_version": "1.8.0",
                "available": True,
                "verified_installer": {
                    "name": installer.name,
                    "size": len(contents),
                    "digest": f"sha256:{expected_digest}",
                    "download_url": (
                        "https://github.com/mayvzx/sistema-poolpetiscos/"
                        "releases/download/v1.8.0/PoolPetiscos-Setup-1.8.0.exe"
                    ),
                },
            }

            with patch(
                "local_service.update_checker.urlopen",
                return_value=io.BytesIO(contents),
            ):
                with self.assertRaises(UpdateCheckError):
                    checker.download_verified_installer()

            self.assertFalse(installer.exists())
            self.assertFalse(installer.with_suffix(".exe.part").exists())


if __name__ == "__main__":
    unittest.main()
