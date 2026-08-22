import type { Product, Sale } from "./types";

export const RECIFE_TIME_ZONE = "America/Recife";
export const BUSINESS_HOURS = "Qui, Sex, Sáb e Dom • 16h–23h";
export const DEFAULT_CASH_FUND = 130;

const BUSINESS_DAYS = new Set(["Sun", "Thu", "Fri", "Sat"]);
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export const shortCurrency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export function formatDateKey(timestamp: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: RECIFE_TIME_ZONE,
  }).format(new Date(timestamp));
}

export function isToday(timestamp: number, now = Date.now()) {
  return formatDateKey(timestamp) === formatDateKey(now);
}

export function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: RECIFE_TIME_ZONE,
  }).format(new Date(timestamp));
}

export function getGreeting(hour: number) {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function getRecifeClock(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RECIFE_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: value("weekday"),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}

export function getBusinessStatus(date: Date | null) {
  if (!date) {
    return {
      label: "Consultando horário",
      helper: BUSINESS_HOURS,
      open: false,
    };
  }
  const { weekday, hour, minute } = getRecifeClock(date);
  if (!BUSINESS_DAYS.has(weekday)) {
    return {
      label: "Hoje não há atendimento",
      helper: BUSINESS_HOURS,
      open: false,
    };
  }
  const currentMinutes = hour * 60 + minute;
  if (currentMinutes < 16 * 60) {
    return {
      label: "Abre hoje às 16h",
      helper: "Atendimento até 23h",
      open: false,
    };
  }
  if (currentMinutes < 23 * 60) {
    return {
      label: "Aberto agora",
      helper: "Atendimento até 23h",
      open: true,
    };
  }
  return {
    label: "Encerrado por hoje",
    helper: BUSINESS_HOURS,
    open: false,
  };
}

export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Converte valores digitados nos formatos brasileiros e mais comuns:
 * 1.234,56, 1234,56, 1,234.56 e 1234.56.
 * Entradas ambíguas com três casas são tratadas como separador de milhar.
 */
export function parseAmount(value: string) {
  let input = value
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/\s/g, "");

  if (!input || !/^[+-]?[\d.,]+$/.test(input)) return Number.NaN;

  const sign = input.startsWith("-") ? -1 : 1;
  input = input.replace(/^[+-]/, "");
  if (!input || !/\d/.test(input)) return Number.NaN;

  const lastComma = input.lastIndexOf(",");
  const lastDot = input.lastIndexOf(".");
  let normalized = input;

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    normalized = input.split(thousandsSeparator).join("");
    if (decimalSeparator === ",") normalized = normalized.replace(",", ".");
  } else {
    const separator = lastComma >= 0 ? "," : lastDot >= 0 ? "." : null;
    if (separator) {
      const pieces = input.split(separator);
      if (pieces.some((piece) => piece === "")) return Number.NaN;
      const lastPiece = pieces.at(-1) ?? "";
      const looksLikeThousands =
        lastPiece.length === 3 &&
        pieces.slice(1).every((piece) => piece.length === 3);
      if (pieces.length > 2 || looksLikeThousands) {
        if (!pieces.slice(1).every((piece) => piece.length === 3)) {
          return Number.NaN;
        }
        normalized = pieces.join("");
      } else {
        if (lastPiece.length > 2) return Number.NaN;
        normalized = `${pieces[0]}.${lastPiece}`;
      }
    }
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return Number.NaN;
  const amount = Number(normalized) * sign;
  return Number.isFinite(amount) ? roundMoney(amount) : Number.NaN;
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function createRecordId(prefix: "PV" | "DS" | "MC" | "FC" | "CX") {
  const time = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${time}-${random}`;
}

export function calculateCashBalance({
  openingBalance,
  cashSalesTotal,
  cashExpenseTotal,
  cashMovementTotal,
}: {
  openingBalance: number;
  cashSalesTotal: number;
  cashExpenseTotal: number;
  cashMovementTotal: number;
}) {
  return roundMoney(
    openingBalance + cashSalesTotal - cashExpenseTotal + cashMovementTotal,
  );
}

export function calculateCashClosing({
  expectedBalance,
  countedBalance,
  cashFund,
}: {
  expectedBalance: number;
  countedBalance: number;
  cashFund: number;
}) {
  const normalizedExpected = roundMoney(expectedBalance);
  const normalizedCounted = roundMoney(Math.max(0, countedBalance));
  const normalizedFund = roundMoney(Math.max(0, cashFund));
  const withdrawalAmount = roundMoney(
    Math.max(0, normalizedCounted - normalizedFund),
  );
  const remainingBalance = roundMoney(
    normalizedCounted - withdrawalAmount,
  );

  return {
    difference: roundMoney(normalizedCounted - normalizedExpected),
    cashFund: normalizedFund,
    withdrawalAmount,
    remainingBalance,
    fundShortfall: roundMoney(
      Math.max(0, normalizedFund - remainingBalance),
    ),
  };
}

export function isLowStock(
  product: Pick<Product, "stock" | "minimum">,
) {
  return product.minimum > 0 && product.stock <= product.minimum;
}

export type DailyRevenue = {
  key: string;
  label: string;
  total: number;
};

export function buildDailyRevenue(
  sales: Sale[],
  now = Date.now(),
  numberOfDays = 5,
): DailyRevenue[] {
  const totals = new Map<string, number>();
  sales.forEach((sale) => {
    const key = formatDateKey(sale.timestamp);
    totals.set(key, roundMoney((totals.get(key) ?? 0) + sale.total));
  });

  return Array.from({ length: numberOfDays }, (_, index) => {
    const daysAgo = numberOfDays - index - 1;
    const timestamp = now - daysAgo * DAY_IN_MS;
    const key = formatDateKey(timestamp);
    const label =
      daysAgo === 0
        ? "Hoje"
        : new Intl.DateTimeFormat("pt-BR", {
            weekday: "short",
            timeZone: RECIFE_TIME_ZONE,
          })
            .format(new Date(timestamp))
            .replace(".", "");
    return { key, label, total: totals.get(key) ?? 0 };
  });
}
