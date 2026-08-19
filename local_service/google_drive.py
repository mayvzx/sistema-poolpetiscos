"""Narrow Google Drive OAuth and file client for Pool Petiscos backups."""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from local_service.secure_store import ProtectedFileStore

DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file"
AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
REVOCATION_ENDPOINT = "https://oauth2.googleapis.com/revoke"
DRIVE_API = "https://www.googleapis.com/drive/v3"
DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3"
FOLDER_MIME_TYPE = "application/vnd.google-apps.folder"
DATABASE_MIME_TYPE = "application/vnd.sqlite3"
OAUTH_CONFIGURATION_FILENAME = "google-drive-oauth.json"


class GoogleDriveError(RuntimeError):
    pass


@dataclass(frozen=True)
class OAuthConfiguration:
    client_id: str
    client_secret: str
    source: Path


def load_oauth_configuration(paths: list[Path]) -> OAuthConfiguration | None:
    for path in paths:
        if not path.is_file():
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8-sig"))
            desktop = payload.get("installed", payload)
            client_id = str(desktop.get("client_id", "")).strip()
            client_secret = str(desktop.get("client_secret", "")).strip()
        except (OSError, TypeError, ValueError, json.JSONDecodeError):
            continue
        if client_id and client_secret:
            return OAuthConfiguration(client_id, client_secret, path)
    return None


def _base64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


