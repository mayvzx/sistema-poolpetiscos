import type { PaymentMethod } from "./types";

const LOCAL_SERVICE_URL = "http://127.0.0.1:18765";

export type OnlineOrderStatus =
  | "pending"
  | "accepted"
  | "preparing"
  | "ready"
  | "completed"
  | "rejected"
  | "cancelled"
  | "expired";

export type OnlineOrderItem = {
  id: string;
  productId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  note: string | null;
  lineTotalCents: number;
};

export type OnlineOrder = {
  id: string;
  number: number;
  status: OnlineOrderStatus;
  version: number;
  fulfillmentMode: "table" | "pickup";
  tableLabel: string | null;
  customerName: string;
  customerNote: string | null;
  paymentMethod: PaymentMethod;
  subtotalCents: number;
  surchargeRate: number;
  surchargeCents: number;
  totalCents: number;
  localSaleId: string | null;
  rejectionReason: string | null;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  items: OnlineOrderItem[];
  syncPending?: boolean;
};

export type OnlineOrdersStatus = {
  configured: boolean;
  enabled: boolean;
  connected: boolean;
  acceptingOrders: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  publicMenuUrl: string | null;
  pendingCount: number;
};

export type OnlineOrdersSnapshot = {
  orders: OnlineOrder[];
  status: OnlineOrdersStatus;
};

export type OnlineOrderAction =
  | "accept"
  | "reject"
  | "start"
  | "ready"
  | "complete"
  | "cancel";

type OnlineOrderActionInput = {
  orderId: string;
  expectedVersion: number;
  action: OnlineOrderAction;
  localMutationId: string;
  reason?: string;
  localSaleId?: string;
  paymentMethod?: PaymentMethod;
};

function readError(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string" &&
    payload.error.trim()
  ) {
    return payload.error.trim();
  }
  return fallback;
}

async function localOnlineRequest<T>(
  path: string,
  options?: RequestInit,
  timeoutMs = 12_000,
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
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      throw new Error("O serviço de pedidos retornou uma resposta inválida.");
    }
    if (!response.ok) {
      throw new Error(
        readError(payload, "Não foi possível sincronizar os pedidos online."),
      );
    }
    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("A sincronização demorou mais do que o esperado.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function loadOnlineOrders() {
  return localOnlineRequest<OnlineOrdersSnapshot>("/api/online-orders");
}

export function syncOnlineOrdersNow() {
  return localOnlineRequest<OnlineOrdersSnapshot>(
    "/api/online-orders/sync",
    { method: "POST", body: JSON.stringify({}) },
    30_000,
  );
}

export function applyOnlineOrderAction(input: OnlineOrderActionInput) {
  return localOnlineRequest<{ order: OnlineOrder; queued?: boolean }>(
    "/api/online-orders/actions",
    { method: "POST", body: JSON.stringify(input) },
    20_000,
  );
}

export function configureOnlineOrders(input: {
  apiBaseUrl: string;
  installationToken: string;
  publicMenuUrl: string;
  enabled: boolean;
}) {
  return localOnlineRequest<OnlineOrdersStatus>(
    "/api/online-orders/configure",
    { method: "POST", body: JSON.stringify(input) },
    30_000,
  );
}

export function setOnlineOrdersEnabled(enabled: boolean) {
  return localOnlineRequest<OnlineOrdersStatus>(
    "/api/online-orders/enabled",
    { method: "POST", body: JSON.stringify({ enabled }) },
  );
}

export function createOnlineMutationId() {
  return `local_${crypto.randomUUID().replaceAll("-", "")}`;
}
