export type View =
  | "inicio"
  | "venda"
  | "pedidos-online"
  | "comandas"
  | "estoque"
  | "financeiro"
  | "musica"
  | "configuracoes";

export type PaymentMethod =
  | "Pix"
  | "Dinheiro"
  | "Débito"
  | "Crédito"
  | "Cartão";

/** Rótulo de pagamento da venda: uma forma única ou "Misto" quando dividida. */
export type SalePaymentLabel = PaymentMethod | "Misto";

/**
 * Parte de uma venda paga em uma forma. `baseAmount` é a fatia do subtotal dos
 * itens; o acréscimo do cartão incide somente sobre ela; `amount` é o que o
 * cliente pagou nessa forma (base + acréscimo).
 */
export type SalePaymentPart = {
  method: PaymentMethod;
  baseAmount: number;
  surchargeRate: number;
  surchargeAmount: number;
  amount: number;
};

export type OperatorId = "elaine" | "poolblay";

export type OperatorCredential = {
  algorithm: "PBKDF2-SHA-256";
  iterations: number;
  salt: string;
  hash: string;
  updatedAt: number;
};

export type OperatorCredentials = Partial<
  Record<OperatorId, OperatorCredential>
>;

export type SaleOperatorId = OperatorId | "nao-identificado";

export type ProductCategory =
  | "Hambúrgueres"
  | "Salgados"
  | "Petiscos"
  | "Sobremesas"
  | "Bebidas"
  | "Adicionais";

export type Product = {
  id: string;
  name: string;
  category: ProductCategory;
  price: number;
  stock: number;
  minimum: number;
  emoji: string;
};

export type CartItem = {
  productId: string;
  quantity: number;
  observation: string;
};

export type SaleItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  observation?: string;
};

export type OrderStatus =
  | "aguardando"
  | "em-preparo"
  | "pronto"
  | "entregue";

export type SaleServiceMode = "comanda" | "venda-direta";

export type Sale = {
  id: string;
  cashSessionId?: string;
  timestamp: number;
  subtotal?: number;
  surchargeRate?: number;
  surchargeAmount?: number;
  total: number;
  payment: SalePaymentLabel;
  /** Ausente nas vendas anteriores ao pagamento dividido (uma única forma). */
  payments?: SalePaymentPart[];
  operatorId: SaleOperatorId;
  operatorName: string;
  items: SaleItem[];
  customerName: string;
  source?: "caixa" | "cardapio-online";
  externalOrderId?: string;
  customerNote?: string;
  fulfillmentMode?: "table" | "pickup";
  tableLabel?: string;
  serviceMode?: SaleServiceMode;
  orderStatus: OrderStatus;
  statusUpdatedAt: number;
};

export type Expense = {
  id: string;
  cashSessionId?: string;
  timestamp: number;
  description: string;
  category: string;
  amount: number;
  payment: PaymentMethod;
};

export type CashMovement = {
  id: string;
  cashSessionId?: string;
  timestamp: number;
  description: string;
  amount: number;
  kind: "suprimento" | "sangria";
};

export type CashClosure = {
  id: string;
  sessionId: string;
  openedAt: number;
  closedAt: number;
  openedByOperatorId: SaleOperatorId;
  openedByOperatorName: string;
  closedByOperatorId: SaleOperatorId;
  closedByOperatorName: string;
  openingBalance: number;
  expectedBalance: number;
  countedBalance: number;
  difference: number;
  cashFund: number;
  withdrawalAmount: number;
  remainingBalance: number;
};

export type ActiveCashSession = {
  id: string;
  openedAt: number;
  openingBalance: number;
  openedByOperatorId: SaleOperatorId;
  openedByOperatorName: string;
};

export type Track = {
  id: string;
  name: string;
  url: string;
  size: string;
  source: "upload" | "yt-dlp";
};

export type Toast = {
  message: string;
  tone: "success" | "warning" | "info";
};

export type Transaction = {
  id: string;
  timestamp: number;
  description: string;
  detail: string;
  amount: number;
  kind: "entrada" | "saida";
};

export type PersistedPoolState = {
  products: Product[];
  sales: Sale[];
  expenses: Expense[];
  cashOpen: boolean;
  openingBalance: number;
  cashFund: number;
  cashOpenedAt: number;
  activeCashSession: ActiveCashSession | null;
  cashMovements: CashMovement[];
  cashClosures: CashClosure[];
  ordersEnabled: boolean;
  operatorCredentials: OperatorCredentials;
  pinRecoveryCredential?: OperatorCredential;
};

export type PoolBackup = {
  app: "Pool Petiscos & Lanches";
  version: 1;
  exportedAt: string;
  data: PersistedPoolState;
};