class GoogleDriveClient:
    def __init__(
        self,
        configuration_paths: list[Path],
        token_path: Path,
        *,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.configuration_paths = configuration_paths
        self.configuration = load_oauth_configuration(configuration_paths)
        self.token_store = ProtectedFileStore(token_path)
        self.clock = clock
        self._pending: dict[str, tuple[str, str, float]] = {}

    def status(self) -> dict[str, Any]:
        token = None
        token_error = None
        if self.token_store.exists():
            try:
                token = self._load_token()
            except GoogleDriveError as error:
                token_error = str(error)
        return {
            "configured": self.configuration is not None,
            "connected": token is not None,
            "account_email": token.get("account_email") if token else None,
            "account_name": token.get("account_name") if token else None,
            "folder_url": (
                f"https://drive.google.com/drive/folders/{token['folder_id']}"
                if token and token.get("folder_id")
                else None
            ),
            "error": token_error,
        }

    def begin_authorization(self, redirect_uri: str) -> str:
        if self.configuration is None:
            raise GoogleDriveError(
                "A credencial OAuth do Google Drive ainda não foi configurada."
            )
        state = secrets.token_urlsafe(32)
        verifier = secrets.token_urlsafe(64)
        challenge = _base64url(hashlib.sha256(verifier.encode("ascii")).digest())
        self._pending = {
            key: value
            for key, value in self._pending.items()
            if self.clock() - value[2] < 600
        }
        self._pending[state] = (verifier, redirect_uri, self.clock())
        parameters = urllib.parse.urlencode(
            {
                "client_id": self.configuration.client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": DRIVE_FILE_SCOPE,
                "access_type": "offline",
                "prompt": "consent select_account",
                "include_granted_scopes": "true",
                "state": state,
                "code_challenge": challenge,
                "code_challenge_method": "S256",
            }
        )
        return f"{AUTHORIZATION_ENDPOINT}?{parameters}"

    def complete_authorization(self, state: str, code: str) -> None:
        pending = self._pending.pop(state, None)
        if pending is None or self.clock() - pending[2] >= 600:
            raise GoogleDriveError("A autorização expirou. Inicie a conexão novamente.")
        if self.configuration is None:
            raise GoogleDriveError("A credencial OAuth não está configurada.")
        verifier, redirect_uri, _ = pending
        token = self._request_form(
            TOKEN_ENDPOINT,
            {
                "client_id": self.configuration.client_id,
                "client_secret": self.configuration.client_secret,
                "code": code,
                "code_verifier": verifier,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            },
        )
        if not token.get("refresh_token"):
            raise GoogleDriveError(
                "O Google não forneceu acesso permanente. Remova o acesso antigo e tente novamente."
            )
        token["expires_at"] = self.clock() + int(token.get("expires_in", 3600))
        about = self._authorized_json(
            f"{DRIVE_API}/about?fields=user(displayName,emailAddress)", token=token
        )
        user = about.get("user", {}) if isinstance(about, dict) else {}
        token["account_email"] = user.get("emailAddress")
        token["account_name"] = user.get("displayName")
        self._save_token(token)

    def disconnect(self) -> bool:
        revoked = True
        try:
            token = self._load_token() if self.token_store.exists() else None
            if token:
                candidate = token.get("refresh_token") or token.get("access_token")
                if candidate:
                    try:
                        self._request_form(REVOCATION_ENDPOINT, {"token": candidate})
                    except GoogleDriveError:
                        revoked = False
        finally:
            self.token_store.delete()
        return revoked

    def list_backups(self) -> list[dict[str, Any]]:
        folder_id = self._ensure_folder()
        query = (
            f"'{folder_id}' in parents and trashed = false and "
            "appProperties has { key='poolPetiscosBackup' and value='1' }"
        )
        parameters = urllib.parse.urlencode(
            {
                "q": query,
                "spaces": "drive",
                "pageSize": "100",
                "orderBy": "modifiedTime desc",
                "fields": (
                    "nextPageToken,files(id,name,size,modifiedTime,webViewLink,appProperties)"
                ),
            }
        )
        payload = self._authorized_json(f"{DRIVE_API}/files?{parameters}")
        files = payload.get("files", []) if isinstance(payload, dict) else []
        return [item for item in files if isinstance(item, dict)]

    def upload_backup(
        self,
        path: Path,
        tier: str,
        period: str,
        existing_file_id: str | None = None,
    ) -> str:
        folder_id = self._ensure_folder()
        metadata: dict[str, Any] = {
            "name": path.name,
            "mimeType": DATABASE_MIME_TYPE,
            "appProperties": {
                "poolPetiscosBackup": "1",
                "tier": tier,
                "period": period,
            },
        }
        if existing_file_id:
            endpoint = (
                f"{DRIVE_UPLOAD_API}/files/{existing_file_id}?uploadType=resumable&fields=id"
            )
            method = "PATCH"
        else:
            metadata["parents"] = [folder_id]
            endpoint = f"{DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=id"
            method = "POST"
        token = self._access_token()
        _, headers, _ = self._request(
            endpoint,
            method=method,
            data=json.dumps(metadata).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Type": DATABASE_MIME_TYPE,
                "X-Upload-Content-Length": str(path.stat().st_size),
            },
        )
        location = headers.get("Location")
        if not location:
            raise GoogleDriveError("O Google Drive não iniciou o envio do backup.")
        _, _, body = self._request(
            location,
            method="PUT",
            data=path.read_bytes(),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": DATABASE_MIME_TYPE,
            },
        )
        result = json.loads(body.decode("utf-8")) if body else {}
        file_id = result.get("id") or existing_file_id
        if not file_id:
            raise GoogleDriveError("O Google Drive não confirmou o arquivo enviado.")
        return str(file_id)

    def download_backup(self, file_id: str) -> bytes:
        allowed = {str(item.get("id")) for item in self.list_backups()}
        if file_id not in allowed:
            raise GoogleDriveError("O backup do Google Drive não foi encontrado.")
        token = self._access_token()
        _, _, body = self._request(
            f"{DRIVE_API}/files/{urllib.parse.quote(file_id)}?alt=media",
            headers={"Authorization": f"Bearer {token}"},
        )
        return body

    def _ensure_folder(self) -> str:
        token = self._load_token()
        folder_id = token.get("folder_id")
        if folder_id:
            return str(folder_id)
        query = (
            "trashed = false and mimeType = 'application/vnd.google-apps.folder' and "
            "appProperties has { key='poolPetiscosFolder' and value='backups' }"
        )
        parameters = urllib.parse.urlencode(
            {"q": query, "spaces": "drive", "fields": "files(id,name)"}
        )
        payload = self._authorized_json(f"{DRIVE_API}/files?{parameters}")
        files = payload.get("files", []) if isinstance(payload, dict) else []
        if files:
            folder_id = files[0].get("id")
        else:
            payload = self._authorized_json(
                f"{DRIVE_API}/files?fields=id",
                method="POST",
                data={
                    "name": "Pool Petiscos - Backups",
                    "mimeType": FOLDER_MIME_TYPE,
                    "appProperties": {
                        "poolPetiscosFolder": "backups",
                    },
                },
            )
            folder_id = payload.get("id")
        if not folder_id:
            raise GoogleDriveError("Não foi possível preparar a pasta de backups.")
        token["folder_id"] = folder_id
        self._save_token(token)
        return str(folder_id)

    def _load_token(self) -> dict[str, Any]:
        try:
            payload = json.loads(self.token_store.load().decode("utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise GoogleDriveError("A conexão salva com o Google Drive é inválida.") from error
        if not isinstance(payload, dict) or not payload.get("refresh_token"):
            raise GoogleDriveError("A conexão salva com o Google Drive é inválida.")
        return payload

    def _save_token(self, token: dict[str, Any]) -> None:
        self.token_store.save(
            json.dumps(token, ensure_ascii=False, separators=(",", ":")).encode(
                "utf-8"
            )
        )

    def _access_token(self) -> str:
        token = self._load_token()
        if token.get("access_token") and float(token.get("expires_at", 0)) > self.clock() + 300:
            return str(token["access_token"])
        if self.configuration is None:
            raise GoogleDriveError("A credencial OAuth não está configurada.")
        refreshed = self._request_form(
            TOKEN_ENDPOINT,
            {
                "client_id": self.configuration.client_id,
                "client_secret": self.configuration.client_secret,
                "refresh_token": token["refresh_token"],
                "grant_type": "refresh_token",
            },
        )
        token.update(refreshed)
        token["expires_at"] = self.clock() + int(token.get("expires_in", 3600))
        self._save_token(token)
        return str(token["access_token"])

    def _authorized_json(
        self,
        url: str,
        *,
        method: str = "GET",
        data: dict[str, Any] | None = None,
        token: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        access_token = (
            str(token["access_token"]) if token is not None else self._access_token()
        )
        _, _, body = self._request(
            url,
            method=method,
            data=json.dumps(data).encode("utf-8") if data is not None else None,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json; charset=UTF-8",
            },
        )
        payload = json.loads(body.decode("utf-8")) if body else {}
        if not isinstance(payload, dict):
            raise GoogleDriveError("O Google Drive devolveu uma resposta inválida.")
        return payload

    def _request_form(self, url: str, values: dict[str, Any]) -> dict[str, Any]:
        _, _, body = self._request(
            url,
            method="POST",
            data=urllib.parse.urlencode(values).encode("ascii"),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        payload = json.loads(body.decode("utf-8")) if body else {}
        if not isinstance(payload, dict):
            raise GoogleDriveError("O Google devolveu uma resposta inválida.")
        return payload

    @staticmethod
    def _request(
        url: str,
        *,
        method: str = "GET",
        data: bytes | None = None,
        headers: dict[str, str] | None = None,
    ) -> tuple[int, Any, bytes]:
        request = urllib.request.Request(
            url,
            data=data,
            headers=headers or {},
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.status, response.headers, response.read()
        except urllib.error.HTTPError as error:
            detail = error.read(2048).decode("utf-8", errors="replace")
            raise GoogleDriveError(
                f"O Google Drive recusou a operação ({error.code}): {detail[:300]}"
            ) from error
        except (OSError, urllib.error.URLError) as error:
            raise GoogleDriveError(
                "Não foi possível acessar o Google Drive. Confira a internet."
            ) from error
