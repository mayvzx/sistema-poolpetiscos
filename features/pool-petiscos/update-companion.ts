const UPDATE_COMPANION_URL = "http://127.0.0.1:18765";

export type VerifiedUpdateInstaller = {
  name: string;
  size: number;
  digest: string;
  download_url: string;
};

export type AppUpdateStatus = {
  current_version: string;
  latest_version: string;
  available: boolean;
  release_url: string;
  release_name: string;
  published_at: string;
  notes: string;
  verified_installer: VerifiedUpdateInstaller | null;
  checked_at: number;
};

async function readResponse<T>(response: Response): Promise<T> {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "O serviço de atualização não respondeu.";
    throw new Error(message);
  }
  return payload as T;
}

export async function checkForAppUpdate(force = false) {
  const query = force ? "?force=1" : "";
  const response = await fetch(
    `${UPDATE_COMPANION_URL}/api/update/status${query}`,
    { cache: "no-store" },
  );
  return readResponse<AppUpdateStatus>(response);
}

export async function downloadVerifiedAppUpdate() {
  const response = await fetch(
    `${UPDATE_COMPANION_URL}/api/update/download`,
    { method: "POST" },
  );
  return readResponse<{
    downloaded: true;
    version: string;
    filename: string;
    file_path: string;
    sha256: string;
  }>(response);
}

export async function openAppUpdateFolder() {
  const response = await fetch(
    `${UPDATE_COMPANION_URL}/api/update/open-folder`,
    { method: "POST" },
  );
  return readResponse<{ folder: string }>(response);
}
