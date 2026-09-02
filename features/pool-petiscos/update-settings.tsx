"use client";

import {
  CheckCircle2,
  Download,
  ExternalLink,
  LoaderCircle,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import {
  checkForAppUpdate,
  downloadVerifiedAppUpdate,
  installVerifiedAppUpdate,
  type AppUpdateStatus,
} from "./update-companion";

type UpdateSettingsProps = {
  status: AppUpdateStatus | null;
  onStatusChange: (status: AppUpdateStatus) => void;
  onMessage: (message: string, tone?: "success" | "warning" | "info") => void;
};

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Não foi possível concluir a operação.";
}

export function UpdateSettings({
  status,
  onStatusChange,
  onMessage,
}: UpdateSettingsProps) {
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadedVersion, setDownloadedVersion] = useState<string | null>(
    status?.downloaded_installer?.version ?? null,
  );
  const downloaded =
    downloadedVersion === status?.latest_version ||
    status?.downloaded_installer?.version === status?.latest_version;

  async function checkNow() {
    setChecking(true);
    try {
      const nextStatus = await checkForAppUpdate(true);
      onStatusChange(nextStatus);
      onMessage(
        nextStatus.available
          ? `A versão ${nextStatus.latest_version} está disponível.`
          : "O aplicativo está atualizado.",
        "info",
      );
    } catch (error) {
      onMessage(errorMessage(error), "warning");
    } finally {
      setChecking(false);
    }
  }

  async function downloadUpdate() {
    setDownloading(true);
    try {
      const result = await downloadVerifiedAppUpdate();
      setDownloadedVersion(result.version);
      onMessage(
        `Instalador ${result.version} baixado e verificado com SHA-256.`,
      );
    } catch (error) {
      onMessage(errorMessage(error), "warning");
    } finally {
      setDownloading(false);
    }
  }

  async function installUpdate() {
    try {
      const result = await installVerifiedAppUpdate();
      onMessage(
        `O instalador ${result.version} vai abrir. Confirme o aviso do Windows; o Pool fechará e abrirá novamente sozinho.`,
        "info",
      );
    } catch (error) {
      onMessage(errorMessage(error), "warning");
    }
  }

  return (
    <section
      data-testid="update-settings"
      className="pool-settings-card rounded-[24px] border border-[#ebe5e1] bg-white p-5 shadow-sm sm:p-7"
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#eaf8f1] text-[#27865d]">
            <RefreshCw size={24} />
          </span>
          <div>
            <h2 className="text-xl font-black">Atualizações do aplicativo</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6d6561]">
              O caixa consulta o canal oficial uma vez por dia. O sistema nunca
              instala uma versão sem sua decisão.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void checkNow()}
          disabled={checking}
          className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#ded7d2] bg-white px-4 text-sm font-extrabold transition hover:border-[#b9aca5] disabled:opacity-55"
        >
          {checking ? <LoaderCircle className="animate-spin" size={17} /> : <RefreshCw size={17} />}
          {checking ? "Verificando..." : "Verificar agora"}
        </button>
      </div>

      <div className="pool-soft-panel mt-5 rounded-2xl border border-[#e6dfdb] bg-[#faf8f6] p-5">
        {!status ? (
          <p className="text-sm font-semibold text-[#6d6561]">
            A verificação automática está disponível no aplicativo instalado no Windows.
          </p>
        ) : status.available ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-xs font-extrabold uppercase tracking-[.1em] text-[#d9202c]">
                  Nova versão disponível
                </span>
                <strong className="mt-1 block text-xl font-black">
                  {status.current_version} → {status.latest_version}
                </strong>
              </div>
              {status.verified_installer ? (
                <span className="flex items-center gap-2 rounded-full bg-[#eaf8f1] px-3 py-2 text-xs font-extrabold text-[#23734f]">
                  <ShieldCheck size={16} /> Instalador verificável
                </span>
              ) : (
                <span className="rounded-full bg-[#fff8de] px-3 py-2 text-xs font-extrabold text-[#8d6100]">
                  Aguardando hash do instalador
                </span>
              )}
            </div>
            {status.notes.trim() && (
              <p className="line-clamp-4 whitespace-pre-line text-sm leading-6 text-[#6d6561]">
                {status.notes.trim()}
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              {status.verified_installer && !downloaded && (
                <button
                  type="button"
                  onClick={() => void downloadUpdate()}
                  disabled={downloading}
                  className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#d9202c] px-5 font-extrabold text-white transition hover:bg-[#b41622] disabled:opacity-55"
                >
                  {downloading ? <LoaderCircle className="animate-spin" size={19} /> : <Download size={19} />}
                  {downloading ? "Baixando e verificando..." : "Baixar instalador verificado"}
                </button>
              )}
              {downloaded && (
                <button
                  type="button"
                  onClick={() => void installUpdate()}
                  className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#27865d] px-5 font-extrabold text-white transition hover:bg-[#1f6f4c]"
                >
                  <PackageCheck size={19} /> Instalar atualização agora
                </button>
              )}
              <a
                href={status.release_url}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#ded7d2] bg-white px-5 font-extrabold"
              >
                <ExternalLink size={18} /> Ver novidades
              </a>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-[#23734f]">
            <CheckCircle2 size={22} />
            <div>
              <strong className="block font-black">Aplicativo atualizado</strong>
              <span className="text-sm font-semibold">
                Versão instalada: {status.current_version}
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
