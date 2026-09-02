"""Safe update checks and verified installer hand-off for Pool Petiscos."""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import threading
import time
from pathlib import Path
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

GITHUB_LATEST_RELEASE_URL = (
    "https://api.github.com/repos/mayvzx/sistema-poolpetiscos/releases/latest"
)
UPDATE_MANIFEST_URL = (
    "https://pool-petiscos-caixa.mayrom.chatgpt.site/update/latest.json"
)
OFFICIAL_RELEASES_URL = (
    "https://github.com/mayvzx/sistema-poolpetiscos/releases/"
)
OFFICIAL_DOWNLOADS_URL = f"{OFFICIAL_RELEASES_URL}download/"
CHECK_INTERVAL_SECONDS = 24 * 60 * 60
MAX_INSTALLER_BYTES = 250 * 1024 * 1024
VERSION_PATTERN = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)$")
SHA256_PATTERN = re.compile(r"^sha256:([0-9a-fA-F]{64})$")
CREATE_BREAKAWAY_FROM_JOB = 0x01000000
CREATE_NEW_PROCESS_GROUP = 0x00000200
DETACHED_PROCESS = 0x00000008


class UpdateCheckError(RuntimeError):
    """A safe, user-presentable update failure."""


def launch_installer(path: str) -> None:
    """Open an installer outside the launcher's kill-on-close job.

    The local service is a child of the launcher. A normal child process can
    therefore be terminated when the launcher shuts down, which would also
    terminate the installer halfway through the update. Windows allows a
    process to leave the job only when the launcher opted into breakaway; the
    launcher configures that flag and this function requests it explicitly.
    """

    if os.name != "nt":
        raise OSError("A instalação automática está disponível somente no Windows.")
    try:
        subprocess.Popen(  # noqa: S603
            [path],
            close_fds=True,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=(
                CREATE_BREAKAWAY_FROM_JOB
                | CREATE_NEW_PROCESS_GROUP
                | DETACHED_PROCESS
            ),
        )
    except OSError:
        # Some locked-down Windows environments do not allow breakaway from
        # a job. ShellExecute remains a useful fallback; the installer itself
        # still performs the graceful shutdown handshake before copying files.
        os.startfile(path)  # type: ignore[attr-defined]


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
        OFFICIAL_RELEASES_URL
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
                and download_url.startswith(OFFICIAL_DOWNLOADS_URL)
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


def parse_update_manifest(payload: object, current_version: str) -> dict[str, Any]:
    """Parse the static manifest while enforcing official release paths."""

    if not isinstance(payload, dict):
        raise UpdateCheckError("O manifesto de atualização é inválido.")
    latest_version = payload.get("version")
    if not isinstance(latest_version, str) or parse_version(latest_version) is None:
        raise UpdateCheckError("A versão publicada não pôde ser reconhecida.")
    latest_version = latest_version.removeprefix("v")

    release_url = payload.get("release_url")
    expected_release_url = f"{OFFICIAL_RELEASES_URL}tag/v{latest_version}"
    if release_url != expected_release_url:
        raise UpdateCheckError("O endereço da atualização não é confiável.")

    installer = payload.get("installer")
    selected_asset: dict[str, Any] | None = None
    expected_name = f"PoolPetiscos-Setup-{latest_version}.exe"
    if isinstance(installer, dict):
        name = installer.get("name")
        size = installer.get("size")
        sha256 = installer.get("sha256")
        download_url = installer.get("download_url")
        if isinstance(sha256, str) and not sha256.startswith("sha256:"):
            sha256 = f"sha256:{sha256}"
        expected_download_url = (
            f"{OFFICIAL_DOWNLOADS_URL}v{latest_version}/{expected_name}"
        )
        if (
            name == expected_name
            and isinstance(size, int)
            and not isinstance(size, bool)
            and 0 < size <= MAX_INSTALLER_BYTES
            and isinstance(sha256, str)
            and SHA256_PATTERN.fullmatch(sha256)
            and download_url == expected_download_url
        ):
            selected_asset = {
                "name": expected_name,
                "size": size,
                "digest": sha256.lower(),
                "download_url": download_url,
            }
    if selected_asset is None:
        raise UpdateCheckError(
            "O manifesto não contém um instalador oficial verificável."
        )

    return {
        "current_version": current_version,
        "latest_version": latest_version,
        "available": is_newer_version(latest_version, current_version),
        "release_url": release_url,
        "release_name": str(
            payload.get("release_name") or f"Versão {latest_version}"
        ),
        "published_at": str(payload.get("published_at") or ""),
        "notes": str(payload.get("notes") or "")[:4000],
        "verified_installer": selected_asset,
        "source": "manifest",
    }


