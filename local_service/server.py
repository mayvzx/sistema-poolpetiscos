from __future__ import annotations

import argparse
import hashlib
import importlib.util
import ipaddress
import json
import mimetypes
import os
import re
import shutil
import threading
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

SERVICE_VERSION = "1.0.0"
DEFAULT_PORT = 8765
MAX_BODY_BYTES = 32 * 1024
SUPPORTED_AUDIO_SUFFIXES = {
    ".aac",
    ".flac",
    ".m4a",
    ".mp3",
    ".ogg",
    ".opus",
    ".wav",
    ".webm",
}
PRODUCTION_ORIGIN = "https://pool-petiscos-caixa.mayrom.chatgpt.site"

_jobs: dict[str, dict[str, Any]] = {}
_jobs_lock = threading.Lock()


def default_music_directory() -> Path:
    local_data = os.environ.get("LOCALAPPDATA")
    base = Path(local_data) if local_data else Path.home() / ".pool-petiscos"
    return base / "PoolPetiscos" / "musicas"


def is_allowed_origin(origin: str | None) -> bool:
    if not origin:
        return True
    if origin == PRODUCTION_ORIGIN:
        return True
    try:
        parsed = urlparse(origin)
    except ValueError:
        return False
    return (
        parsed.scheme in {"http", "https"}
        and parsed.hostname in {"127.0.0.1", "localhost", "::1"}
    )


def validate_media_url(candidate: object) -> str:
    if not isinstance(candidate, str):
        raise ValueError("Informe um link válido.")
    candidate = candidate.strip()
    if not candidate or len(candidate) > 2048:
        raise ValueError("Informe um link válido.")
    parsed = urlparse(candidate)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Use um link que comece com http:// ou https://.")
    hostname = parsed.hostname.lower()
    if hostname == "localhost":
        raise ValueError("Links locais não são permitidos.")
    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        address = None
    if address is not None and not address.is_global:
        raise ValueError("Endereços de rede local não são permitidos.")
    return candidate


def human_size(size_bytes: int) -> str:
    if size_bytes >= 1024 * 1024:
        return f"{size_bytes / 1024 / 1024:.1f} MB"
    return f"{max(1, round(size_bytes / 1024))} KB"


def library_item(path: Path) -> dict[str, Any]:
    stat = path.stat()
    digest = hashlib.sha256(path.name.encode("utf-8")).hexdigest()[:16]
    display_name = re.sub(r"\s+\[[^\]]+\]$", "", path.stem).strip() or path.stem
    return {
        "id": f"yt-dlp-{digest}",
        "name": display_name,
        "filename": path.name,
        "media_url": f"/media/{path.name}",
        "size": human_size(stat.st_size),
        "size_bytes": stat.st_size,
        "updated_at": int(stat.st_mtime * 1000),
    }


def list_library(music_directory: Path) -> list[dict[str, Any]]:
    music_directory.mkdir(parents=True, exist_ok=True)
    files = [
        path
        for path in music_directory.iterdir()
        if path.is_file() and path.suffix.lower() in SUPPORTED_AUDIO_SUFFIXES
    ]
    files.sort(key=lambda path: path.stat().st_mtime, reverse=True)
    return [library_item(path) for path in files]


def update_job(job_id: str, **changes: Any) -> None:
    with _jobs_lock:
        if job_id in _jobs:
            _jobs[job_id].update(changes)


def read_job(job_id: str) -> dict[str, Any] | None:
    with _jobs_lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None


