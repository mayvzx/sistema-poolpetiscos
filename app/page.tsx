"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Bell,
  Bluetooth,
  Boxes,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  ExternalLink,
  FileAudio,
  LayoutDashboard,
  ListMusic,
  Minus,
  Music2,
  Package,
  Pause,
  Play,
  Plus,
  QrCode,
  ReceiptText,
  RotateCcw,
  Search,
  ShoppingCart,
  SkipBack,
  SkipForward,
  Sparkles,
  Store,
  Upload,
  UserRound,
  Volume2,
  WalletCards,
  X,
} from "lucide-react";

type View = "inicio" | "venda" | "estoque" | "financeiro" | "musica";
type PaymentMethod = "Pix" | "Dinheiro" | "Cartão";

type Product = {
  id: string;
  name: string;
  category:
    | "Hambúrgueres"
    | "Salgados"
    | "Petiscos"
    | "Sobremesas"
    | "Bebidas"
    | "Adicionais";
  price: number;
  stock: number;
  minimum: number;
  emoji: string;
};

type CartItem = {
  productId: string;
  quantity: number;
};

type SaleItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
};

type Sale = {
  id: string;
  timestamp: number;
  total: number;
  payment: PaymentMethod;
  items: SaleItem[];
};

type Expense = {
  id: string;
  timestamp: number;
  description: string;
  category: string;
  amount: number;
};

type Track = {
  id: string;
  name: string;
  url: string;
  size: string;
};

type Toast = {
  message: string;
  tone: "success" | "warning" | "info";
};

type Transaction = {
  id: string;
  timestamp: number;
  description: string;
  detail: string;
  amount: number;
  kind: "entrada" | "saida";
};

const STORAGE_KEY = "pool-caixa-prototype-v2-cardapio-completo";
const categories = [
  "Todos",
  "Hambúrgueres",
  "Salgados",
  "Petiscos",
  "Sobremesas",
  "Bebidas",
  "Adicionais",
] as const;

const DEMO_PRODUCTS: Product[] = [
  {
    id: "hamb-trad",
    name: "Hambúrguer tradicional",
    category: "Hambúrgueres",
    price: 9.99,
    stock: 32,
    minimum: 12,
    emoji: "🍔",
  },
  {
    id: "hamb-art",
    name: "Hambúrguer artesanal",
    category: "Hambúrgueres",
    price: 14.99,
    stock: 18,
    minimum: 10,
    emoji: "🍔",
  },
  {
    id: "xbacon-trad",
    name: "X-Bacon tradicional",
    category: "Hambúrgueres",
    price: 14.99,
    stock: 14,
    minimum: 8,
    emoji: "🥓",
  },
  {
    id: "xbacon-art",
    name: "X-Bacon artesanal",
    category: "Hambúrgueres",
    price: 19.99,
    stock: 11,
    minimum: 8,
    emoji: "🥓",
  },
  {
    id: "xcalabresa-trad",
    name: "X-Calabresa tradicional",
    category: "Hambúrgueres",
    price: 14.99,
    stock: 17,
    minimum: 8,
    emoji: "🌭",
  },
  {
    id: "xcalabresa-art",
    name: "X-Calabresa artesanal",
    category: "Hambúrgueres",
    price: 19.99,
    stock: 13,
    minimum: 8,
    emoji: "🌭",
  },
  {
    id: "xcheddar-trad",
    name: "X-Cheddar tradicional",
    category: "Hambúrgueres",
    price: 14.99,
    stock: 11,
    minimum: 8,
    emoji: "🧀",
  },
  {
    id: "xcheddar-art",
    name: "X-Cheddar artesanal",
    category: "Hambúrgueres",
    price: 19.99,
    stock: 10,
    minimum: 8,
    emoji: "🧀",
  },
  {
    id: "xtudo-trad",
    name: "X-Tudo tradicional",
    category: "Hambúrgueres",
    price: 19.99,
    stock: 9,
    minimum: 8,
    emoji: "🍔",
  },
  {
    id: "xtudo-art",
    name: "X-Tudo artesanal",
    category: "Hambúrgueres",
    price: 24.99,
    stock: 8,
    minimum: 8,
    emoji: "🍔",
  },
  {
    id: "pastel",
    name: "Pastel",
    category: "Salgados",
    price: 9,
    stock: 28,
    minimum: 10,
    emoji: "🥟",
  },
  {
    id: "coxinha",
    name: "Coxinha",
    category: "Salgados",
    price: 5,
    stock: 22,
    minimum: 12,
    emoji: "🍗",
  },
  {
    id: "cachorro",
    name: "Cachorro-quente",
    category: "Salgados",
    price: 7,
    stock: 16,
    minimum: 8,
    emoji: "🌭",
  },
  {
    id: "bolo",
    name: "Bolo",
    category: "Sobremesas",
    price: 7,
    stock: 12,
    minimum: 5,
    emoji: "🍰",
  },
  {
    id: "batata",
    name: "Batata frita 400 g",
    category: "Petiscos",
    price: 10,
    stock: 19,
    minimum: 8,
    emoji: "🍟",
  },
  {
    id: "batata-americana",
    name: "Batata cheddar e bacon",
    category: "Petiscos",
    price: 13,
    stock: 12,
    minimum: 6,
    emoji: "🍟",
  },
  {
    id: "carne-fritas",
    name: "Carne com fritas",
    category: "Petiscos",
    price: 35,
    stock: 8,
    minimum: 5,
    emoji: "🥩",
  },
  {
    id: "camarao-fritas",
    name: "Camarão com fritas",
    category: "Petiscos",
    price: 35,
    stock: 7,
    minimum: 5,
    emoji: "🍤",
  },
  {
    id: "picole",
    name: "Picolé gourmet",
    category: "Sobremesas",
    price: 3,
    stock: 24,
    minimum: 10,
    emoji: "🍦",
  },
  {
    id: "sobremesa-200",
    name: "Sobremesa gelada 200 g",
    category: "Sobremesas",
    price: 5,
    stock: 18,
    minimum: 8,
    emoji: "🍧",
  },
  {
    id: "sobremesa-500",
    name: "Sobremesa gelada 500 g",
    category: "Sobremesas",
    price: 11,
    stock: 12,
    minimum: 6,
    emoji: "🍧",
  },
  {
    id: "moreninha",
    name: "Moreninha",
    category: "Sobremesas",
    price: 4,
    stock: 16,
    minimum: 8,
    emoji: "🍫",
  },
  {
    id: "sundae",
    name: "Sundae",
    category: "Sobremesas",
    price: 5,
    stock: 14,
    minimum: 6,
    emoji: "🍨",
  },
  {
    id: "guaracai",
    name: "Guaraçaí 500 ml",
    category: "Sobremesas",
    price: 8,
    stock: 12,
    minimum: 6,
    emoji: "🥤",
  },
  {
    id: "suco",
    name: "Suco da polpa",
    category: "Bebidas",
    price: 6,
    stock: 14,
    minimum: 8,
    emoji: "🥤",
  },
  {
    id: "coca-lata",
    name: "Coca-Cola lata",
    category: "Bebidas",
    price: 6,
    stock: 6,
    minimum: 10,
    emoji: "🥤",
  },
  {
    id: "refri-lata",
    name: "Refrigerante lata",
    category: "Bebidas",
    price: 5,
    stock: 9,
    minimum: 10,
    emoji: "🥤",
  },
  {
    id: "agua",
    name: "Água mineral",
    category: "Bebidas",
    price: 2,
    stock: 18,
    minimum: 10,
    emoji: "💧",
  },
  {
    id: "coca-1l",
    name: "Coca-Cola 1 L",
    category: "Bebidas",
    price: 8.5,
    stock: 8,
    minimum: 6,
    emoji: "🍶",
  },
  {
    id: "guarana-1l",
    name: "Guaraná 1 L",
    category: "Bebidas",
    price: 8,
    stock: 7,
    minimum: 8,
    emoji: "🍶",
  },
  {
    id: "brahma-litrao",
    name: "Brahma litrão",
    category: "Bebidas",
    price: 10,
    stock: 10,
    minimum: 6,
    emoji: "🍺",
  },
  {
    id: "schin-litrao",
    name: "Schin litrão",
    category: "Bebidas",
    price: 7,
    stock: 10,
    minimum: 6,
    emoji: "🍺",
  },
  {
    id: "guarana-caculinha",
    name: "Guaraná caçulinha",
    category: "Bebidas",
    price: 2,
    stock: 18,
    minimum: 10,
    emoji: "🥤",
  },
  {
    id: "embalagem",
    name: "Embalagem para viagem",
    category: "Adicionais",
    price: 1,
    stock: 40,
    minimum: 15,
    emoji: "🥡",
  },
];

const navigation = [
  { id: "inicio" as const, label: "Início", icon: LayoutDashboard },
  { id: "venda" as const, label: "Nova venda", icon: ShoppingCart },
  { id: "estoque" as const, label: "Estoque", icon: Package },
  { id: "financeiro" as const, label: "Financeiro", icon: WalletCards },
  { id: "musica" as const, label: "Músicas", icon: Music2, badge: "Beta" },
];

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const shortCurrency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function formatDateKey(timestamp: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
  }).format(new Date(timestamp));
}

