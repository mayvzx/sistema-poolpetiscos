import hashlib
import io
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from local_service.update_checker import (
    UpdateCheckError,
    UpdateChecker,
    CREATE_BREAKAWAY_FROM_JOB,
    CREATE_NEW_PROCESS_GROUP,
    DETACHED_PROCESS,
    is_newer_version,
    launch_installer,
    parse_latest_release,
    parse_update_manifest,
    parse_version,
)


class UpdateCheckerRulesTest(unittest.TestCase):
    def test_launches_installer_detached_from_launcher_job(self) -> None:
        with (
            patch("local_service.update_checker.os.name", "nt"),
            patch("local_service.update_checker.subprocess.Popen") as popen,
        ):
            launch_installer(r"C:\PoolPetiscos\updates\PoolPetiscos-Setup-2.0.0.exe")

        popen.assert_called_once()
        arguments, options = popen.call_args
        self.assertEqual(
            arguments[0],
            [r"C:\PoolPetiscos\updates\PoolPetiscos-Setup-2.0.0.exe"],
        )
        self.assertTrue(options["close_fds"])
        self.assertEqual(
            options["creationflags"],
            CREATE_BREAKAWAY_FROM_JOB | CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS,
        )

    def test_falls_back_to_shell_when_breakaway_is_rejected(self) -> None:
        with (
            patch("local_service.update_checker.os.name", "nt"),
            patch(
                "local_service.update_checker.subprocess.Popen",
                side_effect=OSError("breakaway recusado"),
            ),
            patch("local_service.update_checker.os.startfile", create=True) as startfile,
        ):
            launch_installer(r"C:\PoolPetiscos\updates\PoolPetiscos-Setup-2.0.0.exe")

        startfile.assert_called_once_with(
            r"C:\PoolPetiscos\updates\PoolPetiscos-Setup-2.0.0.exe"
        )

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

    def test_accepts_the_same_origin_manifest_with_exact_github_asset(self) -> None:
        digest = "b" * 64
        status = parse_update_manifest(
            {
                "version": "1.9.0",
                "release_url": (
                    "https://github.com/mayvzx/sistema-poolpetiscos/"
                    "releases/tag/v1.9.0"
                ),
                "release_name": "Pool Petiscos 1.9.0",
                "installer": {
                    "name": "PoolPetiscos-Setup-1.9.0.exe",
                    "size": 321,
                    "sha256": digest,
                    "download_url": (
                        "https://github.com/mayvzx/sistema-poolpetiscos/"
                        "releases/download/v1.9.0/"
                        "PoolPetiscos-Setup-1.9.0.exe"
                    ),
                },
            },
            "1.8.0",
        )

        self.assertTrue(status["available"])
        self.assertEqual(status["source"], "manifest")
        self.assertEqual(status["verified_installer"]["digest"], f"sha256:{digest}")

    def test_rejects_manifest_that_redirects_to_another_download(self) -> None:
        with self.assertRaises(UpdateCheckError):
            parse_update_manifest(
                {
                    "version": "1.9.0",
                    "release_url": (
                        "https://github.com/mayvzx/sistema-poolpetiscos/"
                        "releases/tag/v1.9.0"
                    ),
                    "installer": {
                        "name": "PoolPetiscos-Setup-1.9.0.exe",
                        "size": 321,
                        "sha256": "c" * 64,
                        "download_url": "https://example.com/setup.exe",
                    },
                },
                "1.8.0",
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

    def test_schedules_only_a_locally_verified_installer(self) -> None:
        contents = b"installer-pronto-para-execucao"
        digest = hashlib.sha256(contents).hexdigest()
        launched = threading.Event()
        launched_paths: list[str] = []

        def launch(path: str) -> None:
            launched_paths.append(path)
            launched.set()

        with tempfile.TemporaryDirectory() as directory:
            update_directory = Path(directory)
            installer = update_directory / "PoolPetiscos-Setup-1.9.0.exe"
            installer.write_bytes(contents)
            checker = UpdateChecker(
                "1.8.0",
                update_directory,
                clock=lambda: 1000,
                installer_launcher=launch,
                install_launch_delay=0,
            )
            checker._cached_at = 1000
            checker._cached_status = {
                "current_version": "1.8.0",
                "latest_version": "1.9.0",
                "available": True,
                "verified_installer": {
                    "name": installer.name,
                    "size": len(contents),
                    "digest": f"sha256:{digest}",
                    "download_url": (
                        "https://github.com/mayvzx/sistema-poolpetiscos/"
                        "releases/download/v1.9.0/"
                        "PoolPetiscos-Setup-1.9.0.exe"
                    ),
                },
            }

            status = checker.check()
            self.assertEqual(status["downloaded_installer"]["version"], "1.9.0")
            result = checker.install_verified_update()
            self.assertTrue(result["scheduled"])
            self.assertTrue(launched.wait(1))
            self.assertEqual(
                [Path(path).resolve() for path in launched_paths],
                [installer.resolve()],
            )

            installer.write_bytes(b"alterado")
            with self.assertRaises(UpdateCheckError):
                checker.install_verified_update()


if __name__ == "__main__":
    unittest.main()
