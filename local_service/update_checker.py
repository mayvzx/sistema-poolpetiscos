"""Safe, notice-first update checks against the public GitHub release feed."""

from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import time
from pathlib import Path
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

GITHUB_LATEST_RELEASE_URL = (
    "https://api.github.com/repos/mayvzx/sistema-poolpetiscos/releases/latest"
)
CHECK_INTERVAL_SECONDS = 24 * 60 * 60
MAX_INSTALLER_BYTES = 250 * 1024 * 1024
VERSION_PATTERN = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)$")
SHA256_PATTERN = re.compile(r"^sha256:([0-9a-fA-F]{64})$")


class UpdateCheckError(RuntimeError):
    """A safe, user-presentable update failure."""


def parse_version(value: str) -> tuple[int, int, int] | None:
    match = VERSION_PATTERN.fullmatch(value.strip())
    if not match:
        return None
    return tuple(int(part) for part in match.groups())  # type: ignore[return-value]


def is_newer_version(candidate: str, current: str) -> bool:
    parsed_candidate = parse_version(candidate)
    parsed_current = parse_version(current)
    return bool(
        parsed_candidate
        and parsed_current
        and parsed_candidate > parsed_current
    )


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def parse_latest_release(payload: object, current_version: str) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise UpdateCheckError("A resposta de atualização é inválida.")
    tag = payload.get("tag_name")
    if not isinstance(tag, str) or parse_version(tag) is None:
        raise UpdateCheckError("A versão publicada não pôde ser reconhecida.")
    latest_version = tag.removeprefix("v")
    release_url = payload.get("html_url")
    if not isinstance(release_url, str) or not release_url.startswith(
        "https://github.com/mayvzx/sistema-poolpetiscos/releases/"
    ):
        raise UpdateCheckError("O endereço da atualização não é confiável.")

    expected_name = f"PoolPetiscos-Setup-{latest_version}.exe"
    selected_asset: dict[str, Any] | None = None
    assets = payload.get("assets")
    if isinstance(assets, list):
        for asset in assets:
            if not isinstance(asset, dict) or asset.get("name") != expected_name:
                continue
            digest = asset.get("digest")
            size = asset.get("size")
            download_url = asset.get("browser_download_url")
            if (
                isinstance(digest, str)
                and SHA256_PATTERN.fullmatch(digest)
                and isinstance(size, int)
                and not isinstance(size, bool)
                and 0 < size <= MAX_INSTALLER_BYTES
                and isinstance(download_url, str)
                and download_url.startswith(
                    "https://github.com/mayvzx/sistema-poolpetiscos/releases/download/"
                )
            ):
                selected_asset = {
                    "name": expected_name,
                    "size": size,
                    "digest": digest.lower(),
                    "download_url": download_url,
                }
            break

    return {
        "current_version": current_version,
        "latest_version": latest_version,
        "available": is_newer_version(latest_version, current_version),
        "release_url": release_url,
        "release_name": str(payload.get("name") or f"Versão {latest_version}"),
        "published_at": str(payload.get("published_at") or ""),
        "notes": str(payload.get("body") or "")[:4000],
        "verified_installer": selected_asset,
    }


class UpdateChecker:
    def __init__(
        self,
        current_version: str,
        update_directory: Path,
        *,
        clock: Callable[[], float] | None = None,
    ) -> None:
        if parse_version(current_version) is None:
            raise ValueError("Versão atual inválida.")
        self.current_version = current_version
        self.update_directory = update_directory.expanduser().resolve()
        self._clock = clock or time.time
        self._cached_at = 0.0
        self._cached_status: dict[str, Any] | None = None
        self._lock = threading.RLock()

    def _read_release(self) -> dict[str, Any]:
        request = Request(
            GITHUB_LATEST_RELEASE_URL,
            headers={
                "Accept": "application/vnd.github+json",
                "User-Agent": f"PoolPetiscos/{self.current_version}",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        try:
            with urlopen(request, timeout=8) as response:  # noqa: S310
                payload = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise UpdateCheckError(
                "Não foi possível consultar atualizações agora."
            ) from error
        return parse_latest_release(payload, self.current_version)

    def check(self, *, force: bool = False) -> dict[str, Any]:
        with self._lock:
            now = self._clock()
            if (
                not force
                and self._cached_status is not None
                and now - self._cached_at < CHECK_INTERVAL_SECONDS
            ):
                return dict(self._cached_status)
            status = self._read_release()
            status["checked_at"] = int(now * 1000)
            self._cached_status = status
            self._cached_at = now
            return dict(status)

    def download_verified_installer(self) -> dict[str, Any]:
        with self._lock:
            status = self.check()
            if not status["available"]:
                raise UpdateCheckError("Este aplicativo já está atualizado.")
            asset = status.get("verified_installer")
            if not isinstance(asset, dict):
                raise UpdateCheckError(
                    "A versão existe, mas o instalador ainda não possui verificação SHA-256."
                )
            expected_digest_match = SHA256_PATTERN.fullmatch(str(asset["digest"]))
            if expected_digest_match is None:
                raise UpdateCheckError("O hash do instalador é inválido.")
            expected_digest = expected_digest_match.group(1).lower()
            expected_size = int(asset["size"])
            self.update_directory.mkdir(parents=True, exist_ok=True)
            destination = self.update_directory / str(asset["name"])
            temporary = destination.with_suffix(".exe.part")
            if destination.is_file() and destination.stat().st_size == expected_size:
                existing_digest = _sha256_file(destination)
                if existing_digest == expected_digest:
                    return {
                        "downloaded": True,
                        "version": status["latest_version"],
                        "filename": destination.name,
                        "file_path": str(destination),
                        "sha256": expected_digest,
                    }
            digest = hashlib.sha256()
            written = 0
            request = Request(
                str(asset["download_url"]),
                headers={"User-Agent": f"PoolPetiscos/{self.current_version}"},
            )
            try:
                with urlopen(request, timeout=30) as response, temporary.open("wb") as output:  # noqa: S310
                    while True:
                        chunk = response.read(1024 * 1024)
                        if not chunk:
                            break
                        written += len(chunk)
                        if written > MAX_INSTALLER_BYTES or written > expected_size:
                            raise UpdateCheckError("O instalador excedeu o tamanho informado.")
                        digest.update(chunk)
                        output.write(chunk)
                if written != expected_size or digest.hexdigest() != expected_digest:
                    raise UpdateCheckError(
                        "O instalador baixado não passou na verificação de integridade."
                    )
                temporary.replace(destination)
            except UpdateCheckError:
                temporary.unlink(missing_ok=True)
                raise
            except (HTTPError, URLError, TimeoutError, OSError) as error:
                temporary.unlink(missing_ok=True)
                raise UpdateCheckError(
                    "Não foi possível baixar o instalador agora."
                ) from error
            return {
                "downloaded": True,
                "version": status["latest_version"],
                "filename": destination.name,
                "file_path": str(destination),
                "sha256": expected_digest,
            }

    def open_update_folder(self) -> dict[str, str]:
        self.update_directory.mkdir(parents=True, exist_ok=True)
        try:
            if os.name != "nt":
                raise OSError("Abertura automática disponível somente no Windows.")
            os.startfile(str(self.update_directory))  # type: ignore[attr-defined]
        except OSError as error:
            raise UpdateCheckError(
                "Não foi possível abrir a pasta de atualizações."
            ) from error
        return {"folder": str(self.update_directory)}
