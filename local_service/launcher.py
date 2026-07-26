"""Launcher do aplicativo local Pool Petiscos.

O executável gerado pelo PyInstaller inicia o companion Python e o servidor
React standalone com o Node portátil instalado junto do aplicativo. Todos os
processos escutam apenas em loopback.
"""

from __future__ import annotations

import argparse
import ctypes
import json
import logging
import os
import re
import signal
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from collections import deque
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import IO

APP_NAME = "Pool Petiscos"
DEFAULT_SITE_PORT = 4173
DEFAULT_COMPANION_PORT = 8765
MUTEX_NAME = r"Local\PoolPetiscosLauncher"
SHUTDOWN_EVENT_NAME = r"Local\PoolPetiscosShutdown"
ERROR_ALREADY_EXISTS = 183
EVENT_MODIFY_STATE = 0x0002
CREATE_NO_WINDOW = 0x08000000


def instance_object_name(base_name: str) -> str:
    suffix = os.environ.get("POOL_PETISCOS_INSTANCE_SUFFIX", "").strip()
    if not suffix:
        return base_name
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,48}", suffix):
        raise SystemExit("POOL_PETISCOS_INSTANCE_SUFFIX contém caracteres inválidos.")
    return f"{base_name}-{suffix}"


def _environment_port(name: str, default: int) -> int:
    raw_value = os.environ.get(name, str(default))
    try:
        port = int(raw_value)
    except ValueError as error:
        raise SystemExit(f"{name} precisa ser uma porta válida.") from error
    if not 1 <= port <= 65535:
        raise SystemExit(f"{name} precisa estar entre 1 e 65535.")
    return port


def data_directory() -> Path:
    override = os.environ.get("POOL_PETISCOS_HOME_DIR", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    local_app_data = os.environ.get("LOCALAPPDATA")
    base = Path(local_app_data) if local_app_data else Path.home() / ".local"
    return (base / "PoolPetiscos").resolve()


def installation_directory() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1]


