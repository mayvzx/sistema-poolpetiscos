import type { OrderStatus, Sale } from "./types";
import { formatDateKey } from "./domain";

export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  "aguardando",
  "em-preparo",
  "pronto",
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  aguardando: "Aguardando",
  "em-preparo": "Em preparo",
  pronto: "Pronto",
  entregue: "Entregue",
};

export function isActiveOrder(sale: Sale) {
  return sale.orderStatus !== "entregue";
}

export function sortOrdersOldestFirst(sales: Sale[]) {
  return [...sales].sort((left, right) => left.timestamp - right.timestamp);
}

export function sortOrdersNewestFirst(sales: Sale[]) {
  return [...sales].sort(
    (left, right) => right.statusUpdatedAt - left.statusUpdatedAt,
  );
}

const COUNTER_ORDER_PATTERN = /^Balcão (\d+)$/;

export function resolveOrderCustomerName(
  customerName: string,
  sales: Sale[],
  timestamp: number,
) {
  const informedName = customerName.trim();
  if (informedName) return informedName;

  const orderDate = formatDateKey(timestamp);
  const usedNumbers = new Set(
    sales
      .filter((sale) => formatDateKey(sale.timestamp) === orderDate)
      .map((sale) => COUNTER_ORDER_PATTERN.exec(sale.customerName)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number),
  );
  let nextNumber = 1;
  while (usedNumbers.has(nextNumber)) nextNumber += 1;
  return `Balcão ${String(nextNumber).padStart(2, "0")}`;
}

export function nextOrderStatus(status: OrderStatus): OrderStatus | null {
  if (status === "aguardando") return "em-preparo";
  if (status === "em-preparo") return "pronto";
  if (status === "pronto") return "entregue";
  return null;
}

export function previousOrderStatus(status: OrderStatus): OrderStatus | null {
  if (status === "em-preparo") return "aguardando";
  if (status === "pronto") return "em-preparo";
  if (status === "entregue") return "pronto";
  return null;
}

export function formatOrderWait(startedAt: number, currentTime: number) {
  const elapsedMinutes = Math.max(
    0,
    Math.floor((currentTime - startedAt) / 60_000),
  );
  if (elapsedMinutes < 1) return "agora";
  if (elapsedMinutes < 60) return `há ${elapsedMinutes} min`;
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  return minutes > 0 ? `há ${hours}h ${minutes}min` : `há ${hours}h`;
}
