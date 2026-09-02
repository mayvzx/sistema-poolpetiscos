"use client";

import {
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Minus,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Store,
  WalletCards,
  WifiOff,
  X,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INITIAL_PRODUCTS } from "../pool-petiscos/catalog-data";
import {
  ONLINE_ORDER_STATUSES,
  statusLabel,
  type OnlineOrderStatus,
  type OnlinePaymentMethod,
} from "./domain";

type MenuCategory = { id: string; key: string; name: string; sortOrder: number };
type MenuProduct = {
  id: string;
  categoryId: string | null;
  name: string;
  description: string;
  imageUrl: string | null;
  emoji: string;
  priceCents: number;
  available: boolean;
  sortOrder: number;
};
type MenuPayload = {
  store: {
    slug: string;
    name: string;
    acceptingOrders: boolean;
    table: { label: string } | null;
    modes: Array<"table" | "pickup">;
  };
  catalogVersion: number;
  categories: MenuCategory[];
  products: MenuProduct[];
};
type CartLine = { quantity: number; note: string };
type OrderSnapshot = {
  id: string;
  number: number;
  status: OnlineOrderStatus;
  fulfillmentMode: "table" | "pickup";
  tableLabel: string | null;
  customerName: string;
  paymentMethod: string;
  subtotalCents: number;
  surchargeCents: number;
  totalCents: number;
  rejectionReason: string | null;
  updatedAt: number;
};
type StoredOrderTracking = {
  id: string;
  token: string;
  order: OrderSnapshot;
  savedAt: number;
};
type PendingSubmission = { key: string; body: string };

const PAYMENT_METHODS: OnlinePaymentMethod[] = ["Pix", "Dinheiro", "Débito", "Crédito"];
const TRACKING_STORAGE_PREFIX = "pool-online-order:";
const TRACKING_MAX_AGE_MS = 48 * 60 * 60 * 1_000;
const TERMINAL_STATUSES = new Set<OnlineOrderStatus>([
  "completed",
  "rejected",
  "cancelled",
  "expired",
]);

function currentTimestamp() {
  return Date.now();
}

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function previewMenu(storeSlug: string, mode: "table" | "pickup"): MenuPayload {
  const names = [...new Set(INITIAL_PRODUCTS.map((product) => product.category))];
  const categories = names.map((name, index) => ({
    id: `preview-${name}`,
    key: name,
    name,
    sortOrder: index,
  }));
  const categoryIds = new Map(categories.map((category) => [category.name, category.id]));
  return {
    store: {
      slug: storeSlug,
      name: "Pool Petiscos & Lanches",
      acceptingOrders: true,
      table: mode === "table" ? { label: "Mesa 04" } : null,
      modes: ["table", "pickup"],
    },
    catalogVersion: 1,
    categories,
    products: INITIAL_PRODUCTS.map((product, index) => ({
      id: product.id,
      categoryId: categoryIds.get(product.category) ?? null,
      name: product.name,
      description:
        product.category === "Hambúrgueres"
          ? "Preparado na hora, bem servido e com o sabor da Pool."
          : "Uma opção do nosso cardápio para completar seu pedido.",
      imageUrl: null,
      emoji: product.emoji,
      priceCents: Math.round(product.price * 100),
      available: true,
      sortOrder: index,
    })),
  };
}

function trackingStorageKey(storeSlug: string) {
  return `${TRACKING_STORAGE_PREFIX}${storeSlug}`;
}

function isOrderSnapshot(value: unknown): value is OrderSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OrderSnapshot>;
  const validMoney = (amount: unknown) =>
    typeof amount === "number" && Number.isSafeInteger(amount) && amount >= 0;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.number === "number" &&
    Number.isSafeInteger(candidate.number) &&
    typeof candidate.status === "string" &&
    ONLINE_ORDER_STATUSES.includes(candidate.status as OnlineOrderStatus) &&
    (candidate.fulfillmentMode === "table" || candidate.fulfillmentMode === "pickup") &&
    (candidate.tableLabel === null || typeof candidate.tableLabel === "string") &&
    typeof candidate.customerName === "string" &&
    typeof candidate.paymentMethod === "string" &&
    validMoney(candidate.subtotalCents) &&
    validMoney(candidate.surchargeCents) &&
    validMoney(candidate.totalCents) &&
    (candidate.rejectionReason === null || typeof candidate.rejectionReason === "string") &&
    typeof candidate.updatedAt === "number" &&
    Number.isFinite(candidate.updatedAt)
  );
}

