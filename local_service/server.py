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
import sqlite3
import threading
import uuid
from collections.abc import Callable
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

from local_service.storage import (
    RevisionConflict,
    StateStorage,
    default_database_path,
)
from local_service.youtube_search import (
    DEFAULT_YOUTUBE_SEARCH_LIMIT,
    YOUTUBE_SEARCH_CONCURRENCY,
    YOUTUBE_SEARCH_TIMEOUT_SECONDS,
    YouTubeSearchBusy,
    YouTubeSearchTimeout,
    YouTubeSearchUnavailable,
    run_youtube_search_with_timeout,
    search_youtube,
    validate_youtube_search_limit,
    validate_youtube_search_query,
)

SERVICE_VERSION = "1.2.1"
DEFAULT_PORT = 18765
MAX_BODY_BYTES = 32 * 1024
MAX_STATE_BODY_BYTES = 10 * 1024 * 1024
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
_download_lock = threading.Lock()


def default_music_directory() -> Path:
    local_data = os.environ.get("LOCALAPPDATA")
    base = Path(local_data) if local_data else Path.home() / ".pool-petiscos"
    return base / "PoolPetiscos" / "musicas"


def is_local_origin(origin: str | None) -> bool:
    if not origin:
        return True
    try:
        parsed = urlparse(origin)
    except ValueError:
        return False
    return (
        parsed.scheme in {"http", "https"}
        and parsed.hostname in {"127.0.0.1", "localhost", "::1"}
    )


def is_allowed_origin(origin: str | None) -> bool:
    """Keep every installed companion capability inside the local interface."""

    return is_local_origin(origin)


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


def library_fingerprints(music_directory: Path) -> dict[Path, tuple[int, int]]:
    return {
        path.resolve(): (path.stat().st_mtime_ns, path.stat().st_size)
        for path in music_directory.iterdir()
        if path.is_file()
    }


