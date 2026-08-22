import unittest

from local_service.update_checker import (
    UpdateCheckError,
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


if __name__ == "__main__":
    unittest.main()