function isToday(timestamp: number) {
  return formatDateKey(timestamp) === formatDateKey(Date.now());
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Recife",
  }).format(new Date(timestamp));
}

function getGreeting(hour: number) {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

const BUSINESS_HOURS = "Qua, Sex, Sáb e Dom • 16h–23h";
const BUSINESS_DAYS = new Set(["Sun", "Wed", "Fri", "Sat"]);

function getRecifeClock(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Recife",
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

function getBusinessStatus(date: Date | null) {
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

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function createDemoSales(): Sale[] {
  const now = Date.now();
  return [
    {
      id: "PV-1048",
      timestamp: now - 14 * 60_000,
      total: 29.98,
      payment: "Pix",
      items: [
        {
          productId: "xbacon-trad",
          name: "X-Bacon tradicional",
          price: 14.99,
          quantity: 2,
        },
      ],
    },
    {
      id: "PV-1047",
      timestamp: now - 33 * 60_000,
      total: 31,
      payment: "Dinheiro",
      items: [
        {
          productId: "pastel",
          name: "Pastel",
          price: 9,
          quantity: 1,
        },
        {
          productId: "batata",
          name: "Batata frita 400 g",
          price: 10,
          quantity: 1,
        },
        {
          productId: "coca-lata",
          name: "Coca-Cola lata",
          price: 6,
          quantity: 2,
        },
      ],
    },
    {
      id: "PV-1046",
      timestamp: now - 57 * 60_000,
      total: 41,
      payment: "Cartão",
      items: [
        {
          productId: "carne-fritas",
          name: "Carne com fritas",
          price: 35,
          quantity: 1,
        },
        {
          productId: "suco",
          name: "Suco da polpa",
          price: 6,
          quantity: 1,
        },
      ],
    },
    {
      id: "PV-1045",
      timestamp: now - 91 * 60_000,
      total: 24.99,
      payment: "Pix",
      items: [
        {
          productId: "xtudo-trad",
          name: "X-Tudo tradicional",
          price: 19.99,
          quantity: 1,
        },
        {
          productId: "refri-lata",
          name: "Refrigerante lata",
          price: 5,
          quantity: 1,
        },
      ],
    },
  ];
}

function createDemoExpenses(): Expense[] {
  return [
    {
      id: "DS-204",
      timestamp: Date.now() - 73 * 60_000,
      description: "Compra de pão e verduras",
      category: "Matéria-prima",
      amount: 38,
    },
  ];
}

export default function Home() {
  const [activeView, setActiveView] = useState<View>("inicio");
  const [now, setNow] = useState<Date | null>(null);
  const [products, setProducts] = useState<Product[]>(DEMO_PRODUCTS);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cashOpen, setCashOpen] = useState(true);
  const [openingBalance] = useState(100);
  const [hydrated, setHydrated] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saleSearch, setSaleSearch] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("Todos");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Pix");
  const [cashReceived, setCashReceived] = useState("");
  const [stockSearch, setStockSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<"Todos" | "Baixo" | "Normal">(
    "Todos",
  );
  const [modal, setModal] = useState<"stock" | "expense" | null>(null);
  const [stockForm, setStockForm] = useState({
    productId: DEMO_PRODUCTS[0].id,
    quantity: "10",
    cost: "",
  });
  const [expenseForm, setExpenseForm] = useState({
    description: "",
    category: "Matéria-prima",
    amount: "",
  });
  const [toast, setToast] = useState<Toast | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(70);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const updateClock = () => setNow(new Date());
    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    window.queueMicrotask(() => {
      if (cancelled) return;
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as {
            products?: Product[];
            sales?: Sale[];
            expenses?: Expense[];
            cashOpen?: boolean;
          };
          if (parsed.products?.length) setProducts(parsed.products);
          setSales(parsed.sales ?? createDemoSales());
          setExpenses(parsed.expenses ?? createDemoExpenses());
          if (typeof parsed.cashOpen === "boolean") setCashOpen(parsed.cashOpen);
        } else {
          setSales(createDemoSales());
          setExpenses(createDemoExpenses());
        }
      } catch {
        setSales(createDemoSales());
        setExpenses(createDemoExpenses());
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ products, sales, expenses, cashOpen }),
    );
  }, [cashOpen, expenses, hydrated, products, sales]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100;
  }, [volume]);

  const todaySales = useMemo(() => sales.filter((sale) => isToday(sale.timestamp)), [sales]);
  const todayExpenses = useMemo(
    () => expenses.filter((expense) => isToday(expense.timestamp)),
    [expenses],
  );
  const revenue = useMemo(
    () => todaySales.reduce((total, sale) => total + sale.total, 0),
    [todaySales],
  );
  const expenseTotal = useMemo(
    () => todayExpenses.reduce((total, expense) => total + expense.amount, 0),
    [todayExpenses],
  );
  const ticketAverage = todaySales.length ? revenue / todaySales.length : 0;
  const cashBalance = openingBalance + revenue - expenseTotal;
  const lowStock = useMemo(
    () => products.filter((product) => product.stock <= product.minimum),
    [products],
  );

  const cartDetails = useMemo(
    () =>
      cart
        .map((item) => {
          const product = products.find(
            (candidate) => candidate.id === item.productId,
          );
          return product ? { ...item, product } : null;
        })
        .filter(
          (
            item,
          ): item is CartItem & {
            product: Product;
          } => Boolean(item),
        ),
    [cart, products],
  );

  const cartTotal = useMemo(
    () =>
      cartDetails.reduce(
        (total, item) => total + item.product.price * item.quantity,
        0,
      ),
    [cartDetails],
  );

  const filteredProducts = useMemo(() => {
    const query = normalizeText(saleSearch);
    return products.filter(
      (product) =>
        (category === "Todos" || product.category === category) &&
        (!query || normalizeText(product.name).includes(query)),
    );
  }, [category, products, saleSearch]);

  const filteredStock = useMemo(() => {
    const query = normalizeText(stockSearch);
    return products.filter((product) => {
      const matchesSearch =
        !query || normalizeText(product.name).includes(query);
      const isLow = product.stock <= product.minimum;
      const matchesStatus =
        stockFilter === "Todos" ||
        (stockFilter === "Baixo" && isLow) ||
        (stockFilter === "Normal" && !isLow);
      return matchesSearch && matchesStatus;
    });
  }, [products, stockFilter, stockSearch]);

  const transactions = useMemo<Transaction[]>(
    () =>
      [
        ...todaySales.map((sale) => ({
          id: sale.id,
          timestamp: sale.timestamp,
          description: `Venda ${sale.id}`,
          detail: `${sale.items.reduce((sum, item) => sum + item.quantity, 0)} item(ns) • ${sale.payment}`,
          amount: sale.total,
          kind: "entrada" as const,
        })),
        ...todayExpenses.map((expense) => ({
          id: expense.id,
          timestamp: expense.timestamp,
          description: expense.description,
          detail: expense.category,
          amount: expense.amount,
          kind: "saida" as const,
        })),
      ].sort((a, b) => b.timestamp - a.timestamp),
    [todayExpenses, todaySales],
  );

  const paymentTotals = useMemo(() => {
    const totals: Record<PaymentMethod, number> = {
      Pix: 0,
      Dinheiro: 0,
      Cartão: 0,
    };
    todaySales.forEach((sale) => {
      totals[sale.payment] += sale.total;
    });
    return totals;
  }, [todaySales]);

  const dateLabel = useMemo(() => {
    if (!now) return "Carregando data...";
    return new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      timeZone: "America/Recife",
    }).format(now);
  }, [now]);

  const timeLabel = useMemo(() => {
    if (!now) return "--:--";
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Recife",
    }).format(now);
  }, [now]);

  const recifeHour = now ? getRecifeClock(now).hour : 15;
  const businessStatus = getBusinessStatus(now);

  const currentTrack =
    currentTrackIndex >= 0 ? tracks[currentTrackIndex] : undefined;

  function showToast(message: string, tone: Toast["tone"] = "success") {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3200);
  }

  function addToCart(product: Product) {
    if (!cashOpen) {
      showToast("Abra o caixa antes de iniciar uma venda.", "warning");
      return;
    }
    const existing = cart.find((item) => item.productId === product.id);
    if ((existing?.quantity ?? 0) >= product.stock) {
      showToast(`O estoque de ${product.name} chegou ao limite.`, "warning");
      return;
    }
    setCart((current) => {
      const found = current.find((item) => item.productId === product.id);
      if (found) {
        return current.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [...current, { productId: product.id, quantity: 1 }];
    });
  }

  function changeCartQuantity(productId: string, change: number) {
    const product = products.find((item) => item.id === productId);
    setCart((current) =>
      current
        .map((item) => {
          if (item.productId !== productId) return item;
          const nextQuantity = item.quantity + change;
          if (product && nextQuantity > product.stock) {
            showToast("Não há mais unidades disponíveis.", "warning");
            return item;
          }
          return { ...item, quantity: nextQuantity };
        })
        .filter((item) => item.quantity > 0),
    );
  }

  function finishSale() {
    if (!cashOpen) {
      showToast("O caixa está fechado.", "warning");
      return;
    }
    if (!cartDetails.length) {
      showToast("Adicione pelo menos um produto ao pedido.", "warning");
      return;
    }
    if (
      paymentMethod === "Dinheiro" &&
      Number(cashReceived.replace(",", ".")) < cartTotal
    ) {
      showToast("O valor recebido é menor que o total da venda.", "warning");
      return;
    }
    const items: SaleItem[] = cartDetails.map((item) => ({
      productId: item.product.id,
      name: item.product.name,
      price: item.product.price,
      quantity: item.quantity,
    }));
    const sale: Sale = {
      id: `PV-${String(Date.now()).slice(-5)}`,
      timestamp: Date.now(),
      total: cartTotal,
      payment: paymentMethod,
      items,
    };
    setProducts((current) =>
      current.map((product) => {
        const sold = cart.find((item) => item.productId === product.id);
        return sold
          ? { ...product, stock: Math.max(0, product.stock - sold.quantity) }
          : product;
      }),
    );
    setSales((current) => [sale, ...current]);
    setCart([]);
    setCashReceived("");
    showToast(`Venda ${sale.id} finalizada e estoque atualizado.`);
  }

  function openStockModal(productId?: string) {
    setStockForm({
      productId: productId ?? products[0]?.id ?? "",
      quantity: "10",
      cost: "",
    });
    setModal("stock");
  }

  function submitStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantity = Number(stockForm.quantity);
    const cost = Number(stockForm.cost.replace(",", "."));
    if (!quantity || quantity <= 0) {
      showToast("Informe uma quantidade válida.", "warning");
      return;
    }
    const product = products.find((item) => item.id === stockForm.productId);
    setProducts((current) =>
      current.map((item) =>
        item.id === stockForm.productId
          ? { ...item, stock: item.stock + quantity }
          : item,
      ),
    );
    if (cost > 0 && product) {
      setExpenses((current) => [
        {
          id: `DS-${String(Date.now()).slice(-5)}`,
          timestamp: Date.now(),
          description: `Reposição: ${product.name}`,
          category: "Compra de estoque",
          amount: cost,
        },
        ...current,
      ]);
    }
    setModal(null);
    showToast(
      cost > 0
        ? "Estoque e saída financeira registrados."
        : "Entrada de estoque registrada.",
    );
  }

  function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(expenseForm.amount.replace(",", "."));
    if (!expenseForm.description.trim() || !amount || amount <= 0) {
      showToast("Preencha a descrição e um valor válido.", "warning");
      return;
    }
    setExpenses((current) => [
      {
        id: `DS-${String(Date.now()).slice(-5)}`,
        timestamp: Date.now(),
        description: expenseForm.description.trim(),
        category: expenseForm.category,
        amount,
      },
      ...current,
    ]);
    setExpenseForm({
      description: "",
      category: "Matéria-prima",
      amount: "",
    });
    setModal(null);
    showToast("Saída registrada no financeiro.");
  }

  function resetDemo() {
    if (
      !window.confirm(
        "Restaurar os dados da demonstração? As vendas adicionadas neste navegador serão apagadas.",
      )
    ) {
      return;
    }
    setProducts(DEMO_PRODUCTS);
    setSales(createDemoSales());
    setExpenses(createDemoExpenses());
    setCashOpen(true);
    setCart([]);
    showToast("Dados de demonstração restaurados.", "info");
  }

  function handleAudioFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const imported = files.map((file, index) => ({
      id: `${file.name}-${Date.now()}-${index}`,
      name: file.name.replace(/\.[^.]+$/, ""),
      url: URL.createObjectURL(file),
      size:
        file.size > 1024 * 1024
          ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
          : `${Math.round(file.size / 1024)} KB`,
    }));
    const startIndex = tracks.length;
    setTracks((current) => [...current, ...imported]);
    if (currentTrackIndex === -1) setCurrentTrackIndex(startIndex);
    showToast(`${imported.length} áudio(s) importado(s) do computador.`);
    event.target.value = "";
  }

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !currentTrack) {
      showToast("Importe uma música do computador primeiro.", "info");
      return;
    }
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        showToast("Não foi possível reproduzir este arquivo.", "warning");
      }
    }
  }

  function selectTrack(index: number) {
    setCurrentTrackIndex(index);
    setIsPlaying(false);
    window.setTimeout(async () => {
      if (!audioRef.current) return;
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    }, 0);
  }

  function moveTrack(direction: number) {
    if (!tracks.length) return;
    const next =
      currentTrackIndex < 0
        ? 0
        : (currentTrackIndex + direction + tracks.length) % tracks.length;
    selectTrack(next);
  }

  return (
    <div className="min-h-screen bg-[#f7f5f2] text-[#24201f]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[252px] flex-col overflow-y-auto bg-[#211e1d] px-4 py-5 text-white shadow-2xl lg:flex">
        <div className="rounded-xl bg-white/5 p-2">
          <img
            src="/pool-logo-banner.jpg"
            alt="Pool Petiscos & Lanches"
            className="aspect-[6/1] w-full rounded-lg object-cover shadow-lg"
          />
          <p className="mt-2 px-1 text-[10px] tracking-wide text-white/45">
            Gestão simples do seu negócio
          </p>
        </div>

        <nav className="mt-5 flex flex-col gap-1" aria-label="Navegação principal">
          <span className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">
            Menu principal
          </span>
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                data-testid={`nav-${item.id}`}
                className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition ${
                  active
                    ? "bg-[#d9202c] text-white shadow-[0_10px_24px_rgba(217,32,44,.25)]"
                    : "text-white/60 hover:bg-white/7 hover:text-white"
                }`}
              >
                <Icon size={19} strokeWidth={2.1} />
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span className="rounded-full bg-[#f5b617]/15 px-2 py-1 text-[8px] font-extrabold text-[#ffd467]">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex-1" />
        <div className="mt-5 rounded-xl border border-[#f5b617]/15 bg-[#f5b617]/8 p-3">
          <div className="flex gap-2 text-[#f6c746]">
            <Sparkles size={17} className="shrink-0" />
            <div>
              <strong className="block text-[10px] text-[#ffe39a]">
                Modo demonstração
              </strong>
              <span className="mt-1 block text-[9px] leading-4 text-white/45">
                Os dados ficam salvos somente neste navegador.
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={resetDemo}
          className="mt-2 flex items-center gap-2 px-3 py-2 text-left text-[9px] text-white/40 transition hover:text-white/75"
        >
          <RotateCcw size={15} />
          Restaurar dados de exemplo
        </button>
        <div className="mt-2 flex items-center gap-3 border-t border-white/8 px-2 pt-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white font-extrabold text-[#d9202c]">
            E
          </span>
          <div className="min-w-0 flex-1">
            <strong className="block text-[11px]">Elaine</strong>
            <span className="block text-[9px] text-white/40">
              Administradora
            </span>
          </div>
          <ChevronRight size={17} className="text-white/30" />
        </div>
      </aside>

      <main className="min-h-screen pb-24 lg:ml-[252px] lg:pb-0">
        <header className="sticky top-0 z-30 flex min-h-[70px] items-center justify-between gap-4 border-b border-[#ebe5e1] bg-[#f7f5f2]/92 px-4 backdrop-blur-xl sm:px-6 lg:px-9">
          <img
            src="/pool-logo-banner.jpg"
            alt="Pool Petiscos & Lanches"
            className="w-[126px] rounded-lg object-cover shadow-sm lg:hidden"
          />
          <div className="hidden items-center gap-4 sm:flex">
            <span className="flex items-center gap-2 text-[11px] capitalize text-[#776f6b]">
              <CalendarDays size={16} />
              {dateLabel}
            </span>
            <span className="flex items-center gap-2 border-l border-[#ded7d2] pl-4 text-xs font-bold tabular-nums">
              <Clock3 size={16} className="text-[#776f6b]" />
              {timeLabel}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:ml-0">
            <button
              type="button"
              onClick={() => {
                setCashOpen((current) => !current);
                showToast(
                  cashOpen ? "Caixa fechado." : "Caixa aberto para vendas.",
                  "info",
                );
              }}
              className={`flex items-center gap-2 rounded-full border px-3 py-2 text-[9px] font-extrabold sm:text-[10px] ${
                cashOpen
                  ? "border-[#cdebdc] bg-[#eaf8f1] text-[#23734f]"
                  : "border-[#f1d0d3] bg-[#fff0f1] text-[#b41622]"
              }`}
            >
              <i
                className={`size-1.5 rounded-full ${
                  cashOpen ? "bg-[#31a36f]" : "bg-[#d9202c]"
                }`}
              />
              {cashOpen ? "Caixa aberto" : "Caixa fechado"}
            </button>
            <button
              type="button"
              aria-label="Notificações"
              className="relative hidden size-9 place-items-center rounded-xl border border-[#ebe5e1] bg-white text-[#6d6561] sm:grid"
            >
              <Bell size={18} />
              {lowStock.length > 0 && (
                <span className="absolute right-2 top-2 size-1.5 rounded-full border border-white bg-[#d9202c]" />
              )}
            </button>
            <div className="hidden items-center gap-2 pl-1 md:flex">
              <span className="grid size-9 place-items-center rounded-xl bg-[#302b29] text-white">
                <UserRound size={17} />
              </span>
              <div>
                <strong className="block text-[10px]">Elaine</strong>
                <span className="block text-[8px] text-[#8d8581]">
                  Proprietária
                </span>
              </div>
            </div>
          </div>
        </header>

        {activeView === "inicio" && (
          <div className="mx-auto w-full max-w-[1480px] space-y-4 p-4 sm:p-6 lg:p-9">
            <section className="relative flex min-h-[220px] items-center overflow-hidden rounded-[24px] bg-gradient-to-br from-[#d9202c] to-[#a8101c] p-6 shadow-[0_16px_40px_rgba(66,45,37,.08)] sm:p-9">
              <div className="absolute inset-y-0 left-0 w-[75%] bg-white [clip-path:polygon(0_0,82%_0,100%_100%,0_100%)] sm:w-[70%]" />
              <div className="relative z-10 max-w-[600px]">
                <span className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.12em] text-[#d9202c]">
                  <Sparkles size={15} />
                  Tudo pronto por aqui
                </span>
                <h1 className="mt-2 text-3xl font-extrabold tracking-[-.04em] sm:text-[40px]">
                  {getGreeting(recifeHour)}, Elaine!
                </h1>
                <p className="mt-2 max-w-[480px] text-xs leading-6 text-[#776f6b] sm:text-sm">
                  Acompanhe as vendas, o caixa e o estoque da Pool sem
                  complicação.
                </p>
                <div className="mt-5 flex flex-col gap-2 min-[450px]:flex-row">
                  <button
                    type="button"
                    onClick={() => setActiveView("venda")}
                    data-testid="start-sale"
                    className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#d9202c] px-4 text-xs font-extrabold text-white shadow-[0_9px_20px_rgba(217,32,44,.2)] transition hover:bg-[#b41622]"
                  >
                    <Plus size={18} />
                    Registrar nova venda
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView("estoque")}
                    className="min-h-11 rounded-xl border border-[#ebe5e1] bg-white px-4 text-xs font-bold transition hover:border-[#d9cfca]"
                  >
                    Conferir estoque
                  </button>
                </div>
              </div>
              <div className="absolute bottom-3 right-3 z-10 rounded-full border border-white/30 bg-white/10 p-2 shadow-2xl sm:bottom-auto sm:right-[6%]">
                <img
                  src="/pool-logo-round.jpg"
                  alt=""
                  className="size-20 rounded-full object-cover sm:size-40"
                />
              </div>
            </section>

            <section className="flex flex-col gap-3 rounded-2xl border border-[#ebe5e1] bg-white p-4 shadow-[0_7px_22px_rgba(66,45,37,.035)] sm:flex-row sm:items-center">
              <span
                className={`grid size-11 shrink-0 place-items-center rounded-xl ${
                  businessStatus.open
                    ? "bg-[#eaf8f1] text-[#27865d]"
                    : "bg-[#fff8de] text-[#a97300]"
                }`}
              >
                <Store size={21} />
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-[9px] font-extrabold uppercase tracking-[.13em] text-[#9c928d]">
                  Funcionamento confirmado
                </span>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <strong className="text-sm">{businessStatus.label}</strong>
                  <span className="text-[10px] text-[#776f6b]">
                    {businessStatus.helper}
                  </span>
                </div>
              </div>
              <div className="rounded-xl bg-[#f7f5f2] px-3 py-2 text-[9px] font-bold text-[#6d6561]">
                Cardápio revisado • {products.length} opções cadastradas
              </div>
            </section>

            <section
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
              aria-label="Resumo de hoje"
            >
              {[
                {
                  label: "Vendas de hoje",
                  value: currency.format(revenue),
                  helper: `${todaySales.length} pedidos registrados`,
                  icon: ReceiptText,
                  colors: "bg-[#fff0f1] text-[#d9202c]",
                },
                {
                  label: "Ticket médio",
                  value: currency.format(ticketAverage),
                  helper: "Por pedido finalizado",
                  icon: ShoppingCart,
                  colors: "bg-[#fff8de] text-[#a97300]",
                },
                {
                  label: "Saldo do caixa",
                  value: currency.format(cashBalance),
                  helper: "Entradas menos saídas",
                  icon: WalletCards,
                  colors: "bg-[#eaf8f1] text-[#27865d]",
                },
                {
                  label: "Estoque baixo",
                  value: `${lowStock.length} ${lowStock.length === 1 ? "item" : "itens"}`,
                  helper: "Precisam de reposição",
                  icon: AlertTriangle,
                  colors: "bg-[#fff2e8] text-[#d76822]",
                },
              ].map((metric) => {
                const Icon = metric.icon;
                return (
                  <article
                    key={metric.label}
                    className="grid grid-cols-[42px_1fr] gap-x-3 rounded-2xl border border-[#ebe5e1] bg-white p-4 shadow-[0_7px_22px_rgba(66,45,37,.035)]"
                  >
                    <span
                      className={`row-span-3 grid size-10 place-items-center rounded-xl ${metric.colors}`}
                    >
                      <Icon size={20} />
                    </span>
                    <span className="text-[10px] font-semibold text-[#776f6b]">
                      {metric.label}
                    </span>
                    <strong className="mt-1 text-xl tracking-[-.03em]">
                      {metric.value}
                    </strong>
                    <small className="text-[9px] text-[#a19995]">
                      {metric.helper}
                    </small>
                  </article>
                );
              })}
            </section>

            <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
              <section className="rounded-[20px] border border-[#ebe5e1] bg-white p-5 shadow-[0_7px_22px_rgba(66,45,37,.035)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-[9px] font-extrabold uppercase tracking-[.13em] text-[#9c928d]">
                      Movimento recente
                    </span>
                    <h2 className="text-base font-extrabold tracking-tight">
                      Vendas dos últimos dias
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveView("financeiro")}
                    className="flex items-center text-[10px] font-extrabold text-[#d9202c]"
                  >
                    Ver financeiro <ChevronRight size={15} />
                  </button>
                </div>
                <div className="mt-5 flex items-end justify-between gap-3">
                  <div>
                    <strong className="block text-xl tracking-[-.03em]">
                      {currency.format(revenue + 1157.5)}
                    </strong>
                    <span className="text-[9px] text-[#776f6b]">
                      Dados ilustrativos da semana
                    </span>
                  </div>
                  <span className="rounded-full bg-[#eaf8f1] px-2 py-1 text-[9px] font-extrabold text-[#27865d]">
                    +8,4% nesta semana
                  </span>
                </div>
                <div className="mt-3 flex h-40 items-end justify-around gap-3 border-b border-[#ebe5e1] px-2">
                  {[
                    ["Qua", 38, 180],
                    ["Sex", 53, 252],
                    ["Sáb", 68, 322],
                    ["Dom", 91, 431],
                    ["Hoje", Math.max(32, Math.min(90, revenue / 5)), revenue],
                  ].map(([day, height, value]) => (
                    <div
                      key={String(day)}
                      className="group flex h-full flex-1 flex-col items-center justify-end"
                    >
                      <span className="mb-1 text-[8px] text-[#9c928d] opacity-0 transition group-hover:opacity-100">
                        {shortCurrency.format(Number(value))}
                      </span>
                      <div className="flex h-[120px] w-full max-w-9 items-end overflow-hidden rounded-t-lg bg-[#f5f1ee]">
                        <i
                          className={`block w-full rounded-t-lg ${
                            day === "Hoje"
                              ? "bg-gradient-to-t from-[#e5a70c] to-[#f8c738]"
                              : "bg-gradient-to-t from-[#c91824] to-[#e83a45]"
                          }`}
                          style={{ height: `${Number(height)}%` }}
                        />
                      </div>
                      <strong className="py-2 text-[9px] text-[#776f6b]">
                        {day}
                      </strong>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[20px] border border-[#ebe5e1] bg-white p-5 shadow-[0_7px_22px_rgba(66,45,37,.035)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-[9px] font-extrabold uppercase tracking-[.13em] text-[#9c928d]">
                      Atenção necessária
                    </span>
                    <h2 className="text-base font-extrabold tracking-tight">
                      Estoque baixo
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveView("estoque")}
                    className="flex items-center text-[10px] font-extrabold text-[#d9202c]"
                  >
                    Ver todos <ChevronRight size={15} />
                  </button>
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  {lowStock.slice(0, 4).map((product) => (
                    <article
                      key={product.id}
                      className="flex items-center gap-3 rounded-xl border border-[#f0e9e5] bg-[#fdfcfb] p-2.5"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#fff2e8] text-lg">
                        {product.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between gap-2">
                          <strong className="truncate text-[10px]">
                            {product.name}
                          </strong>
                          <span className="shrink-0 text-[8px] font-bold text-[#d76822]">
                            {product.stock} un.
                          </span>
                        </div>
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#f1e8e2]">
                          <i
                            className="block h-full rounded-full bg-[#d76822]"
                            style={{
                              width: `${Math.min(
                                100,
                                (product.stock / product.minimum) * 100,
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openStockModal(product.id)}
                        aria-label={`Repor ${product.name}`}
                        className="grid size-8 shrink-0 place-items-center rounded-lg border border-[#ebe5e1] bg-white text-[#d9202c]"
                      >
                        <Plus size={16} />
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            </div>

            <section className="rounded-[20px] border border-[#ebe5e1] bg-white p-5 shadow-[0_7px_22px_rgba(66,45,37,.035)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-[9px] font-extrabold uppercase tracking-[.13em] text-[#9c928d]">
                    Economize nas compras
                  </span>
                  <h2 className="text-base font-extrabold tracking-tight">
                    Radar de preços da região
                  </h2>
                </div>
                <span className="hidden text-[9px] text-[#aaa19d] sm:block">
                  Abre fontes atualizadas na internet
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {[
                  {
                    tag: "Cotação diária",
                    color: "bg-[#eaf8f1] text-[#27865d]",
                    title:
                      "Compare carnes, laticínios e hortaliças na CEASA-PE",
                    action: "Consultar preços",
                    href: "https://www.ceasape.org.br/cotacao",
                  },
                  {
                    tag: "Encarte regional",
                    color: "bg-[#fff8de] text-[#9a6700]",
                    title:
                      "Veja promoções do Novo Atacarejo perto da Pool",
                    action: "Abrir ofertas",
                    href: "https://ofertas.novoatacarejo.com/",
                  },
                  {
                    tag: "Para o negócio",
                    color: "bg-[#fff0f1] text-[#d9202c]",
                    title:
                      "Acompanhe as ofertas semanais do Assaí em Pernambuco",
                    action: "Ver encarte",
                    href: "https://www.assai.com.br/ofertas/pernambuco",
                  },
                ].map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-[130px] flex-col items-start rounded-2xl border border-[#ebe5e1] bg-gradient-to-br from-white to-[#fcfaf8] p-4 no-underline transition hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <span
                      className={`rounded-full px-2 py-1 text-[8px] font-extrabold ${item.color}`}
                    >
                      {item.tag}
                    </span>
                    <strong className="my-3 text-[11px] leading-5">
                      {item.title}
                    </strong>
                    <span className="mt-auto flex items-center gap-1 text-[9px] font-extrabold text-[#d9202c]">
                      {item.action} <ExternalLink size={13} />
                    </span>
                  </a>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeView === "venda" && (
          <div className="mx-auto w-full max-w-[1480px] p-4 sm:p-6 lg:p-9">
            <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <span className="text-[9px] font-extrabold uppercase tracking-[.13em] text-[#d9202c]">
                  Ponto de venda
                </span>
                <h1 className="text-2xl font-extrabold tracking-[-.04em] sm:text-3xl">
                  Nova venda
                </h1>
                <p className="mt-1 text-xs text-[#776f6b]">
                  Toque nos produtos para montar o pedido.
                </p>
              </div>
              <span className="flex items-center gap-2 self-start rounded-full bg-white px-3 py-2 text-[10px] font-bold text-[#776f6b] shadow-sm sm:self-auto">
                <CheckCircle2 size={16} className="text-[#27865d]" />
                Baixa automática por item
              </span>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <section className="min-w-0 rounded-[20px] border border-[#ebe5e1] bg-white p-4 shadow-[0_7px_22px_rgba(66,45,37,.035)] sm:p-5">
                <div className="relative">
                  <Search
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9c928d]"
                  />
                  <input
                    value={saleSearch}
                    onChange={(event) => setSaleSearch(event.target.value)}
                    placeholder="Buscar pastel, hambúrguer, bebida..."
                    aria-label="Buscar produtos"
                    className="h-11 w-full rounded-xl border border-[#ebe5e1] bg-[#faf8f6] pl-10 pr-4 text-xs outline-none transition focus:border-[#d9202c] focus:bg-white"
                  />
                </div>
                <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
                  {categories.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setCategory(item)}
                      className={`shrink-0 rounded-full border px-3 py-2 text-[10px] font-extrabold transition ${
                        category === item
                          ? "border-[#d9202c] bg-[#d9202c] text-white"
                          : "border-[#ebe5e1] bg-white text-[#776f6b] hover:border-[#d9cfca]"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
                  {filteredProducts.map((product) => {
                    const soldOut = product.stock === 0;
                    const low = product.stock <= product.minimum;
                    return (
                      <button
                        key={product.id}
                        type="button"
                        data-testid={`product-${product.id}`}
                        disabled={soldOut}
                        onClick={() => addToCart(product)}
                        className="group relative min-h-[154px] rounded-2xl border border-[#ebe5e1] bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-[#d9202c]/35 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <span className="grid size-12 place-items-center rounded-2xl bg-[#fff7ec] text-2xl transition group-hover:scale-105">
                          {product.emoji}
                        </span>
                        <strong className="mt-3 block min-h-8 text-[11px] leading-4">
                          {product.name}
                        </strong>
                        <div className="mt-2 flex items-end justify-between gap-2">
                          <span className="text-sm font-extrabold text-[#d9202c]">
                            {currency.format(product.price)}
                          </span>
                          <span
                            className={`text-[8px] font-bold ${
                              low ? "text-[#d76822]" : "text-[#8d8581]"
                            }`}
                          >
                            {product.stock} un.
                          </span>
                        </div>
                        <span className="absolute right-3 top-3 grid size-7 place-items-center rounded-lg bg-[#fff0f1] text-[#d9202c] opacity-0 transition group-hover:opacity-100">
                          <Plus size={15} />
                        </span>
                      </button>
                    );
                  })}
                </div>
                {!filteredProducts.length && (
                  <div className="grid min-h-56 place-items-center text-center">
                    <div>
                      <Search size={30} className="mx-auto text-[#c7beba]" />
                      <strong className="mt-3 block text-sm">
                        Nenhum produto encontrado
                      </strong>
                      <span className="text-[10px] text-[#8d8581]">
                        Tente buscar por outro nome.
                      </span>
                    </div>
                  </div>
                )}
              </section>

              <aside className="h-fit rounded-[20px] border border-[#ebe5e1] bg-white p-4 shadow-[0_10px_30px_rgba(66,45,37,.06)] xl:sticky xl:top-[88px]">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[9px] font-extrabold uppercase tracking-[.13em] text-[#9c928d]">
                      Pedido atual
                    </span>
                    <h2 className="text-lg font-extrabold">Comanda</h2>
                  </div>
                  <span className="grid size-9 place-items-center rounded-xl bg-[#fff0f1] text-[#d9202c]">
                    <ShoppingCart size={18} />
                  </span>
                </div>

                <div className="mt-4 min-h-[170px] space-y-2">
                  {!cartDetails.length ? (
                    <div className="grid min-h-[170px] place-items-center rounded-2xl border border-dashed border-[#ded7d2] bg-[#fcfaf8] text-center">
                      <div>
                        <ShoppingCart
                          size={28}
                          className="mx-auto text-[#c7beba]"
                        />
                        <strong className="mt-2 block text-[11px]">
                          Comanda vazia
                        </strong>
                        <span className="text-[9px] text-[#8d8581]">
                          Escolha um produto ao lado.
                        </span>
                      </div>
                    </div>
                  ) : (
                    cartDetails.map((item) => (
                      <article
                        key={item.productId}
                        className="flex items-center gap-2 rounded-xl border border-[#eee8e4] p-2"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#fff7ec] text-lg">
                          {item.product.emoji}
                        </span>
                        <div className="min-w-0 flex-1">
                          <strong className="block truncate text-[10px]">
                            {item.product.name}
                          </strong>
                          <span className="text-[9px] font-bold text-[#d9202c]">
                            {currency.format(
                              item.product.price * item.quantity,
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              changeCartQuantity(item.productId, -1)
                            }
                            aria-label={`Diminuir ${item.product.name}`}
                            className="grid size-7 place-items-center rounded-lg border border-[#ebe5e1] text-[#776f6b]"
                          >
                            <Minus size={13} />
                          </button>
                          <span className="min-w-5 text-center text-[10px] font-extrabold">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              changeCartQuantity(item.productId, 1)
                            }
                            aria-label={`Aumentar ${item.product.name}`}
                            className="grid size-7 place-items-center rounded-lg border border-[#ebe5e1] text-[#d9202c]"
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>

                <div className="mt-4 border-t border-[#ebe5e1] pt-4">
                  <span className="text-[9px] font-extrabold uppercase tracking-[.13em] text-[#9c928d]">
                    Forma de pagamento
                  </span>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {[
                      { id: "Pix" as const, icon: QrCode },
                      { id: "Dinheiro" as const, icon: Banknote },
                      { id: "Cartão" as const, icon: CreditCard },
                    ].map((method) => {
                      const Icon = method.icon;
                      return (
                        <button
                          key={method.id}
                          type="button"
                          onClick={() => setPaymentMethod(method.id)}
                          className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border text-[9px] font-extrabold transition ${
                            paymentMethod === method.id
                              ? "border-[#d9202c] bg-[#fff0f1] text-[#d9202c]"
                              : "border-[#ebe5e1] text-[#776f6b]"
                          }`}
                        >
                          <Icon size={18} />
                          {method.id}
                        </button>
                      );
                    })}
                  </div>
                  {paymentMethod === "Dinheiro" && (
                    <label className="mt-3 block">
                      <span className="mb-1 block text-[9px] font-bold text-[#776f6b]">
                        Valor recebido
                      </span>
                      <input
                        value={cashReceived}
                        onChange={(event) => setCashReceived(event.target.value)}
                        inputMode="decimal"
                        placeholder="R$ 0,00"
                        className="h-10 w-full rounded-xl border border-[#ebe5e1] px-3 text-xs outline-none focus:border-[#d9202c]"
                      />
                      {Number(cashReceived.replace(",", ".")) >= cartTotal &&
                        cartTotal > 0 && (
                          <span className="mt-1 block text-[9px] font-bold text-[#27865d]">
                            Troco:{" "}
                            {currency.format(
                              Number(cashReceived.replace(",", ".")) -
                                cartTotal,
                            )}
                          </span>
                        )}
                    </label>
                  )}
                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      <span className="block text-[9px] text-[#776f6b]">
                        Total do pedido
                      </span>
                      <strong className="text-2xl tracking-[-.04em]">
                        {currency.format(cartTotal)}
                      </strong>
                    </div>
                    <span className="text-[9px] text-[#8d8581]">
                      {cart.reduce((sum, item) => sum + item.quantity, 0)} item(ns)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={finishSale}
                    data-testid="finish-sale"
                    disabled={!cartDetails.length || !cashOpen}
                    className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#d9202c] px-4 text-xs font-extrabold text-white shadow-[0_10px_22px_rgba(217,32,44,.22)] transition hover:bg-[#b41622] disabled:cursor-not-allowed disabled:bg-[#d8cfcb] disabled:shadow-none"
                  >
                    <Check size={18} />
                    Finalizar venda
                  </button>
                </div>
              </aside>
            </div>
          </div>
        )}

        {activeView === "estoque" && (
          <div className="mx-auto w-full max-w-[1480px] p-4 sm:p-6 lg:p-9">
            <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <span className="text-[9px] font-extrabold uppercase tracking-[.13em] text-[#d9202c]">
                  Controle de produtos
                </span>
                <h1 className="text-2xl font-extrabold tracking-[-.04em] sm:text-3xl">
                  Estoque
                </h1>
                <p className="mt-1 text-xs text-[#776f6b]">
                  Veja o que tem disponível e planeje a próxima compra.
                </p>
              </div>
              <button
                type="button"
                onClick={() => openStockModal()}
                data-testid="open-stock-modal"
                className="flex min-h-11 items-center justify-center gap-2 self-start rounded-xl bg-[#d9202c] px-4 text-xs font-extrabold text-white shadow-lg sm:self-auto"
              >
                <Plus size={18} />
                Registrar entrada
              </button>
            </div>

            <section className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  label: "Itens cadastrados",
                  value: products.length,
                  helper: "Produtos no cardápio",
                  icon: Boxes,
                  colors: "bg-[#f1eefc] text-[#7458b4]",
                },
                {
                  label: "Estoque saudável",
                  value: products.length - lowStock.length,
                  helper: "Acima do mínimo",
                  icon: CheckCircle2,
                  colors: "bg-[#eaf8f1] text-[#27865d]",
                },
                {
                  label: "Precisam de reposição",
                  value: lowStock.length,
                  helper: "No mínimo ou abaixo",
                  icon: AlertTriangle,
                  colors: "bg-[#fff2e8] text-[#d76822]",
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <article
                    key={item.label}
                    className="flex items-center gap-3 rounded-2xl border border-[#ebe5e1] bg-white p-4 shadow-sm"
                  >
                    <span
                      className={`grid size-11 place-items-center rounded-xl ${item.colors}`}
                    >
                      <Icon size={21} />
                    </span>
                    <div>
                      <span className="block text-[9px] font-semibold text-[#776f6b]">
                        {item.label}
                      </span>
                      <strong className="text-xl">{item.value}</strong>
                      <small className="ml-2 text-[8px] text-[#9c928d]">
                        {item.helper}
                      </small>
                    </div>
                  </article>
                );
              })}
            </section>

            <section className="mt-4 overflow-hidden rounded-[20px] border border-[#ebe5e1] bg-white shadow-[0_7px_22px_rgba(66,45,37,.035)]">
              <div className="flex flex-col gap-3 border-b border-[#ebe5e1] p-4 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search
                    size={17}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9c928d]"
                  />
                  <input
                    value={stockSearch}
                    onChange={(event) => setStockSearch(event.target.value)}
                    placeholder="Buscar produto no estoque..."
                    aria-label="Buscar no estoque"
                    className="h-10 w-full rounded-xl border border-[#ebe5e1] bg-[#faf8f6] pl-10 pr-3 text-xs outline-none focus:border-[#d9202c]"
                  />
                </div>
                <select
                  value={stockFilter}
                  onChange={(event) =>
                    setStockFilter(
                      event.target.value as "Todos" | "Baixo" | "Normal",
                    )
                  }
                  aria-label="Filtrar situação do estoque"
                  className="h-10 rounded-xl border border-[#ebe5e1] bg-white px-3 text-[10px] font-bold outline-none"
                >
                  <option>Todos</option>
                  <option>Baixo</option>
                  <option>Normal</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left">
                  <thead className="bg-[#faf8f6] text-[8px] font-extrabold uppercase tracking-[.12em] text-[#8d8581]">
                    <tr>
                      <th className="px-5 py-3">Produto</th>
                      <th className="px-4 py-3">Categoria</th>
                      <th className="px-4 py-3">Quantidade</th>
                      <th className="px-4 py-3">Estoque mínimo</th>
                      <th className="px-4 py-3">Situação</th>
                      <th className="px-5 py-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eee9e5]">
                    {filteredStock.map((product) => {
                      const low = product.stock <= product.minimum;
                      return (
                        <tr key={product.id} className="hover:bg-[#fdfbf9]">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <span className="grid size-9 place-items-center rounded-xl bg-[#fff7ec] text-lg">
                                {product.emoji}
                              </span>
                              <div>
                                <strong className="block text-[10px]">
                                  {product.name}
                                </strong>
                                <span className="text-[8px] text-[#9c928d]">
                                  {currency.format(product.price)}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[9px] text-[#776f6b]">
                            {product.category}
                          </td>
                          <td className="px-4 py-3">
                            <strong
                              className={`text-sm ${
                                low ? "text-[#d76822]" : ""
                              }`}
                            >
                              {product.stock}
                            </strong>
                            <span className="ml-1 text-[8px] text-[#9c928d]">
                              un.
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[9px] text-[#776f6b]">
                            {product.minimum} un.
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[8px] font-extrabold ${
                                low
                                  ? "bg-[#fff2e8] text-[#d76822]"
                                  : "bg-[#eaf8f1] text-[#27865d]"
                              }`}
                            >
                              <i
                                className={`size-1.5 rounded-full ${
                                  low ? "bg-[#d76822]" : "bg-[#27865d]"
                                }`}
                              />
                              {low ? "Estoque baixo" : "Normal"}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => openStockModal(product.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#ebe5e1] px-2 py-1.5 text-[8px] font-extrabold text-[#d9202c] transition hover:bg-[#fff0f1]"
                            >
                              <Plus size={13} />
                              Repor
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#f1dfaf] bg-[#fff9e9] p-4">
              <Sparkles size={18} className="shrink-0 text-[#b27a00]" />
              <div>
                <strong className="block text-[10px] text-[#8d6100]">
                  Modelo recomendado para a versão real
                </strong>
                <p className="mt-1 text-[9px] leading-4 text-[#8d6e2e]">
                  Bebidas, pastel, coxinha e embalagens podem ser controlados
                  por unidade. Já os hambúrgueres devem usar ficha técnica:
                  vender um X-Bacon diminui pão, carne, queijo, ovo e bacon.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeView === "financeiro" && (
          <div className="mx-auto w-full max-w-[1480px] p-4 sm:p-6 lg:p-9">
            <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <span className="text-[9px] font-extrabold uppercase tracking-[.13em] text-[#d9202c]">
                  Entradas e saídas
                </span>
                <h1 className="text-2xl font-extrabold tracking-[-.04em] sm:text-3xl">
                  Financeiro
                </h1>
                <p className="mt-1 text-xs text-[#776f6b]">
                  Um resumo simples para saber como foi o dia.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCashOpen((current) => !current);
                    showToast(
                      cashOpen ? "Caixa fechado." : "Caixa aberto para vendas.",
                      "info",
                    );
                  }}
                  className="min-h-11 rounded-xl border border-[#ebe5e1] bg-white px-4 text-[10px] font-extrabold"
                >
                  {cashOpen ? "Fechar caixa" : "Abrir caixa"}
                </button>
                <button
                  type="button"
                  onClick={() => setModal("expense")}
                  data-testid="open-expense-modal"
                  className="flex min-h-11 items-center gap-2 rounded-xl bg-[#302b29] px-4 text-[10px] font-extrabold text-white"
                >
                  <Minus size={17} />
                  Registrar saída
                </button>
              </div>
            </div>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Entradas de hoje",
                  value: revenue,
                  helper: `${todaySales.length} vendas`,
                  icon: ArrowUpRight,
                  colors: "bg-[#eaf8f1] text-[#27865d]",
                },
                {
                  label: "Saídas de hoje",
                  value: expenseTotal,
                  helper: `${todayExpenses.length} lançamentos`,
                  icon: ArrowDownRight,
                  colors: "bg-[#fff0f1] text-[#d9202c]",
                },
                {
                  label: "Resultado do dia",
                  value: revenue - expenseTotal,
                  helper: "Antes de outros custos",
                  icon: CircleDollarSign,
                  colors: "bg-[#fff8de] text-[#a97300]",
                },
                {
                  label: "Saldo em caixa",
                  value: cashBalance,
                  helper: `Abertura ilustrativa: ${currency.format(openingBalance)}`,
                  icon: WalletCards,
                  colors: "bg-[#f1eefc] text-[#7458b4]",
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <article
                    key={item.label}
                    className="rounded-2xl border border-[#ebe5e1] bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold text-[#776f6b]">
                        {item.label}
                      </span>
                      <span
                        className={`grid size-9 place-items-center rounded-xl ${item.colors}`}
                      >
                        <Icon size={18} />
                      </span>
                    </div>
                    <strong className="mt-3 block text-2xl tracking-[-.04em]">
                      {currency.format(item.value)}
                    </strong>
                    <small className="text-[8px] text-[#9c928d]">
                      {item.helper}
                    </small>
                  </article>
                );
              })}
            </section>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
              <section className="overflow-hidden rounded-[20px] border border-[#ebe5e1] bg-white shadow-sm">
                <div className="flex items-start justify-between border-b border-[#ebe5e1] p-5">
                  <div>
                    <span className="text-[9px] font-extrabold uppercase tracking-[.13em] text-[#9c928d]">
                      Fluxo do dia
                    </span>
                    <h2 className="text-base font-extrabold">
                      Últimos lançamentos
                    </h2>
                  </div>
                  <span className="rounded-full bg-[#f7f5f2] px-2 py-1 text-[8px] font-bold text-[#776f6b]">
                    Hoje
                  </span>
                </div>
                <div className="divide-y divide-[#eee9e5]">
                  {transactions.map((transaction) => (
                    <article
                      key={transaction.id}
                      className="flex items-center gap-3 px-5 py-3"
                    >
                      <span
                        className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                          transaction.kind === "entrada"
                            ? "bg-[#eaf8f1] text-[#27865d]"
                            : "bg-[#fff0f1] text-[#d9202c]"
                        }`}
                      >
                        {transaction.kind === "entrada" ? (
                          <ArrowUpRight size={17} />
                        ) : (
                          <ArrowDownRight size={17} />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <strong className="block truncate text-[10px]">
                          {transaction.description}
                        </strong>
                        <span className="text-[8px] text-[#9c928d]">
                          {formatTime(transaction.timestamp)} •{" "}
                          {transaction.detail}
                        </span>
                      </div>
                      <strong
                        className={`text-[11px] ${
                          transaction.kind === "entrada"
                            ? "text-[#27865d]"
                            : "text-[#d9202c]"
                        }`}
                      >
                        {transaction.kind === "entrada" ? "+" : "-"}{" "}
                        {currency.format(transaction.amount)}
                      </strong>
                    </article>
                  ))}
                  {!transactions.length && (
                    <div className="grid min-h-56 place-items-center text-center">
                      <div>
                        <ReceiptText
                          size={30}
                          className="mx-auto text-[#c7beba]"
                        />
                        <strong className="mt-2 block text-[11px]">
                          Nenhum lançamento hoje
                        </strong>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-[20px] border border-[#ebe5e1] bg-white p-5 shadow-sm">
                <span className="text-[9px] font-extrabold uppercase tracking-[.13em] text-[#9c928d]">
                  Recebimentos
                </span>
                <h2 className="text-base font-extrabold">Por forma de pagamento</h2>
                <div className="mt-5 space-y-5">
                  {[
                    { id: "Pix" as const, icon: QrCode, color: "#27865d" },
                    {
                      id: "Dinheiro" as const,
                      icon: Banknote,
                      color: "#d9202c",
                    },
                    {
                      id: "Cartão" as const,
                      icon: CreditCard,
                      color: "#7458b4",
                    },
                  ].map((method) => {
                    const Icon = method.icon;
                    const percentage = revenue
                      ? (paymentTotals[method.id] / revenue) * 100
                      : 0;
                    return (
                      <div key={method.id}>
                        <div className="mb-2 flex items-center gap-2">
                          <Icon size={16} style={{ color: method.color }} />
                          <span className="flex-1 text-[10px] font-bold">
                            {method.id}
                          </span>
                          <strong className="text-[10px]">
                            {currency.format(paymentTotals[method.id])}
                          </strong>
                          <span className="w-9 text-right text-[8px] text-[#9c928d]">
                            {percentage.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[#f1eeeb]">
                          <i
                            className="block h-full rounded-full"
                            style={{
                              width: `${percentage}%`,
                              background: method.color,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-6 rounded-2xl bg-[#f7f5f2] p-4">
                  <strong className="block text-[10px]">
                    Controle gerencial simples
                  </strong>
                  <p className="mt-1 text-[8px] leading-4 text-[#776f6b]">
                    Este painel ajuda a organizar caixa, compras e vendas. A
                    escrituração contábil e fiscal oficial deverá ser validada
                    com contador.
                  </p>
                </div>
              </section>
            </div>
          </div>
        )}

        {activeView === "musica" && (
          <div className="mx-auto w-full max-w-[1240px] p-4 sm:p-6 lg:p-9">
            <div className="mb-5">
              <span className="text-[9px] font-extrabold uppercase tracking-[.13em] text-[#d9202c]">
                Um cantinho para o MC Poolblay
              </span>
              <h1 className="text-2xl font-extrabold tracking-[-.04em] sm:text-3xl">
                Música ambiente
              </h1>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-[#776f6b]">
                Importe músicas que já estejam salvas legalmente no computador,
                organize a fila e toque sem misturar esta função com o caixa.
              </p>
            </div>

            <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#272220] to-[#161312] p-5 text-white shadow-2xl sm:p-8">
              <div className="absolute -right-20 -top-20 size-72 rounded-full border-[50px] border-[#d9202c]/10" />
              <div className="relative z-10 grid gap-7 lg:grid-cols-[1fr_320px] lg:items-center">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#d9202c]/15 px-3 py-2 text-[9px] font-extrabold text-[#ff8790]">
                    <Music2 size={14} />
                    Gerenciador local • Beta
                  </span>
                  <h2 className="mt-5 max-w-lg text-2xl font-extrabold tracking-[-.04em] sm:text-4xl">
                    O clima da Pool, do jeito de vocês.
                  </h2>
                  <p className="mt-3 max-w-xl text-[10px] leading-5 text-white/50 sm:text-xs">
                    O navegador usa a saída de som escolhida no Windows. Basta
                    conectar a caixa Bluetooth no computador e selecioná-la nas
                    configurações de áudio.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-[#d9202c] px-4 text-[10px] font-extrabold shadow-lg">
                      <Upload size={17} />
                      Importar músicas
                      <input
                        type="file"
                        accept="audio/*"
                        multiple
                        onChange={handleAudioFiles}
                        className="sr-only"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        showToast(
                          "Conecte a caixa nas configurações de Bluetooth do Windows; o sistema usará essa saída.",
                          "info",
                        )
                      }
                      className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-[10px] font-extrabold text-white/75"
                    >
                      <Bluetooth size={17} />
                      Como conectar
                    </button>
                  </div>
                </div>

                <div className="rounded-[22px] border border-white/10 bg-white/7 p-5 backdrop-blur">
                  <div className="flex items-center gap-3">
                    <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#d9202c] to-[#8f0d16]">
                      <Music2 size={25} />
                    </span>
                    <div className="min-w-0">
                      <span className="text-[8px] uppercase tracking-[.14em] text-white/35">
                        Tocando agora
                      </span>
                      <strong className="block truncate text-sm">
                        {currentTrack?.name ?? "Nenhuma música selecionada"}
                      </strong>
                      <span className="text-[8px] text-white/35">
                        {currentTrack?.size ?? "Importe um arquivo de áudio"}
                      </span>
                    </div>
                  </div>
                  <audio
                    ref={audioRef}
                    src={currentTrack?.url}
                    onEnded={() => moveTrack(1)}
                    onPause={() => setIsPlaying(false)}
                  />
                  <div className="mt-5 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => moveTrack(-1)}
                      aria-label="Música anterior"
                      className="grid size-9 place-items-center text-white/55"
                    >
                      <SkipBack size={19} />
                    </button>
                    <button
                      type="button"
                      onClick={togglePlay}
                      aria-label={isPlaying ? "Pausar" : "Reproduzir"}
                      className="grid size-12 place-items-center rounded-full bg-white text-[#211e1d] shadow-xl"
                    >
                      {isPlaying ? <Pause size={21} /> : <Play size={21} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => moveTrack(1)}
                      aria-label="Próxima música"
                      className="grid size-9 place-items-center text-white/55"
                    >
                      <SkipForward size={19} />
                    </button>
                  </div>
                  <div className="mt-5 flex items-center gap-3">
                    <Volume2 size={16} className="text-white/45" />
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={volume}
                      onChange={(event) => setVolume(Number(event.target.value))}
                      aria-label="Volume"
                      className="audio-range w-full"
                    />
                    <span className="w-7 text-right text-[8px] text-white/35">
                      {volume}%
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_310px]">
              <section className="overflow-hidden rounded-[20px] border border-[#ebe5e1] bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-[#ebe5e1] p-5">
                  <div>
                    <span className="text-[9px] font-extrabold uppercase tracking-[.13em] text-[#9c928d]">
                      Nesta sessão
                    </span>
                    <h2 className="text-base font-extrabold">Fila de reprodução</h2>
                  </div>
                  <span className="rounded-full bg-[#f7f5f2] px-2 py-1 text-[8px] font-bold text-[#776f6b]">
                    {tracks.length} faixa(s)
                  </span>
                </div>
                {!tracks.length ? (
                  <div className="grid min-h-64 place-items-center p-6 text-center">
                    <div>
                      <FileAudio
                        size={34}
                        className="mx-auto text-[#c7beba]"
                      />
                      <strong className="mt-3 block text-xs">
                        A fila está vazia
                      </strong>
                      <span className="mt-1 block text-[9px] text-[#8d8581]">
                        Importe MP3, WAV, OGG ou outro áudio compatível.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-[#eee9e5]">
                    {tracks.map((track, index) => (
                      <button
                        key={track.id}
                        type="button"
                        onClick={() => selectTrack(index)}
                        className={`flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-[#faf8f6] ${
                          currentTrackIndex === index ? "bg-[#fff7f7]" : ""
                        }`}
                      >
                        <span
                          className={`grid size-9 place-items-center rounded-xl ${
                            currentTrackIndex === index
                              ? "bg-[#d9202c] text-white"
                              : "bg-[#f7f5f2] text-[#776f6b]"
                          }`}
                        >
                          {currentTrackIndex === index && isPlaying ? (
                            <Volume2 size={16} />
                          ) : (
                            <Music2 size={16} />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <strong className="block truncate text-[10px]">
                            {track.name}
                          </strong>
                          <span className="text-[8px] text-[#9c928d]">
                            Arquivo local • {track.size}
                          </span>
                        </div>
                        <Play size={15} className="text-[#d9202c]" />
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <aside className="rounded-[20px] border border-[#ebe5e1] bg-white p-5 shadow-sm">
                <span className="grid size-10 place-items-center rounded-xl bg-[#fff8de] text-[#a97300]">
                  <ListMusic size={20} />
                </span>
                <h2 className="mt-4 text-base font-extrabold">
                  O que entra depois
                </h2>
                <ul className="mt-3 space-y-3">
                  {[
                    "Criar e renomear playlists",
                    "Continuar a música após trocar de tela",
                    "Salvar a biblioteca no computador",
                    "Modo festa com fila automática",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-[9px] leading-4 text-[#776f6b]"
                    >
                      <CheckCircle2
                        size={14}
                        className="mt-0.5 shrink-0 text-[#27865d]"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-5 rounded-xl bg-[#fff0f1] p-3">
                  <strong className="block text-[9px] text-[#b41622]">
                    Sobre downloads
                  </strong>
                  <p className="mt-1 text-[8px] leading-4 text-[#9b555b]">
                    O sistema deverá trabalhar apenas com arquivos próprios,
                    licenciados ou obtidos por fontes que autorizem o download.
                  </p>
                </div>
              </aside>
            </div>
          </div>
        )}
      </main>

      <nav
        className="fixed bottom-3 left-3 right-3 z-40 grid grid-cols-5 rounded-2xl border border-white/10 bg-[#211e1d]/96 p-1.5 text-white shadow-2xl backdrop-blur-xl lg:hidden"
        aria-label="Navegação móvel"
      >
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveView(item.id)}
              className={`flex min-h-[50px] flex-col items-center justify-center gap-1 rounded-xl text-[7px] font-bold ${
                active ? "bg-[#d9202c] text-white" : "text-white/45"
              }`}
            >
              <Icon size={18} />
              {item.id === "venda" ? "Venda" : item.label}
            </button>
          );
        })}
      </nav>

      {modal && (
        <div
          role="presentation"
          onClick={() => setModal(null)}
          className="fixed inset-0 z-50 grid place-items-center bg-[#211e1d]/55 p-4 backdrop-blur-sm"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "stock"
                ? "Registrar entrada de estoque"
                : "Registrar saída financeira"
            }
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-[22px] bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[9px] font-extrabold uppercase tracking-[.13em] text-[#d9202c]">
                  {modal === "stock" ? "Reposição" : "Financeiro"}
                </span>
                <h2 className="text-xl font-extrabold tracking-tight">
                  {modal === "stock"
                    ? "Registrar entrada"
                    : "Registrar saída"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                aria-label="Fechar"
                className="grid size-9 place-items-center rounded-xl bg-[#f7f5f2] text-[#776f6b]"
              >
                <X size={18} />
              </button>
            </div>

            {modal === "stock" ? (
              <form onSubmit={submitStock} className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-[9px] font-extrabold text-[#776f6b]">
                    Produto
                  </span>
                  <select
                    value={stockForm.productId}
                    onChange={(event) =>
                      setStockForm((current) => ({
                        ...current,
                        productId: event.target.value,
                      }))
                    }
                    className="h-11 w-full rounded-xl border border-[#ebe5e1] bg-white px-3 text-xs outline-none focus:border-[#d9202c]"
                  >
                    {products.map((product) => (
                      <option value={product.id} key={product.id}>
                        {product.name} — atual: {product.stock}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-[9px] font-extrabold text-[#776f6b]">
                      Quantidade
                    </span>
                    <input
                      required
                      type="number"
                      min="1"
                      value={stockForm.quantity}
                      onChange={(event) =>
                        setStockForm((current) => ({
                          ...current,
                          quantity: event.target.value,
                        }))
                      }
                      className="h-11 w-full rounded-xl border border-[#ebe5e1] px-3 text-xs outline-none focus:border-[#d9202c]"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[9px] font-extrabold text-[#776f6b]">
                      Custo total (opcional)
                    </span>
                    <input
                      inputMode="decimal"
                      value={stockForm.cost}
                      onChange={(event) =>
                        setStockForm((current) => ({
                          ...current,
                          cost: event.target.value,
                        }))
                      }
                      placeholder="R$ 0,00"
                      className="h-11 w-full rounded-xl border border-[#ebe5e1] px-3 text-xs outline-none focus:border-[#d9202c]"
                    />
                  </label>
                </div>
                <div className="rounded-xl bg-[#fff9e9] p-3 text-[8px] leading-4 text-[#8d6e2e]">
                  Se informar o custo, o sistema também criará uma saída no
                  financeiro.
                </div>
                <button
                  type="submit"
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#d9202c] text-xs font-extrabold text-white"
                >
                  <Check size={18} />
                  Salvar entrada
                </button>
              </form>
            ) : (
              <form onSubmit={submitExpense} className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-[9px] font-extrabold text-[#776f6b]">
                    Descrição
                  </span>
                  <input
                    required
                    value={expenseForm.description}
                    onChange={(event) =>
                      setExpenseForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Ex.: compra de carne e pão"
                    className="h-11 w-full rounded-xl border border-[#ebe5e1] px-3 text-xs outline-none focus:border-[#d9202c]"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-[9px] font-extrabold text-[#776f6b]">
                      Categoria
                    </span>
                    <select
                      value={expenseForm.category}
                      onChange={(event) =>
                        setExpenseForm((current) => ({
                          ...current,
                          category: event.target.value,
                        }))
                      }
                      className="h-11 w-full rounded-xl border border-[#ebe5e1] bg-white px-3 text-xs outline-none"
                    >
                      <option>Matéria-prima</option>
                      <option>Bebidas</option>
                      <option>Embalagens</option>
                      <option>Gás</option>
                      <option>Manutenção</option>
                      <option>Outros</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[9px] font-extrabold text-[#776f6b]">
                      Valor
                    </span>
                    <input
                      required
                      inputMode="decimal"
                      value={expenseForm.amount}
                      onChange={(event) =>
                        setExpenseForm((current) => ({
                          ...current,
                          amount: event.target.value,
                        }))
                      }
                      placeholder="R$ 0,00"
                      className="h-11 w-full rounded-xl border border-[#ebe5e1] px-3 text-xs outline-none focus:border-[#d9202c]"
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#302b29] text-xs font-extrabold text-white"
                >
                  <Check size={18} />
                  Salvar saída
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-[82px] right-4 z-[60] flex max-w-sm items-center gap-3 rounded-2xl border bg-white p-3 pr-5 text-[10px] font-bold shadow-2xl lg:bottom-5 ${
            toast.tone === "success"
              ? "border-[#cdebdc] text-[#23734f]"
              : toast.tone === "warning"
                ? "border-[#f1dfaf] text-[#8d6100]"
                : "border-[#ddd5f2] text-[#5e4893]"
          }`}
        >
          {toast.tone === "success" ? (
            <CheckCircle2 size={19} />
          ) : toast.tone === "warning" ? (
            <AlertTriangle size={19} />
          ) : (
            <Sparkles size={19} />
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
}
