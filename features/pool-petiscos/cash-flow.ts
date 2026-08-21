import { formatDateKey, RECIFE_TIME_ZONE, roundMoney } from "./domain";
import type { CashMovement, Expense, Sale } from "./types";

export type CashFlowMovement = "Entrada" | "Saída";
export type CashFlowPeriodMode = "today" | "month" | "custom";

export type CashFlowEntry = {
  id: string;
  timestamp: number;
  movement: CashFlowMovement;
  description: string;
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
    ...sales.map<CashFlowEntry>((sale) => ({
      id: sale.id,
      timestamp: sale.timestamp,
      movement: "Entrada",
      description: sale.customerName
        ? `Venda - ${sale.customerName}`
        : `Venda ${sale.id}`,
      amount: roundMoney(sale.total),
      observation: `${sale.payment} • ${sale.operatorName}`,
      source: "sale",
    })),
    ...expenses.map<CashFlowEntry>((expense) => ({
      id: expense.id,
      timestamp: expense.timestamp,
      movement: "Saída",
      description: expense.description,
      amount: roundMoney(expense.amount),
      observation: `${expense.category} • ${expense.payment}`,
      source: "expense",
    })),
    ...cashMovements.map<CashFlowEntry>((movement) => ({
      id: movement.id,
      timestamp: movement.timestamp,
      movement: movement.kind === "suprimento" ? "Entrada" : "Saída",
      description: movement.description,
      amount: roundMoney(movement.amount),
      observation:
        movement.kind === "suprimento"
          ? "Suprimento de caixa • Dinheiro"
          : "Sangria de caixa • Dinheiro",
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
