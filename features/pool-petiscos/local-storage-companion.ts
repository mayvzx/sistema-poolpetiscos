import type { PersistedPoolState } from "./types";

const LOCAL_SERVICE_URL = "http://127.0.0.1:8765";
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
