export type View =
  | "inicio"
  | "venda"
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

export type Sale = {
  id: string;
  timestamp: number;
  total: number;
  payment: PaymentMethod;
  operatorId: SaleOperatorId;
  operatorName: string;
  items: SaleItem[];
  customerName: string;
  orderStatus: OrderStatus;
  statusUpdatedAt: number;
};

export type Expense = {
  id: string;
  timestamp: number;
  description: string;
  category: string;
  amount: number;
  payment: PaymentMethod;
};

export type CashMovement = {
  id: string;
  timestamp: number;
  description: string;
  amount: number;
  kind: "suprimento" | "sangria";
};

export type CashClosure = {
  id: string;
  openedAt: number;
  closedAt: number;
  openingBalance: number;
  expectedBalance: number;
  countedBalance: number;
  difference: number;
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
  cashOpenedAt: number;
  cashMovements: CashMovement[];
  cashClosures: CashClosure[];
  operatorCredentials: OperatorCredentials;
  pinRecoveryCredential?: OperatorCredential;
};

export type PoolBackup = {
  app: "Pool Petiscos & Lanches";
  version: 1;
  exportedAt: string;
  data: PersistedPoolState;
};