function readStoredOrder(storeSlug: string): StoredOrderTracking | null {
  try {
    const raw = localStorage.getItem(trackingStorageKey(storeSlug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredOrderTracking>;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.token !== "string" ||
      typeof parsed.savedAt !== "number" ||
      Date.now() - parsed.savedAt > TRACKING_MAX_AGE_MS ||
      !isOrderSnapshot(parsed.order) ||
      parsed.order.id !== parsed.id
    ) {
      localStorage.removeItem(trackingStorageKey(storeSlug));
      return null;
    }
    return parsed as StoredOrderTracking;
  } catch {
    return null;
  }
}

function storeTrackedOrder(storeSlug: string, order: OrderSnapshot, token: string) {
  try {
    localStorage.setItem(
      trackingStorageKey(storeSlug),
      JSON.stringify({ id: order.id, token, order, savedAt: Date.now() } satisfies StoredOrderTracking),
    );
  } catch {
    // O acompanhamento continua na aba atual mesmo se o navegador bloquear o armazenamento local.
  }
}

function removeStoredOrder(storeSlug: string) {
  try {
    localStorage.removeItem(trackingStorageKey(storeSlug));
  } catch {
    // O navegador pode bloquear o armazenamento; não há nada adicional a remover nesse caso.
  }
}

function getOrCreateDeviceToken() {
  const key = "pool-online-device-v1";
  try {
    const saved = localStorage.getItem(key);
    if (saved) return saved;
  } catch {
    // Um identificador efêmero ainda permite o envio quando o armazenamento está indisponível.
  }
  const token = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  try {
    localStorage.setItem(key, token);
  } catch {
    // Mantém o token apenas durante este envio.
  }
  return token;
}

export default function PublicMenuApp({ storeSlug }: { storeSlug: string }) {
  const [menu, setMenu] = useState<MenuPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [preview, setPreview] = useState(false);
  const [fulfillmentMode, setFulfillmentMode] = useState<"table" | "pickup">("pickup");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<OnlinePaymentMethod>("Pix");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [order, setOrder] = useState<OrderSnapshot | null>(null);
  const [trackingToken, setTrackingToken] = useState("");
  const [trackingError, setTrackingError] = useState("");
  const [trackingRefreshing, setTrackingRefreshing] = useState(false);
  const [lastTrackingAt, setLastTrackingAt] = useState<number | null>(null);
  const formStartedAt = useRef(0);
  const tableToken = useRef("");
  const pendingSubmission = useRef<PendingSubmission | null>(null);
  const deviceToken = useRef("");
  const checkoutRef = useRef<HTMLElement | null>(null);
  const menuRefreshInFlight = useRef(false);
  const menuRef = useRef<MenuPayload | null>(null);

  const loadMenu = useCallback(async (options?: { silent?: boolean }) => {
    if (menuRefreshInFlight.current) return;
    const silent = options?.silent === true;
    menuRefreshInFlight.current = true;
    if (!silent) {
      setLoading(true);
      setError("");
    }
    const parameters = new URLSearchParams(window.location.search);
    const isPreview = parameters.get("preview") === "1";
    const token = parameters.get("mesa")?.trim() ?? "";
    const requestedMode = token ? "table" : "pickup";
    tableToken.current = token;
    setFulfillmentMode(requestedMode);
    setPreview(isPreview);
    if (isPreview) {
      const nextMenu = previewMenu(storeSlug, requestedMode);
      menuRef.current = nextMenu;
      setMenu(nextMenu);
      if (!silent) setLoading(false);
      menuRefreshInFlight.current = false;
      return;
    }
    if (!navigator.onLine) {
      if (!menuRef.current) {
        setError("Você está sem internet. Reconecte-se para abrir o cardápio e enviar pedidos.");
      }
      if (!silent) setLoading(false);
      menuRefreshInFlight.current = false;
      return;
    }
    try {
      const suffix = token ? `?tableToken=${encodeURIComponent(token)}` : "";
      const response = await fetch(`/api/v1/public/stores/${encodeURIComponent(storeSlug)}/menu${suffix}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as (MenuPayload & {
        error?: { message?: string };
      }) | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.error?.message || "Não foi possível abrir o cardápio.");
      }
      setFulfillmentMode(payload.store.table ? "table" : "pickup");
      menuRef.current = payload;
      setMenu(payload);
      setError("");
      // Remove somente itens que deixaram de existir no catálogo. Se um item
      // ficou sem estoque, ele continua no carrinho para que o cliente veja a
      // mudança e receba a validação correta ao enviar.
      const validProductIds = new Set(payload.products.map((product) => product.id));
      setCart((current) => {
        const next = Object.fromEntries(
          Object.entries(current).filter(([productId]) => validProductIds.has(productId)),
        );
        return Object.keys(next).length === Object.keys(current).length ? current : next;
      });
    } catch (requestError) {
      if (!silent || !menuRef.current) {
        setError(
          !navigator.onLine
            ? "Você está sem internet. Reconecte-se para abrir o cardápio e enviar pedidos."
            : requestError instanceof Error && requestError.message !== "Failed to fetch"
              ? requestError.message
              : "Não foi possível falar com a lanchonete agora. Tente novamente em instantes.",
        );
      }
    } finally {
      if (!silent) setLoading(false);
      menuRefreshInFlight.current = false;
    }
  }, [storeSlug]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadMenu(), 0);
    return () => window.clearTimeout(timer);
  }, [loadMenu]);

  useEffect(() => {
    if (preview || !isOnline || !menu) return;
    const timer = window.setInterval(() => void loadMenu({ silent: true }), 5_000);
    return () => window.clearInterval(timer);
  }, [isOnline, loadMenu, menu, preview]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    if (parameters.get("preview") === "1") return;
    const timer = window.setTimeout(() => {
      const restored = readStoredOrder(storeSlug);
      if (!restored) return;
      setOrder(restored.order);
      setTrackingToken(restored.token);
      setLastTrackingAt(restored.savedAt);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storeSlug]);

  const trackedOrderId = order?.id ?? "";
  const trackedOrderStatus = order?.status ?? null;

  const refreshTrackedOrder = useCallback(async (
    orderId: string,
    status: OnlineOrderStatus,
    token: string,
  ) => {
    if (!orderId || !token || TERMINAL_STATUSES.has(status)) return;
    if (!navigator.onLine) {
      setTrackingError("Sem internet. Mostramos abaixo o último andamento salvo neste aparelho.");
      return;
    }
    setTrackingRefreshing(true);
    try {
      const response = await fetch(`/api/v1/public/orders/${encodeURIComponent(orderId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | { order?: OrderSnapshot; error?: { message?: string } }
        | null;
      if (!response.ok || !payload?.order) {
        throw new Error(
          response.status === 404
            ? "Não foi possível retomar este acompanhamento. Confirme o pedido diretamente no balcão."
            : payload?.error?.message || "Não foi possível atualizar o andamento agora.",
        );
      }
      setOrder(payload.order);
      setTrackingError("");
      setLastTrackingAt(currentTimestamp());
      storeTrackedOrder(storeSlug, payload.order, token);
    } catch (requestError) {
      setTrackingError(
        !navigator.onLine
          ? "Sem internet. Mostramos abaixo o último andamento salvo neste aparelho."
          : requestError instanceof Error && requestError.message !== "Failed to fetch"
            ? requestError.message
            : "Não foi possível atualizar o andamento agora. O pedido já enviado continua salvo.",
      );
    } finally {
      setTrackingRefreshing(false);
    }
  }, [storeSlug]);

  useEffect(() => {
    if (
      !isOnline ||
      !trackedOrderId ||
      !trackedOrderStatus ||
      !trackingToken ||
      preview ||
      TERMINAL_STATUSES.has(trackedOrderStatus)
    ) return;
    const initialTimer = window.setTimeout(
      () => void refreshTrackedOrder(trackedOrderId, trackedOrderStatus, trackingToken),
      0,
    );
    const timer = window.setInterval(
      () => void refreshTrackedOrder(trackedOrderId, trackedOrderStatus, trackingToken),
      5_000,
    );
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [isOnline, preview, refreshTrackedOrder, trackedOrderId, trackedOrderStatus, trackingToken]);

  useEffect(() => {
    if (!checkoutOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    checkoutRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCheckoutOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [checkoutOpen]);

  const selectedProducts = useMemo(() => {
    if (!menu) return [];
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return menu.products.filter(
      (product) =>
        (category === "all" || product.categoryId === category) &&
        (!normalized ||
          product.name.toLocaleLowerCase("pt-BR").includes(normalized) ||
          product.description.toLocaleLowerCase("pt-BR").includes(normalized)),
    );
  }, [category, menu, query]);

  const cartProducts = useMemo(
    () =>
      (menu?.products ?? [])
        .filter((product) => cart[product.id]?.quantity > 0)
        .map((product) => ({ ...product, ...cart[product.id] })),
    [cart, menu],
  );
  const itemCount = cartProducts.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalCents = cartProducts.reduce(
    (sum, item) => sum + item.priceCents * item.quantity,
    0,
  );
  const surchargeRate = paymentMethod === "Débito" ? 0.03 : paymentMethod === "Crédito" ? 0.06 : 0;
  const surchargeCents = Math.round(subtotalCents * surchargeRate);
  const totalCents = subtotalCents + surchargeCents;
  const canSendOrders = preview || Boolean(menu?.store.acceptingOrders && isOnline);

  function changeQuantity(productId: string, delta: number) {
    if (delta > 0 && itemCount === 0) formStartedAt.current = currentTimestamp();
    if (delta < 0 && checkoutOpen && itemCount === 1 && cart[productId]?.quantity === 1) {
      setCheckoutOpen(false);
    }
    setCart((current) => {
      const nextQuantity = Math.max(0, Math.min(20, (current[productId]?.quantity ?? 0) + delta));
      if (nextQuantity === 0) {
        const next = { ...current };
        delete next[productId];
        return next;
      }
      return {
        ...current,
        [productId]: {
          quantity: nextQuantity,
          note: current[productId]?.note ?? "",
        },
      };
    });
  }

  async function submitOrder() {
    if (!menu || cartProducts.length === 0) return;
    if (!preview && !navigator.onLine) {
      setSendError("Você está sem internet. Reconecte-se antes de enviar o pedido.");
      return;
    }
    if (!preview && !menu.store.acceptingOrders) {
      setSendError("A lanchonete não está recebendo pedidos online neste momento.");
      return;
    }
    setSending(true);
    setSendError("");
    if (preview) {
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      setOrder({
        id: "preview-order",
        number: 104,
        status: "accepted",
        fulfillmentMode,
        tableLabel: fulfillmentMode === "table" ? menu.store.table?.label ?? "Mesa 04" : null,
        customerName: customerName.trim() || "Cliente da mesa",
        paymentMethod,
        subtotalCents,
        surchargeCents,
        totalCents,
        rejectionReason: null,
        updatedAt: currentTimestamp(),
      });
      setCheckoutOpen(false);
      setSending(false);
      return;
    }
    try {
      const requestBody = JSON.stringify({
        fulfillmentMode,
        ...(tableToken.current ? { tableToken: tableToken.current } : {}),
        customerName,
        customerNote,
        paymentMethod,
        catalogVersion: menu.catalogVersion,
        deviceToken: deviceToken.current || (deviceToken.current = getOrCreateDeviceToken()),
        formStartedAt: formStartedAt.current,
        website: "",
        items: cartProducts.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
          note: item.note,
        })),
      });
      if (!pendingSubmission.current || pendingSubmission.current.body !== requestBody) {
        pendingSubmission.current = { key: crypto.randomUUID(), body: requestBody };
      }
      const submission = pendingSubmission.current;
      const response = await fetch(
        `/api/v1/public/stores/${encodeURIComponent(storeSlug)}/orders`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": submission.key,
          },
          body: submission.body,
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | {
            order?: OrderSnapshot;
            accessToken?: string;
            error?: { message?: string; code?: string };
          }
        | null;
      if (!response.ok || !payload?.order || !payload.accessToken) {
        if (payload?.error?.code === "CATALOG_CHANGED" || payload?.error?.code === "ITEM_UNAVAILABLE") {
          pendingSubmission.current = null;
          await loadMenu();
        }
        throw new Error(payload?.error?.message || "Não foi possível enviar o pedido.");
      }
      pendingSubmission.current = null;
      setOrder(payload.order);
      setTrackingToken(payload.accessToken);
      setLastTrackingAt(currentTimestamp());
      storeTrackedOrder(storeSlug, payload.order, payload.accessToken);
      setCheckoutOpen(false);
    } catch (requestError) {
      setSendError(
        !navigator.onLine
          ? "A conexão caiu durante o envio. Reconecte-se e toque em enviar novamente; o sistema verificará o mesmo pedido sem duplicá-lo."
          : requestError instanceof Error && requestError.message !== "Failed to fetch"
            ? requestError.message
            : "Não foi possível confirmar o envio. Tente novamente: o mesmo pedido não será duplicado.",
      );
    } finally {
      setSending(false);
    }
  }

  function startNewOrder() {
    removeStoredOrder(storeSlug);
    setOrder(null);
    setTrackingToken("");
    setTrackingError("");
    setLastTrackingAt(null);
    setCart({});
    setCustomerName("");
    setCustomerNote("");
    setPaymentMethod("Pix");
    setSendError("");
    pendingSubmission.current = null;
    formStartedAt.current = currentTimestamp();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (order) {
    const terminal = TERMINAL_STATUSES.has(order.status);
    const failed = ["rejected", "cancelled", "expired"].includes(order.status);
    const steps: OnlineOrderStatus[] = ["pending", "accepted", "preparing", "ready", "completed"];
    const currentIndex = steps.indexOf(order.status);
    return (
      <main className="online-menu online-order-tracker" aria-label="Acompanhamento do pedido">
        <section className="online-tracker-card" aria-busy={trackingRefreshing}>
          <Image
            src="/pool-logo-round.jpg"
            alt="Pool Petiscos & Lanches"
            width={96}
            height={96}
            priority
          />
          <span className="online-menu-kicker">PEDIDO #{String(order.number).padStart(3, "0")}</span>
          <div
            className={`online-tracker-icon ${failed ? "is-failed" : order.status === "completed" ? "is-complete" : "is-active"}`}
            aria-hidden="true"
          >
            {failed ? (
              <XCircle size={34} />
            ) : order.status === "pending" ? (
              <Clock3 size={34} />
            ) : (
              <CheckCircle2 size={34} />
            )}
          </div>
          <h1 aria-live="polite">{statusLabel(order.status)}</h1>
          <p>
            {order.status === "pending" && "Aguarde a lanchonete confirmar antes de considerar o pedido aceito."}
            {order.status === "accepted" && "Recebemos seu pedido e já vamos começar o preparo."}
            {order.status === "preparing" && "Seu pedido está sendo preparado com cuidado."}
            {order.status === "ready" &&
              (order.fulfillmentMode === "table"
                ? `Vamos levar até ${order.tableLabel ?? "sua mesa"}.`
                : "Pode retirar no balcão informando o número do pedido.")}
            {order.status === "completed" && "Pedido entregue. Obrigado por escolher a Pool!"}
            {["rejected", "cancelled", "expired"].includes(order.status) &&
              (order.rejectionReason || "Este pedido não será preparado. Fale com a equipe no balcão.")}
          </p>
          {!terminal && (
            <ol className="online-tracker-steps" aria-label="Andamento do pedido">
              {steps.map((step, index) => (
                <li key={step} className={index <= currentIndex ? "is-done" : ""}>
                  <span>{index + 1}</span>
                  {statusLabel(step)}
                </li>
              ))}
            </ol>
          )}
          <div className="online-tracker-total">
            <span>Total presencial</span>
            <strong>{money(order.totalCents)}</strong>
          </div>
          {!preview && (!isOnline || trackingError) && (
            <div className="online-tracking-notice" role="status">
              <WifiOff size={20} aria-hidden="true" />
              <div>
                <strong>{!isOnline ? "Acompanhamento sem internet" : "Atualização temporariamente indisponível"}</strong>
                <p>{trackingError || "O último andamento salvo continua visível."}</p>
              </div>
            </div>
          )}
          {!preview && lastTrackingAt && (
            <p className="online-tracking-time">
              Última atualização: {new Date(lastTrackingAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
          {!terminal && !preview && (
            <button
              className="online-menu-secondary online-tracking-refresh"
              onClick={() => void refreshTrackedOrder(order.id, order.status, trackingToken)}
              disabled={trackingRefreshing || !isOnline}
            >
              <RefreshCw className={trackingRefreshing ? "online-menu-spinner" : ""} size={18} aria-hidden="true" />
              {trackingRefreshing ? "Atualizando…" : "Atualizar andamento"}
            </button>
          )}
          {(terminal || preview) && (
            <button className="online-menu-primary online-tracker-new-order" onClick={startNewOrder}>
              <ShoppingBag size={19} aria-hidden="true" />
              {preview ? "Voltar ao cardápio" : "Fazer novo pedido"}
            </button>
          )}
          {preview && <span className="online-preview-note">Exemplo visual — nenhum pedido foi enviado</span>}
        </section>
      </main>
    );
  }
  if (loading) {
    return (
      <main className="online-menu online-menu-center" aria-live="polite" aria-busy="true">
        <RefreshCw className="online-menu-spinner" aria-hidden="true" />
        <p>Abrindo o cardápio…</p>
      </main>
    );
  }
  if (error || !menu) {
    const offline = !isOnline;
    return (
      <main className="online-menu online-menu-center" role="alert">
        {offline ? (
          <div className="online-menu-error-symbol"><WifiOff size={36} aria-hidden="true" /></div>
        ) : (
          <Image
            className="online-menu-error-logo"
            src="/pool-logo-round.jpg"
            alt="Pool Petiscos"
            width={96}
            height={96}
          />
        )}
        <h1>{offline ? "Você está sem internet" : "Não conseguimos abrir o cardápio"}</h1>
        <p>{error || "Tente novamente em alguns instantes."}</p>
        <button className="online-menu-primary" onClick={() => void loadMenu()} disabled={offline}>
          <RefreshCw size={19} aria-hidden="true" /> {offline ? "Aguardando conexão" : "Tentar novamente"}
        </button>
      </main>
    );
  }

  return (
    <main className="online-menu" aria-label="Cardápio digital da Pool Petiscos">
      <header className="online-menu-header">
        <div className="online-menu-brand">
          <Image src="/pool-logo-round.jpg" alt="" width={72} height={72} priority />
          <div>
            <span>Cardápio digital</span>
            <strong>{menu.store.name}</strong>
          </div>
        </div>
        <div className={`online-menu-status ${canSendOrders ? "is-open" : "is-closed"}`} role="status">
          <span aria-hidden="true" />
          {canSendOrders ? "Recebendo pedidos" : !isOnline ? "Sem internet" : "Fechado no momento"}
        </div>
      </header>

      <section className="online-menu-hero">
        <div>
          <span className="online-menu-kicker">
            {menu.store.table ? `PEDIDO PARA ${menu.store.table.label.toUpperCase()}` : "RETIRADA NO BALCÃO"}
          </span>
          <h1>Seu pedido, do seu jeito.</h1>
          <p>Escolha com calma. A cozinha só começa depois que a equipe confirmar.</p>
        </div>
        <div className="online-menu-hero-mark" aria-hidden="true">POOL</div>
      </section>

      {preview && (
        <div className="online-preview-banner">
          Visualização do novo cardápio — você pode testar o fluxo sem enviar pedidos.
        </div>
      )}

      <section className="online-menu-controls" aria-label="Filtros do cardápio">
        <label className="online-menu-search">
          <Search size={20} aria-hidden="true" />
          <span className="sr-only">Buscar produto</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar hambúrguer, bebida…"
            autoComplete="off"
          />
        </label>
        <div className="online-menu-categories" role="group" aria-label="Categorias">
          <button
            type="button"
            className={category === "all" ? "is-active" : ""}
            aria-pressed={category === "all"}
            onClick={() => setCategory("all")}
          >
            Todos
          </button>
          {menu.categories.map((item) => (
            <button
              type="button"
              key={item.id}
              className={category === item.id ? "is-active" : ""}
              aria-pressed={category === item.id}
              onClick={() => setCategory(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>
      </section>

      {!canSendOrders && (
        <section className="online-menu-offline" role="status">
          {!isOnline ? <WifiOff aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
          <div>
            <strong>{!isOnline ? "Você está sem internet" : "Pedidos online indisponíveis agora"}</strong>
            <p>
              {!isOnline
                ? "Você pode continuar conferindo os itens, mas precisa se reconectar antes de enviar."
                : "Você ainda pode consultar o cardápio e fazer o pedido diretamente no balcão."}
            </p>
          </div>
        </section>
      )}

      <p className="sr-only" role="status">
        {selectedProducts.length} {selectedProducts.length === 1 ? "produto encontrado" : "produtos encontrados"}.
      </p>
      <section className="online-menu-grid" aria-label="Produtos do cardápio">
        {selectedProducts.map((product, index) => {
          const quantity = cart[product.id]?.quantity ?? 0;
          return (
            <article
              key={product.id}
              className={`online-product ${!product.available ? "is-unavailable" : ""}`}
              style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
              aria-labelledby={`online-product-${product.id}`}
            >
              <div className="online-product-visual">
                {product.imageUrl ? (
                  // A imagem do produto é cadastrada pelo estabelecimento e
                  // pode vir de qualquer domínio HTTPS; não passa por proxy.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.imageUrl} alt="" loading="lazy" />
                ) : (
                  <span>{product.emoji}</span>
                )}
              </div>
              <div className="online-product-copy">
                <h2 id={`online-product-${product.id}`}>{product.name}</h2>
                <p>{product.description}</p>
                <strong>{money(product.priceCents)}</strong>
              </div>
              {product.available ? (
                quantity > 0 ? (
                  <div className="online-product-quantity" aria-label={`Quantidade de ${product.name}`}>
                    <button
                      type="button"
                      onClick={() => changeQuantity(product.id, -1)}
                      aria-label={`Diminuir ${product.name}`}
                    >
                      <Minus size={18} aria-hidden="true" />
                    </button>
                    <b aria-live="polite">{quantity}</b>
                    <button
                      type="button"
                      onClick={() => changeQuantity(product.id, 1)}
                      aria-label={`Aumentar ${product.name}`}
                      disabled={!canSendOrders}
                    >
                      <Plus size={18} aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <button
                    className="online-product-add"
                    type="button"
                    onClick={() => changeQuantity(product.id, 1)}
                    disabled={!canSendOrders}
                    aria-label={`Adicionar ${product.name}`}
                  >
                    <Plus size={20} aria-hidden="true" />
                  </button>
                )
              ) : (
                <span className="online-product-unavailable">Indisponível</span>
              )}
            </article>
          );
        })}
        {selectedProducts.length === 0 && (
          <div className="online-menu-empty">
            <Store size={32} aria-hidden="true" />
            <strong>Nenhum item encontrado</strong>
            <p>Tente outra busca ou categoria.</p>
          </div>
        )}
      </section>

      {itemCount > 0 && (
        <button
          type="button"
          className="online-cart-bar"
          onClick={() => setCheckoutOpen(true)}
          aria-label={`Revisar pedido com ${itemCount} ${itemCount === 1 ? "item" : "itens"}, subtotal ${money(subtotalCents)}`}
        >
          <span><ShoppingBag size={21} aria-hidden="true" /> {itemCount} {itemCount === 1 ? "item" : "itens"}</span>
          <b>Revisar pedido</b>
          <strong>{money(subtotalCents)}</strong>
        </button>
      )}

      {checkoutOpen && (
        <div
          className="online-checkout-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCheckoutOpen(false);
          }}
        >
          <section
            ref={checkoutRef}
            className="online-checkout"
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-title"
            aria-describedby="checkout-description"
            tabIndex={-1}
          >
            <header>
              <button type="button" onClick={() => setCheckoutOpen(false)} aria-label="Voltar ao cardápio">
                <ChevronLeft size={24} aria-hidden="true" />
              </button>
              <div><span>Confira tudo</span><h2 id="checkout-title">Seu pedido</h2></div>
              <button type="button" onClick={() => setCheckoutOpen(false)} aria-label="Fechar">
                <X size={22} aria-hidden="true" />
              </button>
            </header>
            <div className="online-checkout-body">
              <p id="checkout-description" className="sr-only">
                Revise itens, observações, nome e forma de pagamento antes de enviar.
              </p>
              {cartProducts.map((item) => (
                <article className="online-checkout-line" key={item.id}>
                  <div className="online-checkout-line-top">
                    <span>{item.emoji}</span>
                    <div><strong>{item.name}</strong><small>{money(item.priceCents * item.quantity)}</small></div>
                    <div className="online-product-quantity" aria-label={`Quantidade de ${item.name}`}>
                      <button type="button" onClick={() => changeQuantity(item.id, -1)} aria-label={`Diminuir ${item.name}`}>
                        <Minus size={16} aria-hidden="true" />
                      </button>
                      <b aria-live="polite">{item.quantity}</b>
                      <button
                        type="button"
                        onClick={() => changeQuantity(item.id, 1)}
                        aria-label={`Aumentar ${item.name}`}
                        disabled={!canSendOrders}
                      >
                        <Plus size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <input
                    value={item.note}
                    maxLength={300}
                    onChange={(event) =>
                      setCart((current) => ({
                        ...current,
                        [item.id]: { ...current[item.id], note: event.target.value },
                      }))
                    }
                    placeholder="Alguma observação? Ex.: sem cebola"
                    aria-label={`Observação de ${item.name}`}
                  />
                </article>
              ))}

              <label className="online-field">
                <span>Seu primeiro nome {fulfillmentMode === "table" ? "(opcional)" : ""}</span>
                <input
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  maxLength={80}
                  placeholder="Ex.: Maria"
                  required={fulfillmentMode === "pickup"}
                />
              </label>
              <label className="online-field">
                <span>Observação geral (opcional)</span>
                <textarea
                  value={customerNote}
                  onChange={(event) => setCustomerNote(event.target.value)}
                  maxLength={300}
                  rows={2}
                  placeholder="Algo que a equipe precisa saber?"
                />
              </label>

              <fieldset className="online-payment">
                <legend><WalletCards size={19} aria-hidden="true" /> Como pretende pagar?</legend>
                <div>
                  {PAYMENT_METHODS.map((method) => (
                    <button
                      type="button"
                      key={method}
                      className={paymentMethod === method ? "is-active" : ""}
                      aria-pressed={paymentMethod === method}
                      onClick={() => setPaymentMethod(method)}
                    >
                      {method}
                      {method === "Débito" && <small>+3%</small>}
                      {method === "Crédito" && <small>+6%</small>}
                    </button>
                  ))}
                </div>
                <p>O pagamento será feito presencialmente após a confirmação.</p>
              </fieldset>

              <div className="online-order-summary">
                <span>Subtotal <b>{money(subtotalCents)}</b></span>
                {surchargeCents > 0 && <span>Acréscimo do cartão <b>{money(surchargeCents)}</b></span>}
                <strong>Total <b>{money(totalCents)}</b></strong>
              </div>
              {sendError && <p className="online-send-error" role="alert">{sendError}</p>}
              <button
                className="online-menu-primary online-submit-order"
                disabled={
                  sending ||
                  !canSendOrders ||
                  cartProducts.length === 0 ||
                  (fulfillmentMode === "pickup" && !customerName.trim())
                }
                onClick={() => void submitOrder()}
              >
                {sending ? (
                  <RefreshCw className="online-menu-spinner" size={20} aria-hidden="true" />
                ) : (
                  <CheckCircle2 size={21} aria-hidden="true" />
                )}
                {sending ? "Enviando…" : "Enviar pedido"}
              </button>
              <p className="online-submit-help" role="status">
                {!isOnline && !preview
                  ? "Reconecte-se à internet para enviar. Seu carrinho continua aqui."
                  : !menu.store.acceptingOrders && !preview
                    ? "A lanchonete não está recebendo pedidos online agora."
                    : "Seu pedido só será preparado depois que a lanchonete aceitar."}
              </p>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
