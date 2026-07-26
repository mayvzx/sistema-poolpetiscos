import type {
  CashClosure,
  CashMovement,
  Expense,
  PaymentMethod,
  PersistedPoolState,
  PoolBackup,
  Product,
  ProductCategory,
  Sale,
  SaleItem,
} from "./types";
import { roundMoney } from "./domain";

export const STORAGE_KEY = "pool-caixa-prototype-v3-requisitos-confirmados";
export const BACKUP_VERSION = 1;

const PAYMENT_METHODS = new Set<PaymentMethod>(["Pix", "Dinheiro", "Cartão"]);
const PRODUCT_CATEGORIES = new Set<ProductCategory>([
  "Hambúrgueres",
  "Salgados",
  "Petiscos",
  "Sobremesas",
  "Bebidas",
  "Adicionais",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeMoney(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isTimestamp(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && PAYMENT_METHODS.has(value as PaymentMethod);
}

function parseProduct(value: unknown): Product | null {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.name) ||
    typeof value.category !== "string" ||
    !PRODUCT_CATEGORIES.has(value.category as ProductCategory) ||
    !isNonNegativeMoney(value.price) ||
    typeof value.stock !== "number" ||
    !Number.isInteger(value.stock) ||
    value.stock < 0 ||
    typeof value.minimum !== "number" ||
    !Number.isInteger(value.minimum) ||
    value.minimum < 0 ||
    typeof value.emoji !== "string"
  ) {
    return null;
  }
  return value as Product;
}

function parseSaleItem(value: unknown): SaleItem | null {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.productId) ||
    !isNonEmptyString(value.name) ||
    !isNonNegativeMoney(value.price) ||
    typeof value.quantity !== "number" ||
    !Number.isInteger(value.quantity) ||
    value.quantity <= 0
  ) {
    return null;
  }
  return value as SaleItem;
}

function parseSale(value: unknown): Sale | null {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isTimestamp(value.timestamp) ||
    !isNonNegativeMoney(value.total) ||
    !isPaymentMethod(value.payment) ||
    !Array.isArray(value.items) ||
    value.items.length === 0
  ) {
    return null;
  }
  const items = value.items.map(parseSaleItem);
  if (items.some((item) => item === null)) return null;
  const itemTotal = roundMoney(
    (items as SaleItem[]).reduce(
      (total, item) => total + item.price * item.quantity,
      0,
    ),
  );
  if (Math.abs(itemTotal - roundMoney(value.total)) > 0.005) return null;
  return { ...(value as Sale), total: itemTotal, items: items as SaleItem[] };
}

function parseExpense(value: unknown): Expense | null {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isTimestamp(value.timestamp) ||
    !isNonEmptyString(value.description) ||
    !isNonEmptyString(value.category) ||
    !isNonNegativeMoney(value.amount)
  ) {
    return null;
  }
  const payment = value.payment ?? "Dinheiro";
  if (!isPaymentMethod(payment)) return null;
  return { ...(value as Omit<Expense, "payment">), payment };
}

function parseCashMovement(value: unknown): CashMovement | null {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isTimestamp(value.timestamp) ||
    !isNonEmptyString(value.description) ||
    !isNonNegativeMoney(value.amount) ||
    (value.kind !== "suprimento" && value.kind !== "sangria")
  ) {
    return null;
  }
  return value as CashMovement;
}

function parseCashClosure(value: unknown): CashClosure | null {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isTimestamp(value.openedAt) ||
    !isTimestamp(value.closedAt) ||
    value.closedAt < value.openedAt ||
    !isNonNegativeMoney(value.openingBalance) ||
    !isFiniteNumber(value.expectedBalance) ||
    !isNonNegativeMoney(value.countedBalance) ||
    !isFiniteNumber(value.difference)
  ) {
    return null;
  }
  const difference = roundMoney(value.countedBalance - value.expectedBalance);
  if (Math.abs(difference - roundMoney(value.difference)) > 0.005) return null;
  return { ...(value as CashClosure), difference };
}

function parseList<T>(
  value: unknown,
  parser: (item: unknown) => T | null,
): T[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map(parser);
  return parsed.some((item) => item === null) ? null : (parsed as T[]);
}

export function parsePoolState(value: unknown): PersistedPoolState | null {
  if (!isRecord(value)) return null;
  const products = parseList(value.products, parseProduct);
  const sales = parseList(value.sales, parseSale);
  const expenses = parseList(value.expenses, parseExpense);
  const cashMovements = parseList(value.cashMovements, parseCashMovement);
  const cashClosures = parseList(value.cashClosures, parseCashClosure);
  if (
    !products?.length ||
    sales === null ||
    expenses === null ||
    typeof value.cashOpen !== "boolean" ||
    !isNonNegativeMoney(value.openingBalance) ||
    !isTimestamp(value.cashOpenedAt) ||
    cashMovements === null ||
    cashClosures === null
  ) {
    return null;
  }
  if (new Set(products.map((product) => product.id)).size !== products.length) {
    return null;
  }
  return {
    products,
    sales,
    expenses,
    cashOpen: value.cashOpen,
    openingBalance: roundMoney(value.openingBalance),
    cashOpenedAt: value.cashOpenedAt,
    cashMovements,
    cashClosures,
  };
}

export function parseStoredState(serialized: string | null) {
  if (!serialized) return null;
  try {
    return parsePoolState(JSON.parse(serialized));
  } catch {
    return null;
  }
}

export function createBackup(data: PersistedPoolState): PoolBackup {
  return {
    app: "Pool Petiscos & Lanches",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function parseBackup(serialized: string): PersistedPoolState | null {
  try {
    const value: unknown = JSON.parse(serialized);
    if (
      !isRecord(value) ||
      value.app !== "Pool Petiscos & Lanches" ||
      value.version !== BACKUP_VERSION ||
      typeof value.exportedAt !== "string"
    ) {
      return null;
    }
    return parsePoolState(value.data);
  } catch {
    return null;
  }
}