class UpdateChecker:
    def __init__(
        self,
        current_version: str,
        update_directory: Path,
        *,
        clock: Callable[[], float] | None = None,
        installer_launcher: Callable[[str], None] | None = None,
        install_launch_delay: float = 0.75,
    ) -> None:
        if parse_version(current_version) is None:
            raise ValueError("Versão atual inválida.")
        self.current_version = current_version
        self.update_directory = update_directory.expanduser().resolve()
        self._clock = clock or time.time
        self._installer_launcher = installer_launcher
        self._install_launch_delay = max(0.0, install_launch_delay)
        self._cached_at = 0.0
        self._cached_status: dict[str, Any] | None = None
        self._lock = threading.RLock()

    def _read_json(self, url: str, *, github: bool = False) -> object:
        headers = {"User-Agent": f"PoolPetiscos/{self.current_version}"}
        if github:
            headers.update(
                {
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                }
            )
        request = Request(
            url,
            headers=headers,
        )
        with urlopen(request, timeout=8) as response:  # noqa: S310
            return json.loads(response.read().decode("utf-8"))

    def _read_release(self) -> dict[str, Any]:
        # The same-origin manifest avoids GitHub API rate limits. The official
        # release feed remains the trusted fallback.
        try:
            payload = self._read_json(UPDATE_MANIFEST_URL)
            return parse_update_manifest(payload, self.current_version)
        except (
            HTTPError,
            URLError,
            TimeoutError,
            UnicodeDecodeError,
            json.JSONDecodeError,
            UpdateCheckError,
        ):
            pass
        try:
            payload = self._read_json(GITHUB_LATEST_RELEASE_URL, github=True)
            status = parse_latest_release(payload, self.current_version)
            status["source"] = "github"
            return status
        except (
            HTTPError,
            URLError,
            TimeoutError,
            UnicodeDecodeError,
            json.JSONDecodeError,
            UpdateCheckError,
        ) as error:
            raise UpdateCheckError(
                "Não foi possível consultar atualizações agora."
            ) from error

    def _verified_local_installer(
        self,
        status: dict[str, Any],
    ) -> dict[str, Any] | None:
        asset = status.get("verified_installer")
        if not status.get("available") or not isinstance(asset, dict):
            return None
        digest_match = SHA256_PATTERN.fullmatch(str(asset.get("digest", "")))
        if digest_match is None:
            return None
        destination = self.update_directory / str(asset.get("name", ""))
        try:
            expected_size = int(asset["size"])
            if not destination.is_file() or destination.stat().st_size != expected_size:
                return None
            actual_digest = _sha256_file(destination)
        except (KeyError, OSError, TypeError, ValueError):
            return None
        if actual_digest != digest_match.group(1).lower():
            return None
        return {
            "version": status["latest_version"],
            "filename": destination.name,
            "file_path": str(destination),
            "sha256": actual_digest,
        }

    def _status_with_local_installer(
        self,
        status: dict[str, Any],
    ) -> dict[str, Any]:
        result = dict(status)
        result["downloaded_installer"] = self._verified_local_installer(status)
        return result

    def check(self, *, force: bool = False) -> dict[str, Any]:
        with self._lock:
            now = self._clock()
            if (
                not force
                and self._cached_status is not None
                and now - self._cached_at < CHECK_INTERVAL_SECONDS
            ):
                return self._status_with_local_installer(self._cached_status)
            status = self._read_release()
            status["checked_at"] = int(now * 1000)
            self._cached_status = status
            self._cached_at = now
            return self._status_with_local_installer(status)

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
            destination.unlink(missing_ok=True)
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

    def install_verified_update(self) -> dict[str, Any]:
        """Schedule the trusted installer after the HTTP response can finish."""

        with self._lock:
            status = self.check()
            installer = self._verified_local_installer(status)
            if installer is None:
                raise UpdateCheckError(
                    "Baixe e verifique o instalador antes de iniciar a atualização."
                )
            if self._installer_launcher is None and os.name != "nt":
                raise UpdateCheckError(
                    "A instalação automática está disponível somente no Windows."
                )
            path = str(installer["file_path"])

            def launch() -> None:
                try:
                    if self._installer_launcher is not None:
                        self._installer_launcher(path)
                    else:
                        launch_installer(path)
                except OSError:
                    # The HTTP response has already completed at this point.
                    return

            timer = threading.Timer(self._install_launch_delay, launch)
            timer.daemon = True
            timer.start()
            return {
                "scheduled": True,
                "version": installer["version"],
                "filename": installer["filename"],
            }