def start_download(job_id: str, source_url: str, music_directory: Path) -> None:
    try:
        if importlib.util.find_spec("yt_dlp") is None:
            raise RuntimeError(
                "O yt-dlp não está instalado. Execute scripts/install-local.ps1."
            )
        if shutil.which("ffmpeg") is None:
            raise RuntimeError(
                "O FFmpeg não foi encontrado. Instale-o e reinicie o companion."
            )

        import yt_dlp

        def progress_hook(data: dict[str, Any]) -> None:
            status = data.get("status")
            if status == "downloading":
                downloaded = float(data.get("downloaded_bytes") or 0)
                total = float(
                    data.get("total_bytes")
                    or data.get("total_bytes_estimate")
                    or 0
                )
                progress = 15
                if total > 0:
                    progress = min(85, max(5, round(downloaded / total * 85)))
                update_job(
                    job_id,
                    status="downloading",
                    progress=progress,
                    message="Baixando a faixa…",
                )
            elif status == "finished":
                update_job(
                    job_id,
                    status="processing",
                    progress=90,
                    message="Convertendo para MP3…",
                )

        def postprocessor_hook(data: dict[str, Any]) -> None:
            if data.get("status") == "finished":
                update_job(
                    job_id,
                    status="processing",
                    progress=98,
                    message="Finalizando o arquivo…",
                )

        output_template = str(
            music_directory / "%(title).160B [%(id)s].%(ext)s"
        )
        options = {
            "format": "bestaudio/best",
            "noplaylist": True,
            "playlistend": 1,
            "outtmpl": output_template,
            "windowsfilenames": True,
            "trim_file_name": 190,
            "quiet": True,
            "no_warnings": True,
            "progress_hooks": [progress_hook],
            "postprocessor_hooks": [postprocessor_hook],
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }
            ],
        }

        music_directory.mkdir(parents=True, exist_ok=True)
        update_job(
            job_id,
            status="downloading",
            progress=5,
            message="Localizando a faixa…",
        )
        with yt_dlp.YoutubeDL(options) as downloader:
            info = downloader.extract_info(source_url, download=True)

        if info.get("_type") == "playlist":
            entries = [entry for entry in info.get("entries", []) if entry]
            if len(entries) != 1:
                raise RuntimeError("Cole o link de uma única faixa, não de uma playlist.")
            info = entries[0]

        media_id = str(info.get("id") or "").strip()
        candidates = (
            sorted(
                music_directory.glob(f"*[{media_id}].*"),
                key=lambda path: path.stat().st_mtime,
                reverse=True,
            )
            if media_id
            else []
        )
        final_path = next(
            (
                path
                for path in candidates
                if path.suffix.lower() in SUPPORTED_AUDIO_SUFFIXES
            ),
            None,
        )
        if final_path is None:
            final_path = max(
                (
                    path
                    for path in music_directory.iterdir()
                    if path.is_file()
                    and path.suffix.lower() in SUPPORTED_AUDIO_SUFFIXES
                ),
                key=lambda path: path.stat().st_mtime,
            )

        update_job(
            job_id,
            status="finished",
            progress=100,
            message="Faixa pronta na biblioteca local.",
            track=library_item(final_path),
        )
    except Exception as error:  # yt-dlp fornece mensagens próprias por extrator
        message = str(error).strip() or "Não foi possível baixar esta faixa."
        update_job(
            job_id,
            status="failed",
            progress=0,
            message=message[:400],
        )


class PoolCompanionServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(
        self,
        server_address: tuple[str, int],
        handler_class: type[BaseHTTPRequestHandler],
        music_directory: Path,
    ) -> None:
        super().__init__(server_address, handler_class)
        self.music_directory = music_directory


