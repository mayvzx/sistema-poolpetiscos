import tempfile
import unittest
from pathlib import Path

from local_service.server import (
    human_size,
    is_allowed_origin,
    library_item,
    list_library,
    validate_media_url,
)


class CompanionRulesTest(unittest.TestCase):
    def test_accepts_only_pool_and_loopback_origins(self) -> None:
        self.assertTrue(is_allowed_origin(None))
        self.assertTrue(is_allowed_origin("http://127.0.0.1:4173"))
        self.assertTrue(is_allowed_origin("http://localhost:5173"))
        self.assertTrue(
            is_allowed_origin(
                "https://pool-petiscos-caixa.mayrom.chatgpt.site"
            )
        )
        self.assertFalse(is_allowed_origin("https://example.com"))

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


if __name__ == "__main__":
    unittest.main()
