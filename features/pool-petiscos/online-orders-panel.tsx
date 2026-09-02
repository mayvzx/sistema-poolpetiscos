"use client";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChefHat,
  Clock3,
  ConciergeBell,
  Copy,
  Download,
  MapPin,
  PackageCheck,
  QrCode,
  RefreshCw,
  ShoppingBag,
  Utensils,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { currency } from "./domain";
import type {
  OnlineOrder,
  OnlineOrderAction,
  OnlineOrdersSnapshot,
  OnlineOrderStatus,
} from "./online-orders-companion";
import type { PaymentMethod } from "./types";

type OnlineOrdersPanelProps = {
  snapshot: OnlineOrdersSnapshot | null;
  loading: boolean;
  error: string | null;
  cashOpen: boolean;
  onRefresh: () => Promise<void>;
  onAction: (
    order: OnlineOrder,
    action: OnlineOrderAction,
    options?: { reason?: string },
  ) => Promise<void>;
  onComplete: (
    order: OnlineOrder,
    paymentMethod: PaymentMethod,
  ) => Promise<void>;
};

const ACTIVE_STATUSES = new Set<OnlineOrderStatus>([
  "pending",
  "accepted",
  "preparing",
  "ready",
]);

const STATUS_COPY: Record<
  OnlineOrderStatus,
  { label: string; helper: string; tone: string }
> = {
  pending: {
    label: "Novo pedido",
    helper: "Confirme para avisar o cliente.",
    tone: "border-[#f4c5c8] bg-[#fff4f4] text-[#b41622]",
  },
  accepted: {
    label: "Confirmado",
    helper: "Aguardando o início do preparo.",
    tone: "border-[#efd38c] bg-[#fff8de] text-[#8d6100]",
  },
  preparing: {
    label: "Em preparo",
    helper: "O cliente acompanha essa etapa.",
    tone: "border-[#bcd7ee] bg-[#eff7ff] text-[#205c89]",
  },
  ready: {
    label: "Pronto",
    helper: "Finalize quando entregar ou retirar.",
    tone: "border-[#a9d9c2] bg-[#eaf8f1] text-[#23734f]",
  },
  completed: {
    label: "Concluído",
    helper: "Venda registrada no caixa.",
    tone: "border-[#d9d2ce] bg-[#f7f5f2] text-[#5f5753]",
  },
  rejected: {
    label: "Recusado",
    helper: "O cliente recebeu o aviso.",
    tone: "border-[#e5c8c8] bg-[#fbf0f0] text-[#8f3333]",
  },
  cancelled: {
    label: "Cancelado",
    helper: "Pedido cancelado.",
    tone: "border-[#d9d2ce] bg-[#f7f5f2] text-[#5f5753]",
  },
  expired: {
    label: "Expirado",
    helper: "Não foi confirmado a tempo.",
    tone: "border-[#d9d2ce] bg-[#f7f5f2] text-[#5f5753]",
  },
};

const NEXT_ACTION: Partial<
  Record<OnlineOrderStatus, { action: OnlineOrderAction; label: string }>
> = {
  pending: { action: "accept", label: "Aceitar pedido" },
  accepted: { action: "start", label: "Iniciar preparo" },
  preparing: { action: "ready", label: "Marcar como pronto" },
};

const PAYMENT_OPTIONS: PaymentMethod[] = [
  "Pix",
  "Dinheiro",
  "Débito",
  "Crédito",
];

function formatElapsed(timestamp: number) {
  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 60_000),
  );
  if (elapsedMinutes < 1) return "agora";
  if (elapsedMinutes === 1) return "há 1 min";
  if (elapsedMinutes < 60) return `há ${elapsedMinutes} min`;
  const hours = Math.floor(elapsedMinutes / 60);
  return `há ${hours} h`;
}

function formatOrderNumber(value: number) {
  return `#${String(value).padStart(3, "0")}`;
}

function paymentHelper(payment: PaymentMethod, surchargeRate: number) {
  if (payment === "Débito" || payment === "Crédito") {
    return `${payment} · acréscimo de ${Math.round(surchargeRate * 100)}%`;
  }
  return payment;
}

