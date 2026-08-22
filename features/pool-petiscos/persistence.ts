import type {
  ActiveCashSession,
  CashClosure,
  CashMovement,
  Expense,
  OrderStatus,
  PaymentMethod,
  OperatorCredential,
  OperatorCredentials,
  PersistedPoolState,
  PoolBackup,
  Product,
  ProductCategory,
  Sale,
  SaleItem,
  SaleOperatorId,
} from "./types";
import { DEFAULT_CASH_FUND, roundMoney } from "./domain";
import { operatorNameForSale } from "./operators";

export const STORAGE_KEY = "pool-petiscos-state-v1.5.2";
export const BACKUP_VERSION = 1;

const PAYMENT_METHODS = new Set<PaymentMethod>([
  "Pix",
  "Dinheiro",
  "Débito",
  "Crédito",
  "Cartão",
]);
const ORDER_STATUSES = new Set<OrderStatus>([
  "aguardando",
  "em-preparo",
  "pronto",
  "entregue",
]);
const SALE_OPERATOR_IDS = new Set<SaleOperatorId>([
  "elaine",
  "poolblay",
  "nao-identificado",
]);
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
  const observationValue = value.observation;
  if (
    observationValue !== undefined &&
    (typeof observationValue !== "string" || observationValue.length > 180)
  ) {
    return null;
  }
  const observation =
    typeof observationValue === "string" ? observationValue.trim() : "";
  return {
    productId: value.productId.trim(),
    name: value.name.trim(),
    price: value.price,
    quantity: value.quantity,
    ...(observation ? { observation } : {}),
  };
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
  const customerName = isNonEmptyString(value.customerName)
    ? value.customerName.trim()
    : "Cliente sem nome";
  const orderStatus =
    typeof value.orderStatus === "string" &&
    ORDER_STATUSES.has(value.orderStatus as OrderStatus)
      ? (value.orderStatus as OrderStatus)
      : "entregue";
  const statusUpdatedAt =
    value.statusUpdatedAt === undefined
      ? value.timestamp
      : isTimestamp(value.statusUpdatedAt) &&
          value.statusUpdatedAt >= value.timestamp
        ? value.statusUpdatedAt
        : null;
  if (statusUpdatedAt === null) return null;
  const operatorId =
    typeof value.operatorId === "string" &&
    SALE_OPERATOR_IDS.has(value.operatorId as SaleOperatorId)
      ? (value.operatorId as SaleOperatorId)
      : "nao-identificado";
  const operatorName = operatorNameForSale(operatorId);
  const cashSessionId = isNonEmptyString(value.cashSessionId)
    ? value.cashSessionId.trim()
    : undefined;
  return {
    ...(value as Sale),
    total: itemTotal,
    items: items as SaleItem[],
    customerName,
    orderStatus,
    statusUpdatedAt,
    operatorId,
    operatorName,
    ...(cashSessionId ? { cashSessionId } : {}),
  };
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
  const cashSessionId = isNonEmptyString(value.cashSessionId)
    ? value.cashSessionId.trim()
    : undefined;
  return {
    ...(value as Omit<Expense, "payment">),
    payment,
    ...(cashSessionId ? { cashSessionId } : {}),
  };
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
  const cashSessionId = isNonEmptyString(value.cashSessionId)
    ? value.cashSessionId.trim()
    : undefined;
  return {
    ...(value as CashMovement),
    ...(cashSessionId ? { cashSessionId } : {}),
  };
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
  const hasNewClosingFields = [
    value.cashFund,
    value.withdrawalAmount,
    value.remainingBalance,
  ].some((field) => field !== undefined);
  if (
    hasNewClosingFields &&
    (!isNonNegativeMoney(value.cashFund) ||
      !isNonNegativeMoney(value.withdrawalAmount) ||
      !isNonNegativeMoney(value.remainingBalance) ||
      value.remainingBalance > value.cashFund + 0.005 ||
      Math.abs(
        value.countedBalance -
          value.withdrawalAmount -
          value.remainingBalance,
      ) > 0.005)
  ) {
    return null;
  }
  const sessionId = isNonEmptyString(value.sessionId)
    ? value.sessionId.trim()
    : `SESSAO-${value.id.trim()}`;
  const openedByOperatorId = parseSaleOperatorId(value.openedByOperatorId);
  const closedByOperatorId = parseSaleOperatorId(value.closedByOperatorId);
  return {
    ...(value as CashClosure),
    sessionId,
    openedByOperatorId,
    openedByOperatorName: isNonEmptyString(value.openedByOperatorName)
      ? value.openedByOperatorName.trim()
      : operatorNameForSale(openedByOperatorId),
    closedByOperatorId,
    closedByOperatorName: isNonEmptyString(value.closedByOperatorName)
      ? value.closedByOperatorName.trim()
      : operatorNameForSale(closedByOperatorId),
    difference,
    cashFund: hasNewClosingFields
      ? roundMoney(value.cashFund as number)
      : roundMoney(value.countedBalance),
    withdrawalAmount: hasNewClosingFields
      ? roundMoney(value.withdrawalAmount as number)
      : 0,
    remainingBalance: hasNewClosingFields
      ? roundMoney(value.remainingBalance as number)
      : roundMoney(value.countedBalance),
  };
}

