from __future__ import annotations

import argparse
import contextlib
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from local_service.launcher import (
    open_data_directory,
    parse_arguments,
    should_open_browser,
)


class LauncherModeTest(unittest.TestCase):
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
