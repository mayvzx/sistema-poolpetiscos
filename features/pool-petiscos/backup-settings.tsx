"use client";

import {
  CalendarClock,
  CheckCircle2,
  Cloud,
  CloudOff,
  ExternalLink,
  HardDriveDownload,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Upload,
} from "lucide-react";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  beginGoogleDriveConnection,
  disconnectGoogleDrive,
  listGoogleDriveBackups,
  loadBackupStatus,
  restoreDatabaseFile,
  restoreManagedBackup,
  runBackupNow,
  type BackupFile,
  type BackupStatus,
} from "./local-storage-companion";

type BackupSettingsProps = {
  onMessage: (
    message: string,
    tone?: "success" | "warning" | "info",
  ) => void;
};

const TIER_LABELS: Record<BackupFile["tier"], string> = {
  daily: "Diário",
  weekly: "Semanal",
  monthly: "Mensal",
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatDate(value: string | null) {
  if (!value) return "Ainda não realizado";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data indisponível"
    : DATE_TIME_FORMATTER.format(date);
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function BackupSettings({ onMessage }: BackupSettingsProps) {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [googleBackups, setGoogleBackups] = useState<BackupFile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const refreshingRef = useRef(false);

  const refreshStatus = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      setStatus(await loadBackupStatus());
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    } finally {
      refreshingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refreshStatus(), 0);
    const timer = window.setInterval(() => void refreshStatus(), 8_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refreshStatus]);

  async function runNow() {
    setBusy("run");
    try {
      setStatus(await runBackupNow());
      onMessage("Backups atualizados e sincronizados.");
    } catch (error) {
      onMessage(
        error instanceof Error ? error.message : "O backup não foi concluído.",
        "warning",
      );
    } finally {
      setBusy(null);
    }
  }

  async function connectGoogleDrive() {
    setBusy("connect");
    try {
      const authorizationUrl = await beginGoogleDriveConnection();
      const popup = window.open(
        authorizationUrl,
        "pool-petiscos-google-drive",
        "popup,width=720,height=760",
      );
      if (!popup) window.location.href = authorizationUrl;
      onMessage(
        "Conclua a autorização na janela do Google. O status será atualizado automaticamente.",
        "info",
      );
    } catch (error) {
      onMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível abrir a conexão com o Google.",
        "warning",
      );
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (
      !window.confirm(
        "Desconectar o Google Drive? Os backups já enviados continuarão na conta.",
      )
    ) {
      return;
    }
    setBusy("disconnect");
    try {
      await disconnectGoogleDrive();
      setGoogleBackups([]);
      await refreshStatus();
      onMessage("Google Drive desconectado deste computador.", "info");
    } catch (error) {
      onMessage(
        error instanceof Error ? error.message : "Não foi possível desconectar.",
        "warning",
      );
    } finally {
      setBusy(null);
    }
  }

  async function loadGoogleBackups() {
    setBusy("google-list");
    try {
      setGoogleBackups(await listGoogleDriveBackups());
    } catch (error) {
      onMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível consultar os backups do Google Drive.",
        "warning",
      );
    } finally {
      setBusy(null);
    }
  }

  async function restore(source: "local" | "google", backup: BackupFile) {
    const identifier = source === "local" ? backup.filename : backup.id;
    if (!identifier) return;
    if (
      !window.confirm(
        `Restaurar ${backup.filename}? O banco atual será salvo automaticamente antes da substituição.`,
      )
    ) {
      return;
    }
    setBusy(`restore-${identifier}`);
    try {
      await restoreManagedBackup(source, identifier);
      onMessage("Backup validado e restaurado. Reabrindo o caixa...");
      window.setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      onMessage(
        error instanceof Error
          ? error.message
          : "O backup não pôde ser restaurado.",
        "warning",
      );
      setBusy(null);
    }
  }

  async function uploadDatabase(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (
      !window.confirm(
        `Restaurar o arquivo ${file.name}? Uma cópia do banco atual será criada antes.`,
      )
    ) {
      return;
    }
    setBusy("upload");
    try {
      await restoreDatabaseFile(file);
      onMessage("Arquivo validado e restaurado. Reabrindo o caixa...");
      window.setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      onMessage(
        error instanceof Error
          ? error.message
          : "O arquivo selecionado não pôde ser restaurado.",
        "warning",
      );
      setBusy(null);
    }
  }

  if (unavailable) {
    return (
      <section className="pool-settings-card rounded-[24px] border border-[#f0c7cb] bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-xl font-black">Backups automáticos</h2>
        <p className="mt-2 text-sm leading-6 text-[#8a323a]">
          Os backups completos estão disponíveis somente no aplicativo instalado.
        </p>
      </section>
    );
  }

  return (
    <section className="pool-settings-card rounded-[24px] border border-[#ebe5e1] bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e9f7f0] text-[#27865d]">
            <HardDriveDownload size={24} />
          </span>
          <div>
            <h2 className="text-xl font-black">Backups automáticos</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6d6561]">
              Cópias SQLite verificadas diariamente, semanalmente e mensalmente,
              com restauração segura e sincronização opcional no Google Drive.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={!status || busy !== null}
          onClick={() => void runNow()}
          className="flex min-h-11 items-center gap-2 rounded-xl bg-[#27865d] px-4 font-extrabold text-white disabled:opacity-50"
        >
          {busy === "run" ? (
            <LoaderCircle size={18} className="animate-spin" />
          ) : (
            <RefreshCw size={18} />
          )}
          Fazer backup agora
        </button>
      </div>

      {status && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {status.schedules.map((schedule) => (
              <div
                key={schedule.tier}
                className="pool-soft-panel rounded-2xl border border-[#e6dfdb] bg-[#faf8f6] p-4"
              >
                <CalendarClock size={20} className="text-[#d9202c]" />
                <strong className="mt-3 block text-base font-black">
                  {schedule.label}
                </strong>
                <span className="mt-1 block text-sm text-[#6d6561]">
                  {status.counts[schedule.tier]} de {schedule.retention} cópias
                </span>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[#e6dfdb] p-5">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={22} className="text-[#27865d]" />
                <div>
                  <strong className="block font-black">Cópia local</strong>
                  <span className="text-sm text-[#6d6561]">
                    Última: {formatDate(status.last_local_backup_at)}
                  </span>
                </div>
              </div>
              <p className="mt-3 break-all text-xs leading-5 text-[#776f6b]">
                {status.backup_directory}
              </p>
              <label className="mt-4 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#d9cfca] font-extrabold">
                <Upload size={18} /> Restaurar arquivo .db
                <input
                  type="file"
                  accept=".db,application/vnd.sqlite3,application/x-sqlite3"
                  onChange={(event) => void uploadDatabase(event)}
                  className="sr-only"
                />
              </label>
            </div>

            <div className="rounded-2xl border border-[#e6dfdb] p-5">
              <div className="flex items-center gap-3">
                {status.google_drive.connected ? (
                  <Cloud size={22} className="text-[#4285f4]" />
                ) : (
                  <CloudOff size={22} className="text-[#9c928d]" />
                )}
                <div>
                  <strong className="block font-black">Google Drive</strong>
                  <span className="text-sm text-[#6d6561]">
                    {status.google_drive.connected
                      ? status.google_drive.account_email || "Conta conectada"
                      : status.google_drive.configured
                        ? "Pronto para conectar"
                        : "Credencial OAuth ainda não configurada"}
                  </span>
                </div>
              </div>
              {status.google_drive.connected ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void loadGoogleBackups()}
                    disabled={busy !== null}
                    className="min-h-11 rounded-xl bg-[#4285f4] px-4 font-extrabold text-white disabled:opacity-50"
                  >
                    Ver backups na nuvem
                  </button>
                  {status.google_drive.folder_url && (
                    <a
                      href={status.google_drive.folder_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-h-11 items-center gap-2 rounded-xl border border-[#d9cfca] px-4 font-extrabold"
                    >
                      <ExternalLink size={17} /> Abrir pasta
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => void disconnect()}
                    disabled={busy !== null}
                    className="min-h-11 rounded-xl border border-[#f0c7cb] px-4 font-extrabold text-[#b41622] disabled:opacity-50"
                  >
                    Desconectar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void connectGoogleDrive()}
                  disabled={!status.google_drive.configured || busy !== null}
                  className="mt-4 min-h-11 w-full rounded-xl bg-[#4285f4] px-4 font-extrabold text-white disabled:opacity-45"
                >
                  Conectar conta Google
                </button>
              )}
              <p className="mt-3 text-xs leading-5 text-[#776f6b]">
                Última sincronização: {formatDate(status.last_google_sync_at)}
              </p>
              {(status.last_error || status.google_drive.error) && (
                <p className="mt-3 rounded-xl bg-[#fff0f1] p-3 text-xs font-bold leading-5 text-[#b41622]">
                  {status.last_error || status.google_drive.error}
                </p>
              )}
            </div>
          </div>

          <BackupList
            title="Backups deste computador"
            backups={status.local_backups.slice(0, 12)}
            busy={busy}
            onRestore={(backup) => void restore("local", backup)}
          />
          {googleBackups.length > 0 && (
            <BackupList
              title="Backups do Google Drive"
              backups={googleBackups}
              busy={busy}
              onRestore={(backup) => void restore("google", backup)}
            />
          )}
        </>
      )}
    </section>
  );
}

function BackupList({
  title,
  backups,
  busy,
  onRestore,
}: {
  title: string;
  backups: BackupFile[];
  busy: string | null;
  onRestore: (backup: BackupFile) => void;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-[#e6dfdb] p-4 sm:p-5">
      <h3 className="font-black">{title}</h3>
      <div className="mt-3 space-y-2">
        {backups.length === 0 ? (
          <p className="text-sm text-[#6d6561]">Nenhum backup encontrado.</p>
        ) : (
          backups.map((backup) => (
            <div
              key={backup.id || backup.filename}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#faf8f6] p-3"
            >
              <div className="min-w-0">
                <strong className="block truncate text-sm font-black">
                  {TIER_LABELS[backup.tier] || "Backup"} • {backup.period}
                </strong>
                <span className="text-xs text-[#776f6b]">
                  {formatDate(backup.created_at)} • {formatSize(backup.size_bytes)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onRestore(backup)}
                disabled={busy !== null}
                className="flex min-h-10 items-center gap-2 rounded-xl border border-[#d9cfca] bg-white px-3 text-sm font-extrabold disabled:opacity-45"
              >
                {busy === `restore-${backup.id || backup.filename}` ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <RotateCcw size={16} />
                )}
                Restaurar
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
