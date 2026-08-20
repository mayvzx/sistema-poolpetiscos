import type { PersistedPoolState } from "./types";

const LOCAL_SERVICE_URL = "http://127.0.0.1:18765";
const READ_TIMEOUT_MS = 2_000;
const WRITE_TIMEOUT_MS = 8_000;

type LocalStatePayload = {
  state: unknown | null;
  revision: number;
  saved_at?: string | null;
  last_backup_at?: string | null;
  backup_error?: string | null;
};

export type LocalStateSnapshot = {
  state: unknown | null;
  revision: number;
  savedAt: string | null;
  lastBackupAt: string | null;
  backupHealthy: boolean;
};

export type BackupFile = {
  id?: string;
  filename: string;
  tier: "daily" | "weekly" | "monthly";
  period: string;
  created_at: string;
  size_bytes: number;
  web_url?: string | null;
};

export type BackupStatus = {
  schedules: Array<{
    tier: BackupFile["tier"];
    label: string;
    retention: number;
  }>;
  counts: Record<BackupFile["tier"], number>;
  backup_directory: string;
  last_local_backup_at: string | null;
  last_google_sync_at: string | null;
  last_error: string | null;
  google_drive: {
    configured: boolean;
    connected: boolean;
    account_email: string | null;
    account_name: string | null;
    folder_url: string | null;
    error?: string | null;
  };
  local_backups: BackupFile[];
};

export class LocalStateConflictError extends Error {
  readonly state: unknown | null;
  readonly revision: number;

  constructor(payload: LocalStatePayload) {
    super("Os dados foram alterados em outro acesso.");
    this.name = "LocalStateConflictError";
    this.state = payload.state;
    this.revision = payload.revision;
  }
}

function isValidRevision(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

async function readPayload(response: Response): Promise<LocalStatePayload> {
  const payload: unknown = await response.json();
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("revision" in payload) ||
    !isValidRevision(payload.revision)
  ) {
    throw new Error("A resposta de armazenamento não pôde ser validada.");
  }
  return {
    state: "state" in payload ? payload.state : null,
    revision: payload.revision,
    saved_at:
      "saved_at" in payload && typeof payload.saved_at === "string"
        ? payload.saved_at
        : null,
    last_backup_at:
      "last_backup_at" in payload &&
      typeof payload.last_backup_at === "string"
        ? payload.last_backup_at
        : null,
    backup_error:
      "backup_error" in payload && typeof payload.backup_error === "string"
        ? payload.backup_error
        : null,
  };
}

async function stateRequest(
  options?: RequestInit,
  timeoutMs = READ_TIMEOUT_MS,
): Promise<{ response: Response; payload: LocalStatePayload }> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    timeoutMs,
  );

  try {
    const response = await fetch(`${LOCAL_SERVICE_URL}/api/state`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      signal: controller.signal,
    });
    const payload = await readPayload(response);
    return { response, payload };
  } finally {
    window.clearTimeout(timeout);
  }
}

async function localServiceJson<T>(
  path: string,
  options?: RequestInit,
  timeoutMs = 15_000,
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${LOCAL_SERVICE_URL}${path}`, {
      ...options,
      cache: "no-store",
      headers: {
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
        ...options?.headers,
      },
      signal: controller.signal,
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      const message =
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : "O serviço local não concluiu a operação.";
      throw new Error(message);
    }
    return payload as T;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function downloadLocalDatabase(): Promise<Blob> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${LOCAL_SERVICE_URL}/api/database/export`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error("Não foi possível baixar o banco local.");
    }
    return response.blob();
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function loadLocalPoolState(): Promise<LocalStateSnapshot> {
  const { response, payload } = await stateRequest();
  if (!response.ok) {
    throw new Error("O armazenamento principal não está disponível.");
  }
  return {
    state: payload.state,
    revision: payload.revision,
    savedAt: payload.saved_at ?? null,
    lastBackupAt: payload.last_backup_at ?? null,
    backupHealthy: !payload.backup_error,
  };
}

export async function saveLocalPoolState(
  state: PersistedPoolState,
  expectedRevision?: number,
): Promise<{
  revision: number;
  savedAt: string | null;
  lastBackupAt: string | null;
  backupHealthy: boolean;
}> {
  const body: {
    state: PersistedPoolState;
    expected_revision?: number;
  } = { state };

  if (isValidRevision(expectedRevision)) {
    body.expected_revision = expectedRevision;
  }

  const { response, payload } = await stateRequest({
    method: "PUT",
    body: JSON.stringify(body),
  }, WRITE_TIMEOUT_MS);

  if (response.status === 409) {
    throw new LocalStateConflictError(payload);
  }
  if (!response.ok) {
    throw new Error("Não foi possível atualizar o armazenamento principal.");
  }
  return {
    revision: payload.revision,
    savedAt: payload.saved_at ?? null,
    lastBackupAt: payload.last_backup_at ?? null,
    backupHealthy: !payload.backup_error,
  };
}

export function loadBackupStatus() {
  return localServiceJson<BackupStatus>("/api/backups/status");
}

export function runBackupNow() {
  return localServiceJson<BackupStatus>(
    "/api/backups/run",
    { method: "POST" },
    120_000,
  );
}

export async function beginGoogleDriveConnection() {
  const result = await localServiceJson<{ authorization_url: string }>(
    "/api/google-drive/connect",
    { method: "POST" },
  );
  return result.authorization_url;
}

export function disconnectGoogleDrive() {
  return localServiceJson<{ disconnected: boolean }>(
    "/api/google-drive/disconnect",
    { method: "POST" },
    30_000,
  );
}

export async function listGoogleDriveBackups() {
  const result = await localServiceJson<{ backups: BackupFile[] }>(
    "/api/backups/google",
    undefined,
    60_000,
  );
  return result.backups;
}

export function restoreManagedBackup(
  source: "local" | "google",
  identifier: string,
) {
  return localServiceJson<{ restored: boolean }>(
    "/api/backups/restore",
    {
      method: "POST",
      body: JSON.stringify(
        source === "local"
          ? { source, filename: identifier }
          : { source, file_id: identifier },
      ),
    },
    120_000,
  );
}

export async function restoreDatabaseFile(file: File) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(`${LOCAL_SERVICE_URL}/api/database/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/vnd.sqlite3" },
      body: file,
      signal: controller.signal,
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new Error(
        typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
          ? payload.error
          : "O arquivo não pôde ser restaurado.",
      );
    }
  } finally {
    window.clearTimeout(timeout);
  }
}
