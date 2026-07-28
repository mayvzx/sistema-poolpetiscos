from __future__ import annotations

import re
import threading
from collections.abc import Callable
from typing import Any
from urllib.parse import urlparse

DEFAULT_YOUTUBE_SEARCH_LIMIT = 5
MAX_YOUTUBE_SEARCH_LIMIT = 5
MAX_YOUTUBE_SEARCH_QUERY_CHARACTERS = 120
YOUTUBE_SEARCH_TIMEOUT_SECONDS = 15.0
YOUTUBE_SEARCH_CONCURRENCY = 2

_YOUTUBE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{3,64}$")


class YouTubeSearchBusy(RuntimeError):
    """Raised when all bounded YouTube search slots are occupied."""


class YouTubeSearchTimeout(TimeoutError):
    """Raised when a YouTube search exceeds its response deadline."""


class YouTubeSearchUnavailable(RuntimeError):
    """Raised when the bundled search component is unavailable."""


def validate_youtube_search_query(candidate: object) -> str:
    if not isinstance(candidate, str) or not candidate.strip():
        raise ValueError("Digite o nome de uma música ou artista.")
    if len(candidate) > MAX_YOUTUBE_SEARCH_QUERY_CHARACTERS:
        raise ValueError(
            "A pesquisa deve ter no máximo "
            f"{MAX_YOUTUBE_SEARCH_QUERY_CHARACTERS} caracteres."
        )
    if any(ord(character) < 32 for character in candidate):
        raise ValueError("Use apenas texto simples na pesquisa.")
    return " ".join(candidate.split())


def validate_youtube_search_limit(candidate: object | None) -> int:
    if candidate is None:
        return DEFAULT_YOUTUBE_SEARCH_LIMIT
    if isinstance(candidate, bool):
        raise ValueError("O limite da pesquisa deve ser um número de 1 a 5.")
    try:
        limit = int(candidate)
    except (TypeError, ValueError) as error:
        raise ValueError(
            "O limite da pesquisa deve ser um número de 1 a 5."
        ) from error
    if not 1 <= limit <= MAX_YOUTUBE_SEARCH_LIMIT:
        raise ValueError("O limite da pesquisa deve ficar entre 1 e 5.")
    return limit


def _safe_http_url(candidate: object) -> str | None:
    if not isinstance(candidate, str):
        return None
    candidate = candidate.strip()
    if not candidate or len(candidate) > 2048:
        return None
    try:
        parsed = urlparse(candidate)
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return None
    return candidate


def _entry_thumbnail(entry: dict[str, Any]) -> str | None:
    direct = _safe_http_url(entry.get("thumbnail"))
    if direct:
        return direct
    thumbnails = entry.get("thumbnails")
    if not isinstance(thumbnails, list):
        return None
    for thumbnail in reversed(thumbnails):
        if isinstance(thumbnail, dict):
            candidate = _safe_http_url(thumbnail.get("url"))
            if candidate:
                return candidate
    return None


def _entry_duration(candidate: object) -> int | None:
    if isinstance(candidate, bool):
        return None
    try:
        duration = int(float(candidate))
    except (TypeError, ValueError, OverflowError):
        return None
    return duration if duration >= 0 else None


def normalize_youtube_search_results(
    extracted: object,
    limit: int,
) -> list[dict[str, Any]]:
    limit = validate_youtube_search_limit(limit)
    if not isinstance(extracted, dict):
        return []
    entries = extracted.get("entries")
    if not isinstance(entries, list):
        return []

    results: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        video_id = str(entry.get("id") or "").strip()
        title = str(entry.get("title") or "").strip()
        if (
            not title
            or not _YOUTUBE_ID_PATTERN.fullmatch(video_id)
            or video_id in seen_ids
        ):
            continue
        channel = str(
            entry.get("channel")
            or entry.get("uploader")
            or entry.get("creator")
            or ""
        ).strip()
        results.append(
            {
                "id": video_id,
                "title": title[:300],
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "channel": channel[:200],
                "duration": _entry_duration(entry.get("duration")),
                "thumbnail": _entry_thumbnail(entry),
            }
        )
        seen_ids.add(video_id)
        if len(results) >= limit:
            break
    return results


def search_youtube(
    query: str,
    limit: int = DEFAULT_YOUTUBE_SEARCH_LIMIT,
    *,
    downloader_factory: Callable[[dict[str, Any]], Any] | None = None,
) -> list[dict[str, Any]]:
    query = validate_youtube_search_query(query)
    limit = validate_youtube_search_limit(limit)
    if downloader_factory is None:
        try:
            import yt_dlp
        except ImportError as error:
            raise YouTubeSearchUnavailable(
                "O componente de pesquisa não está disponível."
            ) from error
        downloader_factory = yt_dlp.YoutubeDL

    options = {
        "extract_flat": "in_playlist",
        "skip_download": True,
        "playlistend": limit,
        "quiet": True,
        "no_warnings": True,
        # Uma falha real do extrator precisa chegar à interface como erro, em
        # vez de parecer uma pesquisa válida sem resultados.
        "ignoreerrors": False,
        "socket_timeout": 8,
        "retries": 1,
        "extractor_retries": 1,
        "cachedir": False,
    }
    with downloader_factory(options) as downloader:
        extracted = downloader.extract_info(
            f"ytsearch{limit}:{query}",
            download=False,
        )
    return normalize_youtube_search_results(extracted, limit)


def run_youtube_search_with_timeout(
    searcher: Callable[[str, int], list[dict[str, Any]]],
    query: str,
    limit: int,
    *,
    timeout_seconds: float,
    slots: threading.BoundedSemaphore,
) -> list[dict[str, Any]]:
    if timeout_seconds <= 0:
        raise ValueError("O tempo limite da pesquisa deve ser positivo.")
    if not slots.acquire(blocking=False):
        raise YouTubeSearchBusy("Todas as pesquisas disponíveis estão ocupadas.")

    completed = threading.Event()
    outcome: dict[str, object] = {}

    def worker() -> None:
        try:
            outcome["results"] = searcher(query, limit)
        except Exception as error:  # a resposta HTTP traduz sem expor detalhes
            outcome["error"] = error
        finally:
            slots.release()
            completed.set()

    threading.Thread(
        target=worker,
        name="pool-youtube-search",
        daemon=True,
    ).start()
    if not completed.wait(timeout_seconds):
        raise YouTubeSearchTimeout("A pesquisa excedeu o tempo limite.")

    error = outcome.get("error")
    if isinstance(error, Exception):
        raise error
    results = outcome.get("results")
    if not isinstance(results, list):
        raise RuntimeError("A pesquisa retornou uma resposta inválida.")
    return results[:limit]
