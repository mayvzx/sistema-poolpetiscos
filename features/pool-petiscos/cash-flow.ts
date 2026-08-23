import {
  currency,
  formatDateKey,
  RECIFE_TIME_ZONE,
  roundMoney,
} from "./domain";
import {
  formatSurchargePercent,
  salePricing,
} from "./payment-surcharge";
import type { CashMovement, Expense, Sale } from "./types";

export type CashFlowMovement = "Entrada" | "Saída";
export type CashFlowPeriodMode = "today" | "week" | "month" | "custom";

export type CashFlowEntry = {
  id: string;
  timestamp: number;
  movement: CashFlowMovement;
  description: string;
  details: string;
  payment: string;
  amount: number;
  observation: string;
  source: "sale" | "expense" | "cash-movement";
};

export type CashFlowRange = {
  fromKey: string;
  toKey: string;
  label: string;
  slug: string;
};

export type CashFlowReport = {
  range: CashFlowRange;
  entries: CashFlowEntry[];
  incoming: number;
  outgoing: number;
  balance: number;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function dateFromKey(key: string) {
  if (!ISO_DATE_PATTERN.test(key)) return null;
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function shiftDateKey(key: string, days: number) {
  const date = dateFromKey(key);
  if (!date) return key;
  date.setUTCDate(date.getUTCDate() + days);
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function formatSaleItems(sale: Sale) {
  if (!sale.items.length) return "Itens não informados";
  return sale.items
    .map((item) => {
      const observation = item.observation?.trim();
      return `${item.quantity}x ${item.name}${
        observation ? ` (${observation})` : ""
      }`;
    })
    .join("; ");
}

function salePaymentDescription(sale: Sale) {
  const pricing = salePricing(sale);
  return pricing.surchargeRate > 0
    ? `${sale.payment} (+${formatSurchargePercent(pricing.surchargeRate)})`
    : sale.payment;
}

export function formatReportDateKey(key: string) {
  const date = dateFromKey(key);
  if (!date) return key;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatCashFlowDate(timestamp: number) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: RECIFE_TIME_ZONE,
  }).format(new Date(timestamp));
}

export function formatCashFlowDateTime(timestamp: number) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: RECIFE_TIME_ZONE,
  }).format(new Date(timestamp));
}

export function buildCashFlowEntries({
  sales,
  expenses,
  cashMovements,
}: {
  sales: Sale[];
  expenses: Expense[];
  cashMovements: CashMovement[];
}) {
  return [
    ...sales.map<CashFlowEntry>((sale) => {
      const pricing = salePricing(sale);
      return {
        id: sale.id,
        timestamp: sale.timestamp,
        movement: "Entrada",
        description: sale.customerName
          ? `Venda - ${sale.customerName}`
          : `Venda ${sale.id}`,
        details: formatSaleItems(sale),
        payment: salePaymentDescription(sale),
        amount: roundMoney(sale.total),
        observation:
          pricing.surchargeAmount > 0
            ? `${sale.operatorName} • Acréscimo ${currency.format(
                pricing.surchargeAmount,
              )}`
            : sale.operatorName,
        source: "sale",
      };
    }),
    ...expenses.map<CashFlowEntry>((expense) => ({
      id: expense.id,
      timestamp: expense.timestamp,
      movement: "Saída",
      description: expense.description,
      details: expense.category,
      payment: expense.payment,
      amount: roundMoney(expense.amount),
      observation: "Despesa registrada",
      source: "expense",
    })),
    ...cashMovements.map<CashFlowEntry>((movement) => ({
      id: movement.id,
      timestamp: movement.timestamp,
      movement: movement.kind === "suprimento" ? "Entrada" : "Saída",
      description: movement.description,
      details:
        movement.kind === "suprimento"
          ? "Suprimento de caixa"
          : "Sangria de caixa",
      payment: "Dinheiro",
      amount: roundMoney(movement.amount),
      observation: "Movimento de caixa",
      source: "cash-movement",
    })),
  ].sort((left, right) =>
    left.timestamp === right.timestamp
      ? left.id.localeCompare(right.id)
      : left.timestamp - right.timestamp,
  );
}

export function createCashFlowRange(
  mode: CashFlowPeriodMode,
  now = Date.now(),
  customFrom = "",
  customTo = "",
): CashFlowRange {
  const todayKey = formatDateKey(now);
  let fromKey = mode === "month" ? `${todayKey.slice(0, 7)}-01` : todayKey;
  let toKey = todayKey;

  if (mode === "week") {
    const today = dateFromKey(todayKey);
    const daysSinceMonday = today ? (today.getUTCDay() + 6) % 7 : 0;
    fromKey = shiftDateKey(todayKey, -daysSinceMonday);
  }

  if (mode === "custom") {
    if (!dateFromKey(customFrom) || !dateFromKey(customTo)) {
      throw new Error("Escolha as datas inicial e final do relatório.");
    }
    if (customFrom > customTo) {
      throw new Error("A data inicial não pode ser depois da data final.");
    }
    fromKey = customFrom;
    toKey = customTo;
  }

  const label =
    fromKey === toKey
      ? formatReportDateKey(fromKey)
      : `${formatReportDateKey(fromKey)} a ${formatReportDateKey(toKey)}`;
  return {
    fromKey,
    toKey,
    label,
    slug: fromKey === toKey ? fromKey : `${fromKey}-a-${toKey}`,
  };
}

export function buildCashFlowReport(
  entries: CashFlowEntry[],
  range: CashFlowRange,
): CashFlowReport {
  const filtered = entries.filter((entry) => {
    const key = formatDateKey(entry.timestamp);
    return key >= range.fromKey && key <= range.toKey;
  });
  const incoming = roundMoney(
    filtered
      .filter((entry) => entry.movement === "Entrada")
      .reduce((total, entry) => total + entry.amount, 0),
  );
  const outgoing = roundMoney(
    filtered
      .filter((entry) => entry.movement === "Saída")
      .reduce((total, entry) => total + entry.amount, 0),
  );
  return {
    range,
    entries: filtered,
    incoming,
    outgoing,
    balance: roundMoney(incoming - outgoing),
  };
}

export function cashFlowReportHeading(report: CashFlowReport) {
  const monthPrefix = report.range.fromKey.slice(0, 7);
  const sameMonth = report.range.toKey.startsWith(monthPrefix);
  const startsOnFirstDay = report.range.fromKey.endsWith("-01");
  if (sameMonth && startsOnFirstDay) {
    const month = new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(dateFromKey(report.range.fromKey) ?? new Date());
    return `FLUXO DE CAIXA - ${month.toLocaleUpperCase("pt-BR")}`;
  }
  return `FLUXO DE CAIXA - ${report.range.label}`;
}