function OrderCard({
  order,
  busy,
  cashOpen,
  onAction,
  onComplete,
}: {
  order: OnlineOrder;
  busy: boolean;
  cashOpen: boolean;
  onAction: OnlineOrdersPanelProps["onAction"];
  onComplete: OnlineOrdersPanelProps["onComplete"];
}) {
  const [paymentMethod, setPaymentMethod] = useState(order.paymentMethod);
  const copy = STATUS_COPY[order.status];
  const next = NEXT_ACTION[order.status];
  const location =
    order.fulfillmentMode === "table"
      ? order.tableLabel || "Mesa"
      : "Retirada no balcão";

  async function rejectOrder() {
    if (
      !window.confirm(
        `Recusar o pedido ${formatOrderNumber(order.number)}? O cliente verá que ele não poderá ser preparado.`,
      )
    ) {
      return;
    }
    await onAction(order, "reject", { reason: "Pedido indisponível" });
  }

  return (
    <article className="overflow-hidden rounded-[24px] border border-[#dfd8d2] bg-white shadow-[0_16px_45px_rgba(45,31,25,0.07)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#eee8e3] px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <strong className="font-display text-[1.7rem] leading-none text-[#211916]">
              {formatOrderNumber(order.number)}
            </strong>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.08em] ${copy.tone}`}
            >
              {copy.label}
            </span>
            {order.syncPending ? (
              <span className="rounded-full bg-[#fff4d8] px-2.5 py-1 text-xs font-bold text-[#8d6100]">
                sincronizando
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-semibold text-[#766d68]">
            {copy.helper}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-black text-[#211916]">
            {formatElapsed(order.createdAt)}
          </p>
          <p className="mt-1 flex items-center justify-end gap-1.5 text-xs font-semibold text-[#8d837d]">
            {order.fulfillmentMode === "table" ? (
              <Utensils size={14} aria-hidden="true" />
            ) : (
              <ShoppingBag size={14} aria-hidden="true" />
            )}
            {location}
          </p>
        </div>
      </div>

      <div className="grid gap-5 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_210px]">
        <div>
          <div className="mb-4 flex items-center gap-2 text-[#211916]">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#f7efea] text-[#d9202c]">
              <ConciergeBell size={18} aria-hidden="true" />
            </span>
            <div>
              <p className="font-black">{order.customerName || "Cliente"}</p>
              <p className="text-xs font-semibold text-[#8d837d]">
                {location}
              </p>
            </div>
          </div>
          <ul className="space-y-3" aria-label="Itens do pedido">
            {order.items.map((item) => (
              <li
                key={item.id}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3 text-sm"
              >
                <span className="grid h-7 min-w-7 place-items-center rounded-lg bg-[#211916] px-1.5 font-black text-white">
                  {item.quantity}×
                </span>
                <div>
                  <p className="font-extrabold text-[#352b27]">{item.name}</p>
                  {item.note ? (
                    <p className="mt-1 text-xs font-semibold text-[#8a4f45]">
                      Observação: {item.note}
                    </p>
                  ) : null}
                </div>
                <span className="font-extrabold text-[#5c514b]">
                  {currency.format(item.lineTotalCents / 100)}
                </span>
              </li>
            ))}
          </ul>
          {order.customerNote ? (
            <div className="mt-4 rounded-2xl border border-[#f0d4ba] bg-[#fff9ef] px-4 py-3 text-sm text-[#6c4a2f]">
              <strong>Observação geral:</strong> {order.customerNote}
            </div>
          ) : null}
        </div>

        <aside className="rounded-2xl bg-[#f7f2ee] p-4">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#8d837d]">
            Pagamento no local
          </p>
          {order.status === "ready" ? (
            <label className="mt-3 block text-sm font-bold text-[#493d37]">
              Confirmar forma
              <select
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(event.target.value as PaymentMethod)
                }
                className="mt-2 w-full rounded-xl border border-[#d8cec7] bg-white px-3 py-2.5 font-bold text-[#211916] outline-none focus:border-[#d9202c]"
                disabled={busy}
              >
                {PAYMENT_OPTIONS.map((payment) => (
                  <option key={payment} value={payment}>
                    {payment}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="mt-2 text-sm font-bold text-[#493d37]">
              {paymentHelper(order.paymentMethod, order.surchargeRate)}
            </p>
          )}
          <div className="my-4 h-px bg-[#ded4ce]" />
          <p className="text-xs font-bold text-[#8d837d]">Total do pedido</p>
          <p className="mt-1 text-2xl font-black text-[#211916]">
            {currency.format(order.totalCents / 100)}
          </p>
          {order.surchargeCents > 0 ? (
            <p className="mt-1 text-xs font-semibold text-[#8d837d]">
              Inclui {currency.format(order.surchargeCents / 100)} de acréscimo.
            </p>
          ) : null}
        </aside>
      </div>

      {ACTIVE_STATUSES.has(order.status) ? (
        <div className="flex flex-wrap gap-2 border-t border-[#eee8e3] bg-[#fcfaf8] px-5 py-4">
          {next ? (
            <button
              type="button"
              onClick={() => void onAction(order, next.action)}
              disabled={busy}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#d9202c] px-5 py-3 font-black text-white shadow-[0_8px_18px_rgba(217,32,44,0.2)] transition hover:bg-[#b91520] disabled:cursor-wait disabled:opacity-60"
            >
              {order.status === "pending" ? (
                <Check size={18} aria-hidden="true" />
              ) : order.status === "accepted" ? (
                <ChefHat size={18} aria-hidden="true" />
              ) : (
                <PackageCheck size={18} aria-hidden="true" />
              )}
              {next.label}
            </button>
          ) : null}
          {order.status === "ready" ? (
            <button
              type="button"
              onClick={() => void onComplete(order, paymentMethod)}
              disabled={busy || !cashOpen}
              title={!cashOpen ? "Abra o caixa antes de registrar a venda." : undefined}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#26855d] px-5 py-3 font-black text-white transition hover:bg-[#1f704e] disabled:cursor-not-allowed disabled:bg-[#b8afa9]"
            >
              <CheckCircle2 size={18} aria-hidden="true" />
              Entregar e registrar venda
            </button>
          ) : null}
          {order.status === "pending" ? (
            <button
              type="button"
              onClick={() => void rejectOrder()}
              disabled={busy}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#dccfca] bg-white px-4 py-3 font-bold text-[#6f625d] transition hover:border-[#d9202c] hover:text-[#b41622] disabled:cursor-wait disabled:opacity-60"
            >
              <X size={18} aria-hidden="true" />
              Recusar
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function OnlineOrdersPanel({
  snapshot,
  loading,
  error,
  cashOpen,
  onRefresh,
  onAction,
  onComplete,
}: OnlineOrdersPanelProps) {
  const [filter, setFilter] = useState<"active" | "history">("active");
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const orders = useMemo(() => {
    const source = snapshot?.orders ?? [];
    return source
      .filter((order) =>
        filter === "active"
          ? ACTIVE_STATUSES.has(order.status)
          : !ACTIVE_STATUSES.has(order.status),
      )
      .sort((left, right) =>
        filter === "active"
          ? left.createdAt - right.createdAt
          : right.updatedAt - left.updatedAt,
      );
  }, [filter, snapshot?.orders]);

  async function runAction(
    order: OnlineOrder,
    action: OnlineOrderAction,
    options?: { reason?: string },
  ) {
    setBusyOrderId(order.id);
    try {
      await onAction(order, action, options);
    } finally {
      setBusyOrderId(null);
    }
  }

  async function complete(order: OnlineOrder, paymentMethod: PaymentMethod) {
    setBusyOrderId(order.id);
    try {
      await onComplete(order, paymentMethod);
    } finally {
      setBusyOrderId(null);
    }
  }

  const status = snapshot?.status;

  useEffect(() => {
    let cancelled = false;
    const publicMenuUrl = status?.publicMenuUrl;
    if (!publicMenuUrl) return;
    void import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(publicMenuUrl, {
          width: 560,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#211916", light: "#ffffff" },
        }),
      )
      .then((url) => {
        if (!cancelled) setQrCodeUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrCodeUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [status?.publicMenuUrl]);

  async function copyPublicLink() {
    if (!status?.publicMenuUrl) return;
    try {
      await navigator.clipboard.writeText(status.publicMenuUrl);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1_800);
    } catch {
      setLinkCopied(false);
    }
  }

  return (
    <section className="space-y-6 pb-10">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#d9202c]">
            Cardápio digital
          </p>
          <h1 className="mt-2 font-display text-4xl font-black text-[#211916]">
            Pedidos online
          </h1>
          <p className="mt-2 max-w-2xl text-base font-semibold text-[#766d68]">
            Confirme os pedidos enviados pelo QR Code e acompanhe o preparo até
            a entrega. O caixa só registra a venda na última etapa.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={loading}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#d9202c] bg-[#d9202c] px-5 py-3 font-black text-white shadow-[0_10px_24px_rgba(217,32,44,0.18)] transition hover:border-[#b91520] hover:bg-[#b91520] disabled:cursor-wait disabled:border-[#6f625d] disabled:bg-[#6f625d] disabled:text-white disabled:shadow-none disabled:opacity-100"
        >
          <RefreshCw
            size={18}
            className={loading ? "animate-spin" : ""}
            aria-hidden="true"
          />
          Sincronizar agora
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[22px] border border-[#dfd8d2] bg-white p-5">
          <div className="flex items-center gap-3">
            <span
              className={`grid h-11 w-11 place-items-center rounded-2xl ${status?.connected ? "bg-[#e7f5ee] text-[#26855d]" : "bg-[#f6eceb] text-[#a34848]"}`}
            >
              {status?.connected ? (
                <Wifi size={21} aria-hidden="true" />
              ) : (
                <WifiOff size={21} aria-hidden="true" />
              )}
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.1em] text-[#8d837d]">
                Conexão
              </p>
              <p className="mt-1 font-black text-[#211916]">
                {status?.connected
                  ? "Sincronizada"
                  : status?.configured
                    ? "Tentando conectar"
                    : "Ainda não configurada"}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-[22px] border border-[#dfd8d2] bg-white p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#fff2f2] text-[#d9202c]">
              <ConciergeBell size={21} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.1em] text-[#8d837d]">
                Aguardando
              </p>
              <p className="mt-1 font-black text-[#211916]">
                {status?.pendingCount ?? 0} novo(s) pedido(s)
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-[22px] border border-[#dfd8d2] bg-white p-5">
          <div className="flex items-center gap-3">
            <span
              className={`grid h-11 w-11 place-items-center rounded-2xl ${status?.acceptingOrders ? "bg-[#e7f5ee] text-[#26855d]" : "bg-[#fff4de] text-[#9a6811]"}`}
            >
              {status?.acceptingOrders ? (
                <CheckCircle2 size={21} aria-hidden="true" />
              ) : (
                <Clock3 size={21} aria-hidden="true" />
              )}
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.1em] text-[#8d837d]">
                Recebimento
              </p>
              <p className="mt-1 font-black text-[#211916]">
                {status?.acceptingOrders
                  ? "QR Code recebendo pedidos"
                  : cashOpen
                    ? "Indisponível na internet"
                    : "Abra o caixa para receber"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {!status?.configured ? (
        <div className="rounded-[24px] border border-[#efd38c] bg-[#fff9e8] p-6 text-[#654a18]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0" size={22} aria-hidden="true" />
            <div>
              <h2 className="font-display text-xl font-black">
                A conexão será ativada na instalação
              </h2>
              <p className="mt-2 max-w-3xl font-semibold leading-relaxed">
                O cardápio e a fila já fazem parte do sistema. A chave privada
                da lanchonete precisa ser configurada uma única vez neste
                computador; ela não aparece no QR Code nem fica exposta aos
                clientes.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {status?.publicMenuUrl ? (
        <section className="grid overflow-hidden rounded-[26px] border border-[#dfd8d2] bg-[#211916] text-white shadow-[0_18px_48px_rgba(40,25,20,0.12)] lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="p-6 sm:p-8">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-[#ffd9d9]">
              <QrCode size={15} aria-hidden="true" />
              QR Code da Pool
            </span>
            <h2 className="mt-4 font-display text-3xl font-black">
              Cardápio pronto para compartilhar
            </h2>
            <p className="mt-3 max-w-2xl font-semibold leading-relaxed text-white/68">
              Imprima o QR Code e deixe no balcão ou nas mesas. O cliente abre
              o cardápio no próprio celular, escolhe os itens e o pedido chega
              nesta fila para confirmação.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void copyPublicLink()}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#d9202c] px-4 py-2.5 text-sm font-black text-white transition hover:bg-[#b91520]"
              >
                <Copy size={17} aria-hidden="true" />
                {linkCopied ? "Link copiado" : "Copiar link"}
              </button>
              {qrCodeUrl ? (
                <a
                  href={qrCodeUrl}
                  download="qr-code-cardapio-pool-petiscos.png"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/18 bg-white/8 px-4 py-2.5 text-sm font-black text-white transition hover:bg-white/14"
                >
                  <Download size={17} aria-hidden="true" />
                  Baixar QR Code
                </a>
              ) : null}
            </div>
            <p className="mt-4 break-all text-xs font-semibold text-white/42">
              {status.publicMenuUrl}
            </p>
          </div>
          <div className="grid place-items-center bg-[#efe5de] p-6">
            {qrCodeUrl ? (
              <div className="rounded-[22px] bg-white p-3 shadow-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrCodeUrl}
                  alt="QR Code que abre o cardápio digital da Pool Petiscos"
                  className="h-48 w-48"
                />
              </div>
            ) : (
              <span className="font-bold text-[#776d68]">Gerando QR Code…</span>
            )}
          </div>
        </section>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-[#efc4c4] bg-[#fff4f4] px-5 py-4 font-bold text-[#9d2932]"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ded5cf] pb-3">
        <div className="flex rounded-xl bg-[#eee8e3] p-1">
          {(
            [
              ["active", "Em andamento"],
              ["history", "Histórico"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
              className={`rounded-lg px-4 py-2.5 text-sm font-black transition ${
                filter === id
                  ? "bg-white text-[#211916] shadow-sm"
                  : "text-[#766d68] hover:text-[#211916]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {status?.publicMenuUrl ? (
          <a
            href={status.publicMenuUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-black text-[#b41622] underline decoration-[#e3a9ad] underline-offset-4"
          >
            <MapPin size={16} aria-hidden="true" />
            Abrir cardápio do cliente
          </a>
        ) : null}
      </div>

      {orders.length ? (
        <div className="grid gap-5 2xl:grid-cols-2">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              busy={busyOrderId === order.id}
              cashOpen={cashOpen}
              onAction={runAction}
              onComplete={complete}
            />
          ))}
        </div>
      ) : (
        <div className="grid min-h-[310px] place-items-center rounded-[28px] border border-dashed border-[#d8cec7] bg-[#fbf8f5] p-8 text-center">
          <div>
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white text-[#d9202c] shadow-sm">
              {filter === "active" ? (
                <ConciergeBell size={28} aria-hidden="true" />
              ) : (
                <CheckCircle2 size={28} aria-hidden="true" />
              )}
            </span>
            <h2 className="mt-4 font-display text-2xl font-black text-[#2b211e]">
              {loading
                ? "Buscando pedidos…"
                : filter === "active"
                  ? "Nenhum pedido online em andamento"
                  : "O histórico ainda está vazio"}
            </h2>
            <p className="mx-auto mt-2 max-w-md font-semibold text-[#81766f]">
              {filter === "active"
                ? "Quando um cliente confirmar pelo cardápio, o pedido aparecerá aqui para ser aceito."
                : "Pedidos concluídos, recusados ou expirados serão guardados aqui."}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
