export type View =
  | "inicio"
  | "venda"
  | "comandas"
  | "estoque"
  | "financeiro"
  | "musica";

export type PaymentMethod = "Pix" | "Dinheiro" | "Cartão";

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
};

export type SaleItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
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
};

export type PoolBackup = {
  app: "Pool Petiscos & Lanches";
  version: 1;
  exportedAt: string;
  data: PersistedPoolState;
};