def find_downloaded_audio(
    music_directory: Path,
    media_id: str,
    existing_files: dict[Path, tuple[int, int]],
) -> Path:
    supported_files = [
        path
        for path in music_directory.iterdir()
        if path.is_file() and path.suffix.lower() in SUPPORTED_AUDIO_SUFFIXES
    ]
    candidates = (
        [
            path
            for path in supported_files
            if path.stem.endswith(f"[{media_id}]")
        ]
        if media_id
        else []
    )
    if not candidates:
        candidates = [
            path
            for path in supported_files
            if existing_files.get(path.resolve())
            != (path.stat().st_mtime_ns, path.stat().st_size)
        ]
    if not candidates:
        raise RuntimeError(
            "A faixa foi processada, mas o arquivo final não foi encontrado."
        )
    return max(candidates, key=lambda path: path.stat().st_mtime_ns)


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
                "O componente de download não está disponível."
            )
        if shutil.which("ffmpeg") is None:
            raise RuntimeError(
                "O componente de áudio não está disponível."
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
        with _download_lock:
            existing_files = library_fingerprints(music_directory)
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
                    raise RuntimeError(
                        "Cole o link de uma única faixa, não de uma playlist."
                    )
                info = entries[0]

            media_id = str(info.get("id") or "").strip()
            final_path = find_downloaded_audio(
                music_directory,
                media_id,
                existing_files,
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
        storage: StateStorage | None = None,
        youtube_searcher: (
            Callable[[str, int], list[dict[str, Any]]] | None
        ) = None,
        youtube_search_timeout_seconds: float = YOUTUBE_SEARCH_TIMEOUT_SECONDS,
    ) -> None:
        super().__init__(server_address, handler_class)
        self.music_directory = music_directory
        self.storage = storage or StateStorage()
        self.youtube_searcher = youtube_searcher or search_youtube
        self.youtube_search_timeout_seconds = youtube_search_timeout_seconds
        self.youtube_search_slots = threading.BoundedSemaphore(
            YOUTUBE_SEARCH_CONCURRENCY
        )


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

    def _reject_sensitive_origin(self) -> bool:
        if is_local_origin(self._origin()):
            return False
        self._send_json(
            {
                "error": (
                    "Os dados do caixa só podem ser acessados pela instalação "
                    "local."
                )
            },
            HTTPStatus.FORBIDDEN,
        )
        return True

    def _send_database(self) -> None:
        try:
            body = self.pool_server.storage.export_database()
        except (OSError, sqlite3.Error) as error:
            self.log_error("falha ao exportar banco local: %s", error)
            self._send_json(
                {"error": "Não foi possível preparar a cópia do banco."},
                HTTPStatus.INTERNAL_SERVER_ERROR,
            )
            return

        self.send_response(HTTPStatus.OK)
        self._set_cors_headers()
        self.send_header("Content-Type", "application/vnd.sqlite3")
        self.send_header(
            "Content-Disposition",
            'attachment; filename="pool-petiscos.db"',
        )
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        if self._reject_origin():
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self._set_cors_headers()
        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, POST, PUT, OPTIONS",
        )
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self) -> None:
        if self._reject_origin():
            return
        parsed = urlparse(self.path)
        if parsed.path == "/api/youtube/search":
            try:
                parameters = parse_qs(
                    parsed.query,
                    keep_blank_values=True,
                    max_num_fields=10,
                )
            except ValueError:
                self._send_json(
                    {
                        "code": "invalid_search",
                        "error": "A pesquisa contém parâmetros inválidos.",
                    },
                    HTTPStatus.BAD_REQUEST,
                )
                return
            try:
                queries = parameters.get("q", [])
                limits = parameters.get("limit", [])
                if len(queries) != 1 or len(limits) > 1:
                    raise ValueError("Informe uma única pesquisa por vez.")
                query = validate_youtube_search_query(queries[0])
                limit = validate_youtube_search_limit(
                    limits[0] if limits else DEFAULT_YOUTUBE_SEARCH_LIMIT
                )
            except ValueError as error:
                self._send_json(
                    {"code": "invalid_search", "error": str(error)},
                    HTTPStatus.BAD_REQUEST,
                )
                return

            try:
                results = run_youtube_search_with_timeout(
                    self.pool_server.youtube_searcher,
                    query,
                    limit,
                    timeout_seconds=(
                        self.pool_server.youtube_search_timeout_seconds
                    ),
                    slots=self.pool_server.youtube_search_slots,
                )
            except YouTubeSearchBusy:
                self._send_json(
                    {
                        "code": "search_busy",
                        "error": (
                            "Há outras pesquisas em andamento. "
                            "Tente novamente em instantes."
                        )
                    },
                    HTTPStatus.TOO_MANY_REQUESTS,
                )
                return
            except YouTubeSearchTimeout:
                self._send_json(
                    {
                        "code": "search_timeout",
                        "error": (
                            "A pesquisa demorou mais do que o esperado. "
                            "Tente novamente."
                        )
                    },
                    HTTPStatus.GATEWAY_TIMEOUT,
                )
                return
            except (ImportError, YouTubeSearchUnavailable):
                self._send_json(
                    {
                        "code": "search_unavailable",
                        "error": (
                            "A pesquisa de músicas não está disponível "
                            "neste computador."
                        )
                    },
                    HTTPStatus.SERVICE_UNAVAILABLE,
                )
                return
            except Exception as error:
                self.log_error(
                    "falha na pesquisa do YouTube (%s)",
                    type(error).__name__,
                )
                self._send_json(
                    {
                        "code": "search_failed",
                        "error": (
                            "Não foi possível pesquisar no YouTube agora. "
                            "Tente novamente."
                        )
                    },
                    HTTPStatus.BAD_GATEWAY,
                )
                return
            self._send_json({"results": results[:limit]})
            return
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
        if parsed.path == "/api/database/export":
            if self._reject_sensitive_origin():
                return
            self._send_database()
            return
        if parsed.path == "/api/state":
            if self._reject_sensitive_origin():
                return
            try:
                snapshot = self.pool_server.storage.read()
                backup_info = self.pool_server.storage.backup_info()
            except (OSError, sqlite3.Error, RuntimeError) as error:
                self.log_error("falha ao ler estado local: %s", error)
                self._send_json(
                    {"error": "O armazenamento local não está disponível."},
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                )
                return
            self._send_json(
                {
                    "state": snapshot.state,
                    "revision": snapshot.revision,
                    "saved_at": snapshot.saved_at,
                    "storage": "sqlite",
                    **backup_info,
                }
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
        if parsed.path == "/api/backups":
            if self._reject_sensitive_origin():
                return
            try:
                backup_path = self.pool_server.storage.ensure_daily_backup(
                    force=True
                )
            except (OSError, sqlite3.Error) as error:
                self.log_error("falha ao criar backup manual: %s", error)
                self._send_json(
                    {"error": "Não foi possível criar o backup local."},
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                )
                return
            self._send_json(
                {
                    "filename": backup_path.name,
                    "storage": "sqlite",
                    **self.pool_server.storage.backup_info(),
                },
                HTTPStatus.CREATED,
            )
            return
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

    def do_PUT(self) -> None:
        if self._reject_origin():
            return
        parsed = urlparse(self.path)
        if parsed.path != "/api/state":
            self._send_json({"error": "Rota não encontrada."}, HTTPStatus.NOT_FOUND)
            return
        if self._reject_sensitive_origin():
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_STATE_BODY_BYTES:
            self._send_json(
                {"error": "Conteúdo inválido ou muito grande."},
                HTTPStatus.BAD_REQUEST,
            )
            return

        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError, RecursionError):
            self._send_json(
                {"error": "O corpo deve conter JSON válido."},
                HTTPStatus.BAD_REQUEST,
            )
            return

        if not isinstance(payload, dict) or not isinstance(
            payload.get("state"), dict
        ):
            self._send_json(
                {"error": "O campo state deve ser um objeto."},
                HTTPStatus.BAD_REQUEST,
            )
            return

        expected_revision = payload.get("expected_revision")
        if expected_revision is not None and (
            isinstance(expected_revision, bool)
            or not isinstance(expected_revision, int)
            or expected_revision < 0
        ):
            self._send_json(
                {
                    "error": (
                        "expected_revision deve ser um número inteiro "
                        "maior ou igual a zero."
                    )
                },
                HTTPStatus.BAD_REQUEST,
            )
            return

        try:
            snapshot = self.pool_server.storage.save(
                payload["state"],
                expected_revision=expected_revision,
            )
        except RevisionConflict as error:
            current = error.snapshot
            self._send_json(
                {
                    "error": str(error),
                    "state": current.state,
                    "revision": current.revision,
                },
                HTTPStatus.CONFLICT,
            )
            return
        except (TypeError, ValueError, OverflowError, RecursionError) as error:
            self._send_json(
                {"error": f"O estado contém dados inválidos: {error}"},
                HTTPStatus.BAD_REQUEST,
            )
            return
        except (OSError, sqlite3.Error, RuntimeError) as error:
            self.log_error("falha ao salvar estado local: %s", error)
            self._send_json(
                {"error": "Não foi possível salvar no armazenamento local."},
                HTTPStatus.INTERNAL_SERVER_ERROR,
            )
            return

        self._send_json(
            {
                "revision": snapshot.revision,
                "saved_at": snapshot.saved_at,
                "storage": "sqlite",
                **self.pool_server.storage.backup_info(),
            }
        )

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
    parser.add_argument(
        "--database",
        type=Path,
        default=default_database_path(),
    )
    parser.add_argument(
        "--backup-dir",
        type=Path,
        default=None,
    )
    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()
    music_directory = arguments.music_dir.expanduser().resolve()
    music_directory.mkdir(parents=True, exist_ok=True)
    storage = StateStorage(
        database_path=arguments.database,
        backup_directory=arguments.backup_dir,
    )
    if storage.read().state is not None:
        try:
            storage.ensure_daily_backup(force=True)
        except (OSError, sqlite3.Error) as error:
            print(f"[companion] aviso: backup automático indisponível: {error}")
    server = PoolCompanionServer(
        ("127.0.0.1", arguments.port),
        PoolCompanionHandler,
        music_directory,
        storage,
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
