"""Small user-scoped secret store used by the installed Windows companion."""

from __future__ import annotations

import ctypes
import os
from pathlib import Path


class _DataBlob(ctypes.Structure):
    _fields_ = [
        ("cbData", ctypes.c_ulong),
        ("pbData", ctypes.POINTER(ctypes.c_ubyte)),
    ]


def _blob(data: bytes) -> tuple[_DataBlob, ctypes.Array[ctypes.c_char]]:
    buffer = ctypes.create_string_buffer(data)
    return (
        _DataBlob(
            len(data),
            ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte)),
        ),
        buffer,
    )


def _protect_windows(data: bytes) -> bytes:
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    input_blob, input_buffer = _blob(data)
    output_blob = _DataBlob()
    crypt32.CryptProtectData.argtypes = (
        ctypes.POINTER(_DataBlob),
        ctypes.c_wchar_p,
        ctypes.c_void_p,
        ctypes.c_void_p,
        ctypes.c_void_p,
        ctypes.c_ulong,
        ctypes.POINTER(_DataBlob),
    )
    crypt32.CryptProtectData.restype = ctypes.c_bool
    if not crypt32.CryptProtectData(
        ctypes.byref(input_blob),
        "Pool Petiscos Google Drive",
        None,
        None,
        None,
        0x1,
        ctypes.byref(output_blob),
    ):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(output_blob.pbData, output_blob.cbData)
    finally:
        del input_buffer
        kernel32.LocalFree(output_blob.pbData)


def _unprotect_windows(data: bytes) -> bytes:
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    input_blob, input_buffer = _blob(data)
    output_blob = _DataBlob()
    crypt32.CryptUnprotectData.argtypes = (
        ctypes.POINTER(_DataBlob),
        ctypes.c_void_p,
        ctypes.c_void_p,
        ctypes.c_void_p,
        ctypes.c_void_p,
        ctypes.c_ulong,
        ctypes.POINTER(_DataBlob),
    )
    crypt32.CryptUnprotectData.restype = ctypes.c_bool
    if not crypt32.CryptUnprotectData(
        ctypes.byref(input_blob),
        None,
        None,
        None,
        None,
        0x1,
        ctypes.byref(output_blob),
    ):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(output_blob.pbData, output_blob.cbData)
    finally:
        del input_buffer
        kernel32.LocalFree(output_blob.pbData)


class ProtectedFileStore:
    """Persist bytes with Windows DPAPI; use mode 0600 only in development."""

    def __init__(self, path: Path) -> None:
        self.path = path.expanduser().resolve()

    def exists(self) -> bool:
        return self.path.is_file()

    def save(self, data: bytes) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        encoded = _protect_windows(data) if os.name == "nt" else data
        temporary = self.path.with_suffix(f"{self.path.suffix}.tmp")
        temporary.write_bytes(encoded)
        if os.name != "nt":
            temporary.chmod(0o600)
        os.replace(temporary, self.path)

    def load(self) -> bytes:
        encoded = self.path.read_bytes()
        return _unprotect_windows(encoded) if os.name == "nt" else encoded

    def delete(self) -> None:
        self.path.unlink(missing_ok=True)