function parseSaleOperatorId(value: unknown): SaleOperatorId {
  return typeof value === "string" &&
    SALE_OPERATOR_IDS.has(value as SaleOperatorId)
    ? (value as SaleOperatorId)
    : "nao-identificado";
}

function parseActiveCashSession(
  value: unknown,
  fallback: {
    cashOpen: boolean;
    openedAt: number;
    openingBalance: number;
  },
): ActiveCashSession | null {
  if (!fallback.cashOpen) return null;
  if (value === undefined || value === null) {
    return {
      id: `SESSAO-ABERTA-${Math.trunc(fallback.openedAt)}`,
      openedAt: fallback.openedAt,
      openingBalance: roundMoney(fallback.openingBalance),
      openedByOperatorId: "nao-identificado",
      openedByOperatorName: operatorNameForSale("nao-identificado"),
    };
  }
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isTimestamp(value.openedAt) ||
    !isNonNegativeMoney(value.openingBalance)
  ) {
    return null;
  }
  const openedByOperatorId = parseSaleOperatorId(value.openedByOperatorId);
  return {
    id: value.id.trim(),
    openedAt: value.openedAt,
    openingBalance: roundMoney(value.openingBalance),
    openedByOperatorId,
    openedByOperatorName: isNonEmptyString(value.openedByOperatorName)
      ? value.openedByOperatorName.trim()
      : operatorNameForSale(openedByOperatorId),
  };
}

function linkLegacyCashSession<T extends { timestamp: number; cashSessionId?: string }>(
  item: T,
  cashClosures: CashClosure[],
  activeCashSession: ActiveCashSession | null,
): T {
  if (item.cashSessionId) return item;
  const closure = cashClosures
    .filter(
      (candidate) =>
        item.timestamp >= candidate.openedAt &&
        item.timestamp <= candidate.closedAt,
    )
    .sort((left, right) => right.openedAt - left.openedAt)[0];
  if (closure) return { ...item, cashSessionId: closure.sessionId };
  if (activeCashSession && item.timestamp >= activeCashSession.openedAt) {
    return { ...item, cashSessionId: activeCashSession.id };
  }
  return item;
}

function isBase64(value: unknown, minimumBytes: number) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return false;
  }
  try {
    return atob(value).length >= minimumBytes;
  } catch {
    return false;
  }
}

function parseOperatorCredential(value: unknown): OperatorCredential | null {
  if (
    !isRecord(value) ||
    value.algorithm !== "PBKDF2-SHA-256" ||
    typeof value.iterations !== "number" ||
    !Number.isInteger(value.iterations) ||
    value.iterations < 100_000 ||
    value.iterations > 1_000_000 ||
    !isBase64(value.salt, 16) ||
    !isBase64(value.hash, 32) ||
    !isTimestamp(value.updatedAt)
  ) {
    return null;
  }
  return value as OperatorCredential;
}

