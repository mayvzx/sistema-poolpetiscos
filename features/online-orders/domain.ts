export const ONLINE_ORDER_STATUSES = [
  "pending",
  "accepted",
  "preparing",
  "ready",
  "completed",
  "rejected",
  "cancelled",
  "expired",
] as const;

export type OnlineOrderStatus = (typeof ONLINE_ORDER_STATUSES)[number];
export type OnlineFulfillmentMode = "table" | "pickup";
export type OnlinePaymentMethod = "Pix" | "Dinheiro" | "Débito" | "Crédito";

export type PublicOrderItemInput = {
  productId: string;
  quantity: number;
  note: string;
};

export type PublicOrderInput = {
  fulfillmentMode: OnlineFulfillmentMode;
  tableToken?: string;
  customerName: string;
  customerNote: string;
  paymentMethod: OnlinePaymentMethod;
  catalogVersion: number;
  deviceToken: string;
  formStartedAt: number;
  website?: string;
  items: PublicOrderItemInput[];
};

export type CatalogPrice = {
  productId: string;
  priceCents: number;
  available: boolean;
};

export type PricedOnlineOrder = {
  subtotalCents: number;
  surchargeRate: number;
  surchargeCents: number;
  totalCents: number;
};

export type OnlineOrderAction =
  | "accept"
  | "reject"
  | "start"
  | "ready"
  | "complete"
  | "cancel";

const PAYMENT_METHODS = new Set<OnlinePaymentMethod>([
  "Pix",
  "Dinheiro",
  "Débito",
  "Crédito",
]);

const ACTION_TRANSITIONS: Record<
  OnlineOrderAction,
  { from: readonly OnlineOrderStatus[]; to: OnlineOrderStatus }
> = {
  accept: { from: ["pending"], to: "accepted" },
  reject: { from: ["pending"], to: "rejected" },
  start: { from: ["accepted"], to: "preparing" },
  ready: { from: ["preparing"], to: "ready" },
  complete: { from: ["ready"], to: "completed" },
  cancel: { from: ["accepted", "preparing", "ready"], to: "cancelled" },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned.length <= maximum ? cleaned : null;
}

export function parsePublicOrderInput(
  value: unknown,
  now = Date.now(),
): { ok: true; value: PublicOrderInput } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: "Pedido inválido." };

  const fulfillmentMode = value.fulfillmentMode;
  if (fulfillmentMode !== "table" && fulfillmentMode !== "pickup") {
    return { ok: false, error: "Escolha mesa ou retirada no balcão." };
  }
  const customerName = cleanString(value.customerName, 80);
  const customerNote = cleanString(value.customerNote ?? "", 300);
  const tableToken = cleanString(value.tableToken ?? "", 160);
  const deviceToken = cleanString(value.deviceToken, 160);
  const website = cleanString(value.website ?? "", 120);
  if (
    customerName === null ||
    customerNote === null ||
    tableToken === null ||
    deviceToken === null ||
    website === null
  ) {
    return { ok: false, error: "Há campos maiores do que o permitido." };
  }
  if (website) {
    return { ok: false, error: "Não foi possível validar o envio." };
  }
  if (fulfillmentMode === "pickup" && !customerName) {
    return { ok: false, error: "Informe um nome para a retirada." };
  }
  if (fulfillmentMode === "table" && !tableToken) {
    return { ok: false, error: "Este QR Code de mesa não é válido." };
  }
  if (!deviceToken || deviceToken.length < 16) {
    return { ok: false, error: "Atualize a página e tente novamente." };
  }
  if (
    typeof value.formStartedAt !== "number" ||
    !Number.isFinite(value.formStartedAt) ||
    value.formStartedAt > now ||
    now - value.formStartedAt < 1_200 ||
    now - value.formStartedAt > 24 * 60 * 60 * 1_000
  ) {
    return { ok: false, error: "Aguarde um instante e tente novamente." };
  }
  if (
    typeof value.catalogVersion !== "number" ||
    !Number.isInteger(value.catalogVersion) ||
    value.catalogVersion < 0
  ) {
    return { ok: false, error: "O cardápio foi atualizado. Recarregue a página." };
  }
  if (
    typeof value.paymentMethod !== "string" ||
    !PAYMENT_METHODS.has(value.paymentMethod as OnlinePaymentMethod)
  ) {
    return { ok: false, error: "Escolha uma forma de pagamento." };
  }
  if (!Array.isArray(value.items) || value.items.length === 0) {
    return { ok: false, error: "Seu carrinho está vazio." };
  }
  if (value.items.length > 50) {
    return { ok: false, error: "O pedido tem itens demais." };
  }

  const items: PublicOrderItemInput[] = [];
  const seen = new Set<string>();
  for (const candidate of value.items) {
    if (!isRecord(candidate)) return { ok: false, error: "Item inválido." };
    const productId = cleanString(candidate.productId, 120);
    const note = cleanString(candidate.note ?? "", 300);
    const quantity = candidate.quantity;
    if (
      !productId ||
      note === null ||
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 20
    ) {
      return { ok: false, error: "Confira as quantidades do pedido." };
    }
    if (seen.has(productId)) {
      return { ok: false, error: "Há itens repetidos no carrinho." };
    }
    seen.add(productId);
    items.push({ productId, quantity, note });
  }

  return {
    ok: true,
    value: {
      fulfillmentMode,
      ...(tableToken ? { tableToken } : {}),
      customerName: customerName || "Cliente da mesa",
      customerNote,
      paymentMethod: value.paymentMethod as OnlinePaymentMethod,
      catalogVersion: value.catalogVersion,
      deviceToken,
      formStartedAt: value.formStartedAt,
      website,
      items,
    },
  };
}

export function priceOnlineOrder(
  items: PublicOrderItemInput[],
  catalog: ReadonlyMap<string, CatalogPrice>,
  paymentMethod: OnlinePaymentMethod,
): PricedOnlineOrder | null {
  let subtotalCents = 0;
  for (const item of items) {
    const product = catalog.get(item.productId);
    if (!product?.available) return null;
    subtotalCents += product.priceCents * item.quantity;
  }
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0) return null;
  const surchargeRate =
    paymentMethod === "Débito" ? 0.03 : paymentMethod === "Crédito" ? 0.06 : 0;
  const surchargeCents = Math.round(subtotalCents * surchargeRate);
  return {
    subtotalCents,
    surchargeRate,
    surchargeCents,
    totalCents: subtotalCents + surchargeCents,
  };
}

export function transitionForAction(
  status: OnlineOrderStatus,
  action: OnlineOrderAction,
): OnlineOrderStatus | null {
  const transition = ACTION_TRANSITIONS[action];
  return transition.from.includes(status) ? transition.to : null;
}

export function statusLabel(status: OnlineOrderStatus): string {
  return {
    pending: "Aguardando confirmação",
    accepted: "Pedido aceito",
    preparing: "Em preparo",
    ready: "Pronto",
    completed: "Entregue",
    rejected: "Não confirmado",
    cancelled: "Cancelado",
    expired: "Não confirmado",
  }[status];
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