def configure_logging(background: bool) -> logging.Logger:
    log_directory = data_directory() / "logs"
    log_directory.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("pool_petiscos.launcher")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()
    formatter = logging.Formatter(
        "%(asctime)s %(levelname)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    file_handler = RotatingFileHandler(
        log_directory / "launcher.log",
        maxBytes=5 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    if not background and sys.stderr is not None:
        stream_handler = logging.StreamHandler()
        stream_handler.setFormatter(formatter)
        logger.addHandler(stream_handler)
    return logger


def _kernel32() -> ctypes.WinDLL | None:
    if os.name != "nt":
        return None
    return ctypes.WinDLL("kernel32", use_last_error=True)


def acquire_single_instance() -> tuple[int | None, bool]:
    kernel32 = _kernel32()
    if kernel32 is None:
        return None, False
    kernel32.CreateMutexW.argtypes = (ctypes.c_void_p, ctypes.c_int, ctypes.c_wchar_p)
    kernel32.CreateMutexW.restype = ctypes.c_void_p
    ctypes.set_last_error(0)
    handle = kernel32.CreateMutexW(None, False, instance_object_name(MUTEX_NAME))
    if not handle:
        raise ctypes.WinError(ctypes.get_last_error())
    return int(handle), ctypes.get_last_error() == ERROR_ALREADY_EXISTS


def create_shutdown_event() -> int | None:
    kernel32 = _kernel32()
    if kernel32 is None:
        return None
    kernel32.CreateEventW.argtypes = (
        ctypes.c_void_p,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_wchar_p,
    )
    kernel32.CreateEventW.restype = ctypes.c_void_p
    handle = kernel32.CreateEventW(
        None,
        True,
        False,
        instance_object_name(SHUTDOWN_EVENT_NAME),
    )
    if not handle:
        raise ctypes.WinError(ctypes.get_last_error())
    return int(handle)


def close_windows_handle(handle: int | None) -> None:
    kernel32 = _kernel32()
    if kernel32 is None or handle is None:
        return
    kernel32.CloseHandle.argtypes = (ctypes.c_void_p,)
    kernel32.CloseHandle.restype = ctypes.c_bool
    kernel32.CloseHandle(handle)


def shutdown_requested(event_handle: int | None) -> bool:
    if event_handle is None:
        return False
    kernel32 = _kernel32()
    if kernel32 is None:
        return False
    kernel32.WaitForSingleObject.argtypes = (ctypes.c_void_p, ctypes.c_uint32)
    kernel32.WaitForSingleObject.restype = ctypes.c_uint32
    return kernel32.WaitForSingleObject(event_handle, 0) == 0


def send_shutdown_signal() -> bool:
    kernel32 = _kernel32()
    if kernel32 is None:
        return False
    kernel32.OpenEventW.argtypes = (
        ctypes.c_uint32,
        ctypes.c_int,
        ctypes.c_wchar_p,
    )
    kernel32.OpenEventW.restype = ctypes.c_void_p
    handle = kernel32.OpenEventW(
        EVENT_MODIFY_STATE,
        False,
        instance_object_name(SHUTDOWN_EVENT_NAME),
    )
    if not handle:
        return False
    try:
        kernel32.SetEvent.argtypes = (ctypes.c_void_p,)
        kernel32.SetEvent.restype = ctypes.c_bool
        return bool(kernel32.SetEvent(handle))
    finally:
        close_windows_handle(int(handle))


def runtime_paths() -> dict[str, Path]:
    root = installation_directory()
    return {
        "root": root,
        "node": root / "runtime" / "node" / "node.exe",
        "ffmpeg": root / "runtime" / "ffmpeg" / "bin" / "ffmpeg.exe",
        "ffprobe": root / "runtime" / "ffmpeg" / "bin" / "ffprobe.exe",
        "site": root / "app" / "server.js",
        "site_directory": root / "app",
    }


def validate_installation() -> list[str]:
    paths = runtime_paths()
    errors: list[str] = []
    for label in ("node", "ffmpeg", "ffprobe", "site"):
        if not paths[label].is_file():
            errors.append(f"Arquivo ausente: {paths[label]}")
    try:
        import yt_dlp  # noqa: F401
    except ImportError:
        errors.append("A biblioteca yt-dlp não está presente no launcher.")
    return errors


def child_environment() -> dict[str, str]:
    paths = runtime_paths()
    environment = os.environ.copy()
    current_path = environment.get("PATH", "")
    environment["PATH"] = (
        f"{paths['ffmpeg'].parent}{os.pathsep}{paths['node'].parent}"
        f"{os.pathsep}{current_path}"
    )
    environment["POOL_PETISCOS_HOME_DIR"] = str(data_directory())
    application_data = data_directory() / "data"
    application_data.mkdir(parents=True, exist_ok=True)
    environment["POOL_PETISCOS_DATA_DIR"] = str(application_data)
    environment["PYTHONUTF8"] = "1"
    return environment


def companion_command(companion_port: int) -> list[str]:
    if getattr(sys, "frozen", False):
        return [
            sys.executable,
            "--companion-child",
            "--companion-port",
            str(companion_port),
        ]
    return [
        sys.executable,
        str(Path(__file__).resolve()),
        "--companion-child",
        "--companion-port",
        str(companion_port),
    ]


def run_companion_child(companion_port: int) -> int:
    if sys.stdout is None or sys.stderr is None:
        log_directory = data_directory() / "logs"
        log_directory.mkdir(parents=True, exist_ok=True)
        child_stream = (log_directory / "companion.log").open(
            "a",
            encoding="utf-8",
            buffering=1,
        )
        if sys.stdout is None:
            sys.stdout = child_stream
        if sys.stderr is None:
            sys.stderr = child_stream

    from local_service.server import (
        PoolCompanionHandler,
        PoolCompanionServer,
    )
    from local_service.storage import StateStorage

    music_directory = data_directory() / "musicas"
    music_directory.mkdir(parents=True, exist_ok=True)
    storage = StateStorage()
    if storage.read().state is not None:
        try:
            storage.ensure_daily_backup(force=True)
        except (OSError, sqlite3.Error):
            # A falha será registrada pelo processo pai; o caixa continua
            # disponível para que o usuário possa corrigir o destino do backup.
            logging.getLogger("pool_petiscos.launcher").exception(
                "O backup de inicialização não pôde ser criado."
            )
    server = PoolCompanionServer(
        ("127.0.0.1", companion_port),
        PoolCompanionHandler,
        music_directory,
        storage,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


def endpoint_ready(url: str, expected_service: str | None = None) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            if not 200 <= response.status < 400:
                return False
            if expected_service is None:
                return True
            payload = json.loads(response.read().decode("utf-8"))
            return payload.get("service") == expected_service
    except (OSError, ValueError, urllib.error.URLError):
        return False


class ManagedChild:
    def __init__(
        self,
        *,
        name: str,
        command: list[str],
        cwd: Path,
        environment: dict[str, str],
        logger: logging.Logger,
    ) -> None:
        self.name = name
        self.command = command
        self.cwd = cwd
        self.environment = environment
        self.logger = logger
        self.process: subprocess.Popen[str] | None = None
        self.log_stream: IO[str] | None = None
        self.starts: deque[float] = deque()

    def start(self) -> None:
        now = time.monotonic()
        while self.starts and now - self.starts[0] > 120:
            self.starts.popleft()
        if len(self.starts) >= 5:
            raise RuntimeError(
                f"{self.name} encerrou repetidamente; consulte os logs locais."
            )
        self.starts.append(now)
        log_path = data_directory() / "logs" / f"{self.name}.log"
        self.log_stream = log_path.open("a", encoding="utf-8", buffering=1)
        creation_flags = CREATE_NO_WINDOW if os.name == "nt" else 0
        self.process = subprocess.Popen(
            self.command,
            cwd=self.cwd,
            env=self.environment,
            stdin=subprocess.DEVNULL,
            stdout=self.log_stream,
            stderr=subprocess.STDOUT,
            text=True,
            creationflags=creation_flags,
        )
        self.logger.info("%s iniciado (PID %s).", self.name, self.process.pid)

    def stop(self) -> None:
        process = self.process
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        if self.log_stream is not None:
            self.log_stream.close()
            self.log_stream = None
        self.process = None

    def restart_if_needed(self) -> bool:
        if self.process is not None and self.process.poll() is None:
            return False
        exit_code = self.process.returncode if self.process is not None else None
        if self.log_stream is not None:
            self.log_stream.close()
            self.log_stream = None
        self.logger.warning("%s encerrou com código %s; reiniciando.", self.name, exit_code)
        time.sleep(2)
        self.start()
        return True


def wait_for_services(
    *,
    site_url: str,
    companion_url: str,
    children: list[ManagedChild],
    timeout: int = 45,
) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        for child in children:
            if child.process is not None and child.process.poll() is not None:
                raise RuntimeError(
                    f"{child.name} encerrou durante a inicialização. Consulte os logs."
                )
        if endpoint_ready(site_url) and endpoint_ready(
            companion_url, "Pool Petiscos Companion"
        ):
            return
        time.sleep(0.5)
    raise RuntimeError("Os serviços locais não ficaram prontos dentro do prazo.")


def run_launcher(arguments: argparse.Namespace) -> int:
    logger = configure_logging(arguments.background or arguments.no_browser)
    errors = validate_installation()
    if errors:
        for error in errors:
            logger.error(error)
        return 2

    mutex_handle, already_running = acquire_single_instance()
    if already_running:
        close_windows_handle(mutex_handle)
        site_url = f"http://127.0.0.1:{arguments.site_port}"
        if not arguments.background and not arguments.no_browser:
            for _ in range(20):
                if endpoint_ready(site_url):
                    webbrowser.open(site_url)
                    break
                time.sleep(0.5)
        return 0

    shutdown_handle = create_shutdown_event()
    stop_flag = False

    def request_stop(_signum: int, _frame: object) -> None:
        nonlocal stop_flag
        stop_flag = True

    for signal_name in ("SIGINT", "SIGTERM", "SIGBREAK"):
        candidate = getattr(signal, signal_name, None)
        if candidate is not None:
            signal.signal(candidate, request_stop)

    paths = runtime_paths()
    environment = child_environment()
    environment["PORT"] = str(arguments.site_port)
    environment["HOST"] = "127.0.0.1"
    site_url = f"http://127.0.0.1:{arguments.site_port}"
    companion_url = (
        f"http://127.0.0.1:{arguments.companion_port}/api/health"
    )

    if endpoint_ready(site_url) or endpoint_ready(companion_url):
        logger.error("Uma das portas locais já está em uso por outro processo.")
        close_windows_handle(shutdown_handle)
        close_windows_handle(mutex_handle)
        return 3

    companion = ManagedChild(
        name="companion",
        command=companion_command(arguments.companion_port),
        cwd=paths["root"],
        environment=environment,
        logger=logger,
    )
    site = ManagedChild(
        name="site",
        command=[str(paths["node"]), str(paths["site"])],
        cwd=paths["site_directory"],
        environment=environment,
        logger=logger,
    )
    children = [companion, site]

    try:
        for child in children:
            child.start()
        wait_for_services(
            site_url=site_url,
            companion_url=companion_url,
            children=children,
        )
        logger.info("%s disponível em %s.", APP_NAME, site_url)
        if not arguments.background and not arguments.no_browser:
            webbrowser.open(site_url)

        while not stop_flag and not shutdown_requested(shutdown_handle):
            restarted = False
            for child in children:
                restarted = child.restart_if_needed() or restarted
            if restarted:
                wait_for_services(
                    site_url=site_url,
                    companion_url=companion_url,
                    children=children,
                )
            time.sleep(1)
        return 0
    except Exception:
        logger.exception("Falha ao executar o aplicativo local.")
        return 1
    finally:
        for child in reversed(children):
            child.stop()
        close_windows_handle(shutdown_handle)
        close_windows_handle(mutex_handle)
        logger.info("Serviços locais encerrados.")


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Inicializador do Pool Petiscos.")
    parser.add_argument("--background", action="store_true")
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--shutdown", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--companion-child", action="store_true")
    parser.add_argument(
        "--site-port",
        type=int,
        default=_environment_port("POOL_PETISCOS_SITE_PORT", DEFAULT_SITE_PORT),
    )
    parser.add_argument(
        "--companion-port",
        type=int,
        default=_environment_port(
            "POOL_PETISCOS_COMPANION_PORT", DEFAULT_COMPANION_PORT
        ),
    )
    arguments = parser.parse_args()
    for port_name in ("site_port", "companion_port"):
        port = getattr(arguments, port_name)
        if not 1 <= port <= 65535:
            parser.error(f"--{port_name.replace('_', '-')} deve estar entre 1 e 65535")
    if arguments.site_port == arguments.companion_port:
        parser.error("As portas do site e do companion precisam ser diferentes.")
    return arguments


def main() -> int:
    arguments = parse_arguments()
    if arguments.companion_child:
        return run_companion_child(arguments.companion_port)
    if arguments.shutdown:
        return 0 if send_shutdown_signal() else 1
    if arguments.self_test:
        errors = validate_installation()
        return 0 if not errors else 2
    return run_launcher(arguments)


if __name__ == "__main__":
    raise SystemExit(main())