class PoolCompanionHandler(BaseHTTPRequestHandler):
    server_version = f"PoolCompanion/{SERVICE_VERSION}"

    @property
    def pool_server(self) -> PoolCompanionServer:
        return self.server  # type: ignore[return-value]

    def log_message(self, message_format: str, *args: object) -> None:
        print(f"[companion] {self.address_string()} - {message_format % args}")

    def _origin(self) -> str | None:
        return self.headers.get("Origin")

    def _set_cors_headers(self) -> None:
        origin = self._origin()
        if origin and is_allowed_origin(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def _send_json(
        self, payload: object, status: HTTPStatus = HTTPStatus.OK
    ) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._set_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _reject_origin(self) -> bool:
        if is_allowed_origin(self._origin()):
            return False
        self._send_json(
            {"error": "Origem não autorizada."},
            HTTPStatus.FORBIDDEN,
        )
        return True

    def do_OPTIONS(self) -> None:
        if self._reject_origin():
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self._set_cors_headers()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self) -> None:
        if self._reject_origin():
            return
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            self._send_json(
                {
                    "service": "Pool Petiscos Companion",
                    "version": SERVICE_VERSION,
                    "yt_dlp": importlib.util.find_spec("yt_dlp") is not None,
                    "ffmpeg": shutil.which("ffmpeg") is not None,
                    "music_directory": str(self.pool_server.music_directory),
                }
            )
            return
        if parsed.path == "/api/music/library":
            self._send_json(
                {"tracks": list_library(self.pool_server.music_directory)}
            )
            return
        if parsed.path.startswith("/api/music/jobs/"):
            job_id = parsed.path.rsplit("/", 1)[-1]
            job = read_job(job_id)
            if job is None:
                self._send_json(
                    {"error": "Download não encontrado."},
                    HTTPStatus.NOT_FOUND,
                )
            else:
                self._send_json(job)
            return
        if parsed.path.startswith("/media/"):
            self._send_media(unquote(parsed.path.removeprefix("/media/")))
            return
        self._send_json({"error": "Rota não encontrada."}, HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        if self._reject_origin():
            return
        parsed = urlparse(self.path)
        if parsed.path != "/api/music/download":
            self._send_json({"error": "Rota não encontrada."}, HTTPStatus.NOT_FOUND)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY_BYTES:
            self._send_json(
                {"error": "Conteúdo inválido."},
                HTTPStatus.BAD_REQUEST,
            )
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            source_url = validate_media_url(payload.get("url"))
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            self._send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
            return

        job_id = uuid.uuid4().hex
        with _jobs_lock:
            if len(_jobs) >= 100:
                oldest = next(iter(_jobs))
                _jobs.pop(oldest, None)
            _jobs[job_id] = {
                "id": job_id,
                "status": "queued",
                "progress": 0,
                "message": "Download adicionado à fila.",
            }
        worker = threading.Thread(
            target=start_download,
            args=(job_id, source_url, self.pool_server.music_directory),
            daemon=True,
        )
        worker.start()
        self._send_json(read_job(job_id), HTTPStatus.ACCEPTED)

    def _send_media(self, filename: str) -> None:
        if not filename or Path(filename).name != filename:
            self._send_json({"error": "Arquivo inválido."}, HTTPStatus.BAD_REQUEST)
            return
        root = self.pool_server.music_directory.resolve()
        path = (root / filename).resolve()
        if root not in path.parents or not path.is_file():
            self._send_json({"error": "Áudio não encontrado."}, HTTPStatus.NOT_FOUND)
            return

        file_size = path.stat().st_size
        start = 0
        end = file_size - 1
        status = HTTPStatus.OK
        range_header = self.headers.get("Range")
        if range_header:
            match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_header.strip())
            if not match:
                self.send_error(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                return
            if match.group(1):
                start = int(match.group(1))
            if match.group(2):
                end = int(match.group(2))
            if start > end or start >= file_size:
                self.send_error(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                return
            end = min(end, file_size - 1)
            status = HTTPStatus.PARTIAL_CONTENT

        content_length = end - start + 1
        content_type = mimetypes.guess_type(path.name)[0] or "audio/mpeg"
        self.send_response(status)
        self._set_cors_headers()
        self.send_header("Content-Type", content_type)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(content_length))
        self.send_header("Cache-Control", "private, max-age=3600")
        if status == HTTPStatus.PARTIAL_CONTENT:
            self.send_header(
                "Content-Range",
                f"bytes {start}-{end}/{file_size}",
            )
        self.end_headers()

        with path.open("rb") as audio_file:
            audio_file.seek(start)
            remaining = content_length
            while remaining > 0:
                chunk = audio_file.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Companion local da Pool Petiscos & Lanches."
    )
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument(
        "--music-dir",
        type=Path,
        default=default_music_directory(),
    )
    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()
    music_directory = arguments.music_dir.expanduser().resolve()
    music_directory.mkdir(parents=True, exist_ok=True)
    server = PoolCompanionServer(
        ("127.0.0.1", arguments.port),
        PoolCompanionHandler,
        music_directory,
    )
    print(
        f"Pool Companion em http://127.0.0.1:{arguments.port} "
        f"• biblioteca: {music_directory}"
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