function parseOperatorCredentials(value: unknown): OperatorCredentials | null {
  if (value === undefined) return {};
  if (!isRecord(value)) return null;
  const allowed = new Set(["elaine", "poolblay"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return null;
  const credentials: OperatorCredentials = {};
  for (const operatorId of allowed) {
    if (value[operatorId] === undefined) continue;
    const credential = parseOperatorCredential(value[operatorId]);
    if (!credential) return null;
    credentials[operatorId as keyof OperatorCredentials] = credential;
  }
  return credentials;
}

function parseList<T>(
  value: unknown,
  parser: (item: unknown) => T | null,
): T[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map(parser);
  return parsed.some((item) => item === null) ? null : (parsed as T[]);
}

function hasUniqueIds(items: Array<{ id: string }>): boolean {
  return new Set(items.map((item) => item.id)).size === items.length;
}

export function parsePoolState(value: unknown): PersistedPoolState | null {
  if (!isRecord(value)) return null;
  const products = parseList(value.products, parseProduct);
  const sales = parseList(value.sales, parseSale);
  const expenses = parseList(value.expenses, parseExpense);
  const cashMovements = parseList(value.cashMovements, parseCashMovement);
  const cashClosures = parseList(value.cashClosures, parseCashClosure);
  const operatorCredentials = parseOperatorCredentials(
    value.operatorCredentials,
  );
  const pinRecoveryCredential =
    value.pinRecoveryCredential === undefined
      ? undefined
      : parseOperatorCredential(value.pinRecoveryCredential);
  const cashFund =
    value.cashFund === undefined ? DEFAULT_CASH_FUND : value.cashFund;
  if (
    products === null ||
    sales === null ||
    expenses === null ||
    typeof value.cashOpen !== "boolean" ||
    !isNonNegativeMoney(value.openingBalance) ||
    !isNonNegativeMoney(cashFund) ||
    !isTimestamp(value.cashOpenedAt) ||
    cashMovements === null ||
    cashClosures === null ||
    operatorCredentials === null ||
    pinRecoveryCredential === null
  ) {
    return null;
  }
  const activeCashSession = parseActiveCashSession(value.activeCashSession, {
    cashOpen: value.cashOpen,
    openedAt: value.cashOpenedAt,
    openingBalance: value.openingBalance,
  });
  if (value.cashOpen && !activeCashSession) return null;
  if (
    activeCashSession &&
    (activeCashSession.openedAt !== value.cashOpenedAt ||
      Math.abs(activeCashSession.openingBalance - value.openingBalance) >
        0.005)
  ) {
    return null;
  }
  if (
    !hasUniqueIds(products) ||
    !hasUniqueIds(sales) ||
    !hasUniqueIds(expenses) ||
    !hasUniqueIds(cashMovements) ||
    !hasUniqueIds(cashClosures)
  ) {
    return null;
  }
  if (
    new Set(cashClosures.map((closure) => closure.sessionId)).size !==
    cashClosures.length
  ) {
    return null;
  }
  const linkedSales = sales.map((sale) =>
    linkLegacyCashSession(sale, cashClosures, activeCashSession),
  );
  const linkedExpenses = expenses.map((expense) =>
    linkLegacyCashSession(expense, cashClosures, activeCashSession),
  );
  const linkedCashMovements = cashMovements.map((movement) =>
    linkLegacyCashSession(movement, cashClosures, activeCashSession),
  );
  const knownSessionIds = new Set([
    ...cashClosures.map((closure) => closure.sessionId),
    ...(activeCashSession ? [activeCashSession.id] : []),
  ]);
  if (
    [...linkedSales, ...linkedExpenses, ...linkedCashMovements].some(
      (item) => item.cashSessionId && !knownSessionIds.has(item.cashSessionId),
    )
  ) {
    return null;
  }
  return {
    products,
    sales: linkedSales,
    expenses: linkedExpenses,
    cashOpen: value.cashOpen,
    openingBalance: roundMoney(value.openingBalance),
    cashFund: roundMoney(cashFund),
    cashOpenedAt: value.cashOpenedAt,
    activeCashSession,
    cashMovements: linkedCashMovements,
    cashClosures,
    operatorCredentials,
    ...(pinRecoveryCredential ? { pinRecoveryCredential } : {}),
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
