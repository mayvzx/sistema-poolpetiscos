from __future__ import annotations

import argparse
import contextlib
import io
import os
import socket
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from local_service.launcher import (
    DEFAULT_COMPANION_PORT,
    DEFAULT_SITE_PORT,
    open_data_directory,
    parse_arguments,
    port_available,
    services_ready,
    should_open_browser,
)


class LauncherModeTest(unittest.TestCase):
    def test_installed_defaults_use_dedicated_ports(self) -> None:
        self.assertEqual(DEFAULT_SITE_PORT, 14173)
        self.assertEqual(DEFAULT_COMPANION_PORT, 18765)

    def test_port_check_detects_a_non_http_listener(self) -> None:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.bind(("127.0.0.1", 0))
            listener.listen()
            port = listener.getsockname()[1]
            self.assertFalse(port_available(port))

        self.assertTrue(port_available(port))

    def test_existing_instance_requires_site_and_companion(self) -> None:
        with patch(
            "local_service.launcher.endpoint_ready",
            side_effect=[True, False],
        ):
            self.assertFalse(
                services_ready(
                    "http://127.0.0.1:14173",
                    "http://127.0.0.1:18765/api/health",
                )
            )

        with patch(
            "local_service.launcher.endpoint_ready",
            side_effect=[True, True],
        ):
            self.assertTrue(
                services_ready(
                    "http://127.0.0.1:14173",
                    "http://127.0.0.1:18765/api/health",
                )
            )

    def test_startup_opens_browser_after_services_are_ready(self) -> None:
        startup = argparse.Namespace(
            background=False,
            no_browser=False,
            startup=True,
        )
        background = argparse.Namespace(
            background=True,
            no_browser=False,
            startup=False,
        )
        smoke_test = argparse.Namespace(
            background=False,
            no_browser=True,
            startup=True,
        )

        self.assertTrue(should_open_browser(startup))
        self.assertFalse(should_open_browser(background))
        self.assertFalse(should_open_browser(smoke_test))

    def test_background_and_startup_are_mutually_exclusive(self) -> None:
        with patch.object(
            sys,
            "argv",
            ["PoolPetiscos.exe", "--background", "--startup"],
        ):
            with contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit):
                    parse_arguments()

    def test_data_shortcut_creates_and_opens_the_user_directory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "PoolPetiscos"
            with (
                patch.dict(
                    os.environ,
                    {"POOL_PETISCOS_HOME_DIR": str(target)},
                ),
                patch("local_service.launcher.os.name", "nt"),
                patch(
                    "local_service.launcher.os.startfile",
                    create=True,
                ) as start_file,
            ):
                self.assertEqual(open_data_directory(), 0)

            self.assertTrue(target.is_dir())
            start_file.assert_called_once_with(str(target.resolve()))


if __name__ == "__main__":
    unittest.main()
