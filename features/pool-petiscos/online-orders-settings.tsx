"use client";

import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  LoaderCircle,
  QrCode,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  configureOnlineOrders,
  setOnlineOrdersEnabled,
  type OnlineOrdersStatus,
} from "./online-orders-companion";

type OnlineOrdersSettingsProps = {
  status: OnlineOrdersStatus | null;
  onChanged: () => Promise<void>;
  onMessage: (
    message: string,
    tone?: "success" | "warning" | "info",
  ) => void;
};

export function OnlineOrdersSettings({
  status,
  onChanged,
  onMessage,
}: OnlineOrdersSettingsProps) {
  const [busy, setBusy] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [publicMenuUrl, setPublicMenuUrl] = useState("");
  const [installationToken, setInstallationToken] = useState("");

  async function toggleEnabled(enabled: boolean) {
    setBusy(true);
    try {
      await setOnlineOrdersEnabled(enabled);
      await onChanged();
      onMessage(
        enabled
          ? "Pedidos pelo QR Code ativados."
          : "Novos pedidos pelo QR Code foram pausados.",
        "info",
      );
    } catch (error) {
      onMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível alterar o cardápio online.",
        "warning",
      );
    } finally {
      setBusy(false);
    }
  }

  async function configure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await configureOnlineOrders({
        apiBaseUrl: apiBaseUrl.trim(),
        publicMenuUrl: publicMenuUrl.trim(),
        installationToken: installationToken.trim(),
        enabled: true,
      });
      setInstallationToken("");
      await onChanged();
      onMessage("Cardápio online conectado com segurança.");
    } catch (error) {
      onMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível conectar o cardápio online.",
        "warning",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pool-settings-card rounded-[24px] border border-[#ebe5e1] bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#fff0f1] text-[#d9202c]">
            <QrCode size={24} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-xl font-black">Cardápio e pedidos online</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6d6561]">
              O cliente lê o QR Code, escolhe os produtos e o pedido aparece na
              fila do caixa. Nenhuma venda ou baixa de estoque acontece antes
              da entrega.
            </p>
          </div>
        </div>
        <span
          className={`inline-flex min-h-10 shrink-0 items-center gap-2 self-start rounded-full px-4 text-sm font-black ${
            status?.connected
              ? "bg-[#e9f7f0] text-[#23734f]"
              : "bg-[#f5eeee] text-[#8f4747]"
          }`}
        >
          {status?.connected ? (
            <Wifi size={17} aria-hidden="true" />
          ) : (
            <WifiOff size={17} aria-hidden="true" />
          )}
          {status?.connected ? "Conectado" : "Sem conexão"}
        </span>
      </div>

      {status?.configured ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="pool-soft-panel rounded-2xl border border-[#e6dfdb] bg-[#faf8f6] p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck
                className="mt-0.5 shrink-0 text-[#27865d]"
                size={21}
                aria-hidden="true"
              />
              <div>
                <strong className="block text-base font-black text-[#302b29]">
                  Chave protegida neste computador
                </strong>
                <p className="mt-1 text-sm font-semibold leading-6 text-[#6d6561]">
                  A chave privada fica protegida pelo Windows e não aparece no
                  QR Code. O endereço abaixo pode ser compartilhado com os
                  clientes.
                </p>
                {status.publicMenuUrl ? (
                  <a
                    href={status.publicMenuUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-2 break-all text-sm font-black text-[#b41622] underline underline-offset-4"
                  >
                    <Link2 size={16} aria-hidden="true" />
                    {status.publicMenuUrl}
                  </a>
                ) : null}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void toggleEnabled(!status.enabled)}
            disabled={busy}
            aria-pressed={status.enabled}
            className={`inline-flex min-h-14 items-center justify-center gap-2 rounded-xl px-6 font-black text-white transition disabled:cursor-wait disabled:opacity-60 ${
              status.enabled
                ? "bg-[#6f625d] hover:bg-[#544a46]"
                : "bg-[#27865d] hover:bg-[#206d4d]"
            }`}
          >
            {busy ? (
              <LoaderCircle className="animate-spin" size={19} />
            ) : (
              <CheckCircle2 size={19} />
            )}
            {status.enabled ? "Pausar novos pedidos" : "Ativar novos pedidos"}
          </button>
        </div>
      ) : (
        <details className="mt-6 rounded-2xl border border-[#ead8c7] bg-[#fffaf3] p-5">
          <summary className="cursor-pointer font-black text-[#5f4330]">
            Configuração técnica da primeira instalação
          </summary>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#7a6658]">
            Esta etapa é feita uma única vez por quem instala o sistema. A
            proprietária não precisa decorar nem digitar a chave depois.
          </p>
          <form
            onSubmit={configure}
            className="mt-5 grid gap-4 lg:grid-cols-2"
          >
            <label className="block">
              <span className="mb-2 block text-sm font-black text-[#5f5753]">
                Endereço da API
              </span>
              <input
                type="url"
                required
                value={apiBaseUrl}
                onChange={(event) => setApiBaseUrl(event.target.value)}
                placeholder="https://seu-dominio.com"
                autoComplete="url"
                className="h-14 w-full rounded-xl border border-[#ded7d2] bg-white px-4 font-semibold outline-none focus:border-[#d9202c] focus:ring-4 focus:ring-[#d9202c]/10"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-black text-[#5f5753]">
                Link público do cardápio
              </span>
              <input
                type="url"
                required
                value={publicMenuUrl}
                onChange={(event) => setPublicMenuUrl(event.target.value)}
                placeholder="https://seu-dominio.com/cardapio/pool-petiscos"
                autoComplete="url"
                className="h-14 w-full rounded-xl border border-[#ded7d2] bg-white px-4 font-semibold outline-none focus:border-[#d9202c] focus:ring-4 focus:ring-[#d9202c]/10"
              />
            </label>
            <label className="block lg:col-span-2">
              <span className="mb-2 block text-sm font-black text-[#5f5753]">
                Chave privada da instalação
              </span>
              <span className="flex overflow-hidden rounded-xl border border-[#ded7d2] bg-white focus-within:border-[#d9202c] focus-within:ring-4 focus-within:ring-[#d9202c]/10">
                <span className="grid w-12 shrink-0 place-items-center text-[#8b7f78]">
                  <KeyRound size={19} aria-hidden="true" />
                </span>
                <input
                  type={showToken ? "text" : "password"}
                  required
                  minLength={32}
                  value={installationToken}
                  onChange={(event) => setInstallationToken(event.target.value)}
                  autoComplete="new-password"
                  className="h-14 min-w-0 flex-1 bg-transparent px-2 font-mono text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((current) => !current)}
                  className="grid w-12 shrink-0 place-items-center text-[#6d6561] hover:text-[#d9202c]"
                  aria-label={showToken ? "Ocultar chave" : "Mostrar chave"}
                >
                  {showToken ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </span>
            </label>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-[#302b29] px-5 font-black text-white transition hover:bg-[#171514] disabled:cursor-wait disabled:opacity-60 lg:col-span-2"
            >
              {busy ? (
                <LoaderCircle className="animate-spin" size={19} />
              ) : (
                <ShieldCheck size={19} />
              )}
              Conectar cardápio online
            </button>
          </form>
        </details>
      )}
    </section>
  );
}
