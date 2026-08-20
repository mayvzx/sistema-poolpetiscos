"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
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
  DatabaseBackup,
  Download,
  FileAudio,
  ListMusic,
  LoaderCircle,
  LogOut,
  MessageSquareText,
  Minus,
  Music2,
  Package,
  Pause,
  Pencil,
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
  Trash2,
  Upload,
  UserRound,
  UsersRound,
  Volume2,
  WalletCards,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import Image from "next/image";
import { StartupScreen } from "./startup-screen";
import { OperatorLogin } from "./operator-login";
import { SettingsPanel } from "./settings-panel";
import {
  DEFAULT_DISPLAY_PREFERENCES,
  loadDisplayPreferences,
  resolveTheme,
  saveDisplayPreferences,
  type DisplayPreferences,
} from "./display-preferences";
import {
  buildDailyRevenue,
  calculateCashBalance,
  createRecordId,
  currency,
  formatDateKey,
  formatTime,
  getBusinessStatus,
  getGreeting,
  getRecifeClock,
  normalizeText,
  parseAmount,
  RECIFE_TIME_ZONE,
  roundMoney,
  shortCurrency,
} from "./domain";
import { INITIAL_PRODUCTS } from "./catalog-data";
import {
  createBackup,
  parseBackup,
  parsePoolState,
  parseStoredState,
  STORAGE_KEY,
} from "./persistence";
import {
  formatOrderWait,
  isActiveOrder,
  nextOrderStatus,
  ORDER_STATUS_LABELS,
  previousOrderStatus,
  sortOrdersNewestFirst,
  sortOrdersOldestFirst,
} from "./orders";
import {
  buildOperatorSalesSummary,
  getOperatorProfile,
  isOperatorId,
  OPERATOR_PROFILES,
  OPERATOR_SESSION_KEY,
} from "./operators";
import {
  downloadLocalDatabase,
  loadLocalPoolState,
  LocalStateConflictError,
  saveLocalPoolState,
} from "./local-storage-companion";
import {
  checkMusicCompanion,
  getTrackDownloadJob,
  listCompanionTracks,
  MUSIC_COMPANION_URL,
  queueTrackDownload,
  type MusicDownloadJob,
} from "./music-companion";
import {
  categories,
  createInitialPoolState,
  createProductForm,
  isCompleteWebUrl,
  navigation,
  parsePendingStateSync,
  parseYoutubeSearchResults,
  PENDING_SYNC_KEY,
  productCategories,
  readCompanionError,
  viewFromLocation,
  type PendingStateSync,
  type ProductFormState,
  type YoutubeSearchResult,
  type YoutubeSearchStatus,
} from "./pool-app-config";
import type {
  CartItem,
  CashClosure,
  CashMovement,
  Expense,
  OrderStatus,
  OperatorId,
  OperatorCredential,
  OperatorCredentials,
  PaymentMethod,
  PersistedPoolState,
  Product,
  Sale,
  SaleItem,
  Toast,
  Track,
  Transaction,
  View,
} from "./types";

const ORDER_STAGE_CONFIG = {
  aguardando: {
    label: "Aguardando",
    helper: "Pedidos recebidos, por ordem de chegada.",
    empty: "Nenhuma comanda esperando.",
    badge: "border-[#efd38c] bg-[#fff8de] text-[#8d6100]",
    accent: "border-t-[#dc9b19]",
    action: "Iniciar preparo",
  },
  "em-preparo": {
    label: "Em preparo",
    helper: "Lanches que estão sendo preparados agora.",
    empty: "Nenhum pedido em preparo.",
    badge: "border-[#f1b7bc] bg-[#fff0f1] text-[#b41622]",
    accent: "border-t-[#d9202c]",
    action: "Marcar como pronto",
  },
  pronto: {
    label: "Pronto",
    helper: "Pedidos finalizados, aguardando a entrega.",
    empty: "Nenhum pedido pronto para entregar.",
    badge: "border-[#a9d9c2] bg-[#eaf8f1] text-[#23734f]",
    accent: "border-t-[#27865d]",
    action: "Marcar como entregue",
  },
  entregue: {
    label: "Entregue",
    helper: "Comandas concluídas e guardadas no histórico.",
    empty: "Nenhuma comanda concluída.",
    badge: "border-[#d9d2ce] bg-[#f7f5f2] text-[#5f5753]",
    accent: "border-t-[#776f6b]",
    action: "",
  },
} satisfies Record<
  OrderStatus,
  {
    label: string;
    helper: string;
    empty: string;
    badge: string;
    accent: string;
    action: string;
  }
>;

const ACTIVE_ORDER_COLUMNS: Array<
  Extract<OrderStatus, "aguardando" | "em-preparo" | "pronto">
> = ["aguardando", "em-preparo", "pronto"];

export default function PoolPetiscosApp() {
  const [activeView, setActiveView] = useState<View>("inicio");
  const [now, setNow] = useState<Date | null>(null);
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cashOpen, setCashOpen] = useState(false);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [cashOpenedAt, setCashOpenedAt] = useState(() => Date.now());
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);
  const [cashClosures, setCashClosures] = useState<CashClosure[]>([]);
  const [operatorCredentials, setOperatorCredentials] =
    useState<OperatorCredentials>({});
  const [pinRecoveryCredential, setPinRecoveryCredential] =
    useState<OperatorCredential>();
  const [displayPreferences, setDisplayPreferences] =
    useState<DisplayPreferences>(DEFAULT_DISPLAY_PREFERENCES);
  const [displayPreferencesReady, setDisplayPreferencesReady] = useState(false);
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [operatorSessionReady, setOperatorSessionReady] = useState(false);
  const [activeOperatorId, setActiveOperatorId] =
    useState<OperatorId | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saleSearch, setSaleSearch] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("Todos");
  const [customerName, setCustomerName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Pix");
  const [cashReceived, setCashReceived] = useState("");
  const [ordersMode, setOrdersMode] = useState<"andamento" | "historico">(
    "andamento",
  );
  const [stockSearch, setStockSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<"Todos" | "Baixo" | "Normal">(
    "Todos",
  );
  const [modal, setModal] = useState<
    | "stock"
    | "product"
    | "product-delete"
    | "expense"
    | "cash-open"
    | "cash-close"
    | "cash-movement"
    | null
  >(null);
  const [stockForm, setStockForm] = useState({
    productId: INITIAL_PRODUCTS[0].id,
    quantity: "",
    cost: "",
    payment: "Dinheiro" as PaymentMethod,
  });
  const [productForm, setProductForm] = useState<ProductFormState>(() =>
    createProductForm(),
  );
  const [productDeleteId, setProductDeleteId] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState({
    description: "",
    category: "Matéria-prima",
    amount: "",
    payment: "Dinheiro" as PaymentMethod,
  });
  const [cashOpenForm, setCashOpenForm] = useState("");
  const [cashCloseForm, setCashCloseForm] = useState("");
  const [cashMovementForm, setCashMovementForm] = useState({
    kind: "sangria" as CashMovement["kind"],
    description: "",
    amount: "",
  });
  const [toast, setToast] = useState<Toast | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(70);
  const [musicCompanionStatus, setMusicCompanionStatus] = useState<
    "checking" | "ready" | "unavailable"
  >("checking");
  const [downloadSourceUrl, setDownloadSourceUrl] = useState("");
  const [downloadJob, setDownloadJob] = useState<MusicDownloadJob | null>(null);
  const [musicDownloadBusy, setMusicDownloadBusy] = useState(false);
  const [youtubeSearchResults, setYoutubeSearchResults] = useState<
    YoutubeSearchResult[]
  >([]);
  const [youtubeSearchStatus, setYoutubeSearchStatus] =
    useState<YoutubeSearchStatus>("idle");
  const [youtubeSearchError, setYoutubeSearchError] = useState("");
  const [selectedYoutubeResult, setSelectedYoutubeResult] =
    useState<YoutubeSearchResult | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const previousViewRef = useRef<View>("inicio");
  const toastTimerRef = useRef<number | null>(null);
  const persistenceWarningRef = useRef(false);
  const tracksRef = useRef<Track[]>([]);
  const primaryStorageReadyRef = useRef(false);
  const primaryStorageRevisionRef = useRef(0);
  const primaryStorageSnapshotRef = useRef<string | null>(null);
  const primaryStorageTimerRef = useRef<number | null>(null);
  const primaryStorageWriteRef = useRef(false);
  const pendingPrimaryStateRef = useRef<PersistedPoolState | null>(null);
  const localFallbackWritableRef = useRef(true);
  const youtubeSearchQueueRef = useRef<Promise<void>>(Promise.resolve());
  const youtubeSearchSequenceRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applySystemTheme = (matches: boolean) => setSystemPrefersDark(matches);
    window.queueMicrotask(() => {
      if (cancelled) return;
      setDisplayPreferences(loadDisplayPreferences());
      applySystemTheme(media.matches);
      setDisplayPreferencesReady(true);
    });
    const onChange = (event: MediaQueryListEvent) =>
      applySystemTheme(event.matches);
    media.addEventListener("change", onChange);
    return () => {
      cancelled = true;
      media.removeEventListener("change", onChange);
    };
  }, []);

  const resolvedTheme = resolveTheme(
    displayPreferences.themeMode,
    systemPrefersDark,
  );

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.poolTheme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;
    root.style.setProperty(
      "--pool-font-scale",
      String(displayPreferences.fontScale / 100),
    );
    if (displayPreferencesReady) {
      saveDisplayPreferences(displayPreferences);
    }
  }, [displayPreferences, displayPreferencesReady, resolvedTheme]);

  useEffect(() => {
    let cancelled = false;
    window.queueMicrotask(() => {
      if (cancelled) return;
      try {
        const storedOperator = window.sessionStorage.getItem(
          OPERATOR_SESSION_KEY,
        );
        if (isOperatorId(storedOperator)) {
          setActiveOperatorId(storedOperator);
        }
      } catch {
        // A sessão continua utilizável mesmo se o navegador bloquear o storage.
      } finally {
        setOperatorSessionReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const rememberPendingSync = useCallback(
    (state: PersistedPoolState, expectedRevision: number | null) => {
      try {
        const pending = {
          state,
          expectedRevision,
          savedAt: new Date().toISOString(),
        } satisfies PendingStateSync;
        window.localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(pending));
        localFallbackWritableRef.current = true;
      } catch {
        localFallbackWritableRef.current = false;
      }
    },
    [],
  );

  const clearPendingSyncIfMatched = useCallback((serialized: string) => {
    try {
      const pending = parsePendingStateSync(
        window.localStorage.getItem(PENDING_SYNC_KEY),
      );
      if (pending && JSON.stringify(pending.state) === serialized) {
        window.localStorage.removeItem(PENDING_SYNC_KEY);
      }
    } catch {
      localFallbackWritableRef.current = false;
    }
  }, []);

  const navigateTo = useCallback((view: View) => {
    setActiveView(view);
    if (window.location.hash !== `#${view}`) {
      window.history.pushState(null, "", `#${view}`);
    }
  }, []);

  const showToast = useCallback(
    (message: string, tone: Toast["tone"] = "success") => {
      setToast({ message, tone });
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, 3200);
    },
    [],
  );

  const syncMusicCompanion = useCallback(
    async (showFeedback = false) => {
      setMusicCompanionStatus("checking");
      try {
        const [health, localTracks] = await Promise.all([
          checkMusicCompanion(),
          listCompanionTracks(),
        ]);
        const uploadedTracks = tracksRef.current.filter(
          (track) => track.source === "upload",
        );
        const nextTracks = [...uploadedTracks, ...localTracks];
        setMusicCompanionStatus(
          health.yt_dlp && health.ffmpeg ? "ready" : "unavailable",
        );
        setTracks(nextTracks);
        setCurrentTrackIndex(nextTracks.length ? 0 : -1);
        setIsPlaying(false);
        if (showFeedback) {
          showToast(
            `${localTracks.length} faixa(s) carregada(s) da biblioteca do caixa.`,
            "info",
          );
        }
      } catch {
        setMusicCompanionStatus("unavailable");
        if (showFeedback) {
          showToast(
            "O serviço de músicas está indisponível. Tente novamente em instantes.",
            "warning",
          );
        }
      }
    },
    [showToast],
  );

  const restorePoolState = useCallback((state: PersistedPoolState) => {
    setProducts(state.products);
    setSales(state.sales);
    setExpenses(state.expenses);
    setCashOpen(state.cashOpen);
    setOpeningBalance(state.openingBalance);
    setCashOpenForm(String(state.openingBalance));
    setCashOpenedAt(state.cashOpenedAt);
    setCashMovements(state.cashMovements);
    setCashClosures(state.cashClosures);
    setOperatorCredentials(state.operatorCredentials);
    setPinRecoveryCredential(state.pinRecoveryCredential);
    setCart([]);
    setCustomerName("");
    setCashReceived("");
  }, []);

  const flushPrimaryState = useCallback(async () => {
    if (
      !primaryStorageReadyRef.current ||
      primaryStorageWriteRef.current ||
      !pendingPrimaryStateRef.current
    ) {
      return;
    }

    const state = pendingPrimaryStateRef.current;
    const serialized = JSON.stringify(state);
    pendingPrimaryStateRef.current = null;

    if (serialized === primaryStorageSnapshotRef.current) {
      return;
    }

    primaryStorageWriteRef.current = true;
    try {
      const result = await saveLocalPoolState(
        state,
        primaryStorageRevisionRef.current,
      );
      primaryStorageRevisionRef.current = result.revision;
      primaryStorageSnapshotRef.current = serialized;
      clearPendingSyncIfMatched(serialized);
      persistenceWarningRef.current = false;
      if (!result.backupHealthy && !persistenceWarningRef.current) {
        persistenceWarningRef.current = true;
        showToast(
          "Os dados foram salvos, mas o backup automático precisa de atenção.",
          "warning",
        );
      }
    } catch (error) {
      if (error instanceof LocalStateConflictError) {
        primaryStorageRevisionRef.current = error.revision;
        const latestState = parsePoolState(error.state);
        if (latestState) {
          const latestSerialized = JSON.stringify(latestState);
          primaryStorageSnapshotRef.current = latestSerialized;
          pendingPrimaryStateRef.current = null;
          try {
            window.localStorage.setItem(STORAGE_KEY, latestSerialized);
            window.localStorage.removeItem(PENDING_SYNC_KEY);
            localFallbackWritableRef.current = true;
          } catch {
            localFallbackWritableRef.current = false;
          }
          restorePoolState(latestState);
          showToast(
            "Os dados foram atualizados em outro acesso. Exibimos a versão mais recente.",
            "info",
          );
        } else {
          primaryStorageReadyRef.current = false;
          showToast(
            "Os dados mudaram em outro acesso. Reabra o sistema antes de continuar.",
            "warning",
          );
        }
      } else {
        primaryStorageReadyRef.current = false;
        if (!localFallbackWritableRef.current) {
          showToast(
            "Não foi possível salvar com segurança. Exporte um backup antes de continuar.",
            "warning",
          );
        }
      }
    } finally {
      primaryStorageWriteRef.current = false;
      if (
        primaryStorageReadyRef.current &&
        pendingPrimaryStateRef.current &&
        primaryStorageTimerRef.current === null
      ) {
        primaryStorageTimerRef.current = window.setTimeout(() => {
          primaryStorageTimerRef.current = null;
          void flushPrimaryState();
        }, 300);
      }
    }
  }, [clearPendingSyncIfMatched, restorePoolState, showToast]);

  useEffect(() => {
    const updateClock = () => setNow(new Date());
    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const syncViewWithLocation = () => {
      const view = viewFromLocation();
      if (view) setActiveView(view);
    };
    syncViewWithLocation();
    window.addEventListener("popstate", syncViewWithLocation);
    return () => window.removeEventListener("popstate", syncViewWithLocation);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydratePoolState() {
      let saved: string | null = null;
      let pendingSync: PendingStateSync | null = null;
      try {
        saved = window.localStorage.getItem(STORAGE_KEY);
        pendingSync = parsePendingStateSync(
          window.localStorage.getItem(PENDING_SYNC_KEY),
        );
      } catch {
        localFallbackWritableRef.current = false;
      }

      const storedState = parseStoredState(saved);
      const fallbackState =
        pendingSync?.state ?? storedState ?? createInitialPoolState();

      try {
        const snapshot = await loadLocalPoolState();
        if (cancelled) return;

        primaryStorageReadyRef.current = true;
        primaryStorageRevisionRef.current = snapshot.revision;
        let primaryState = parsePoolState(snapshot.state);
        const pendingMatchesPrimary =
          pendingSync &&
          primaryState &&
          JSON.stringify(pendingSync.state) === JSON.stringify(primaryState);
        const serverSavedAt = snapshot.savedAt
          ? Date.parse(snapshot.savedAt)
          : Number.NEGATIVE_INFINITY;
        const pendingCanBeReplayed =
          pendingSync &&
          !pendingMatchesPrimary &&
          (primaryState === null ||
            pendingSync.expectedRevision === snapshot.revision ||
            (pendingSync.expectedRevision === null &&
              Date.parse(pendingSync.savedAt) > serverSavedAt));

        if (pendingMatchesPrimary) {
          try {
            window.localStorage.removeItem(PENDING_SYNC_KEY);
          } catch {
            localFallbackWritableRef.current = false;
          }
        } else if (pendingCanBeReplayed && pendingSync) {
          try {
            const result = await saveLocalPoolState(
              pendingSync.state,
              snapshot.revision,
            );
            if (cancelled) return;
            primaryStorageRevisionRef.current = result.revision;
            primaryState = pendingSync.state;
            try {
              window.localStorage.removeItem(PENDING_SYNC_KEY);
            } catch {
              localFallbackWritableRef.current = false;
            }
            if (!result.backupHealthy) {
              persistenceWarningRef.current = true;
              showToast(
                "Os dados foram recuperados, mas o backup automático precisa de atenção.",
                "warning",
              );
            }
          } catch (error) {
            if (error instanceof LocalStateConflictError) {
              primaryStorageRevisionRef.current = error.revision;
              primaryState = parsePoolState(error.state);
              try {
                window.localStorage.removeItem(PENDING_SYNC_KEY);
              } catch {
                localFallbackWritableRef.current = false;
              }
            } else {
              primaryStorageReadyRef.current = false;
              restorePoolState(fallbackState);
            }
          }
        } else if (pendingSync) {
          try {
            window.localStorage.removeItem(PENDING_SYNC_KEY);
          } catch {
            localFallbackWritableRef.current = false;
          }
        }

        if (primaryState) {
          const serialized = JSON.stringify(primaryState);
          primaryStorageSnapshotRef.current = serialized;
          restorePoolState(primaryState);
          try {
            window.localStorage.setItem(STORAGE_KEY, serialized);
            localFallbackWritableRef.current = true;
          } catch {
            localFallbackWritableRef.current = false;
          }
        } else if (primaryStorageReadyRef.current) {
          restorePoolState(fallbackState);
          try {
            const result = await saveLocalPoolState(
              fallbackState,
              snapshot.revision,
            );
            if (cancelled) return;
            primaryStorageRevisionRef.current = result.revision;
            primaryStorageSnapshotRef.current = JSON.stringify(fallbackState);
            clearPendingSyncIfMatched(
              primaryStorageSnapshotRef.current,
            );
            if (!result.backupHealthy) {
              persistenceWarningRef.current = true;
              showToast(
                "Os dados foram salvos, mas o backup automático precisa de atenção.",
                "warning",
              );
            }
          } catch (error) {
            if (error instanceof LocalStateConflictError) {
              primaryStorageRevisionRef.current = error.revision;
              const latestState = parsePoolState(error.state);
              if (latestState) {
                primaryStorageSnapshotRef.current =
                  JSON.stringify(latestState);
                restorePoolState(latestState);
              } else {
                primaryStorageReadyRef.current = false;
              }
            } else {
              primaryStorageReadyRef.current = false;
            }
          }
        }

        if (!snapshot.backupHealthy && !persistenceWarningRef.current) {
          persistenceWarningRef.current = true;
          showToast(
            "O backup automático precisa de atenção. Os dados continuam salvos neste caixa.",
            "warning",
          );
        }
      } catch {
        if (cancelled) return;
        primaryStorageReadyRef.current = false;
        primaryStorageSnapshotRef.current = JSON.stringify(fallbackState);
        restorePoolState(fallbackState);
      }

      if (saved && !storedState) {
        showToast(
          "A cópia anterior não pôde ser lida. Os dados iniciais foram carregados.",
          "warning",
        );
      }
      setHydrated(true);
    }

    window.queueMicrotask(() => {
      if (!cancelled) void hydratePoolState();
    });
    return () => {
      cancelled = true;
    };
  }, [clearPendingSyncIfMatched, restorePoolState, showToast]);

  useEffect(() => {
    if (!hydrated) return;
    const state = {
      products,
      sales,
      expenses,
      cashOpen,
      openingBalance,
      cashOpenedAt,
      cashMovements,
      cashClosures,
      operatorCredentials,
      ...(pinRecoveryCredential ? { pinRecoveryCredential } : {}),
    } satisfies PersistedPoolState;
    const serialized = JSON.stringify(state);

    try {
      window.localStorage.setItem(STORAGE_KEY, serialized);
      localFallbackWritableRef.current = true;
      persistenceWarningRef.current = false;
    } catch {
      localFallbackWritableRef.current = false;
      if (
        !primaryStorageReadyRef.current &&
        !persistenceWarningRef.current
      ) {
        persistenceWarningRef.current = true;
        showToast(
          "Não foi possível salvar com segurança. Exporte um backup antes de continuar.",
          "warning",
        );
      }
    }

    if (serialized === primaryStorageSnapshotRef.current) {
      return;
    }

    rememberPendingSync(
      state,
      primaryStorageReadyRef.current
        ? primaryStorageRevisionRef.current
        : null,
    );

    if (!primaryStorageReadyRef.current) return;

    pendingPrimaryStateRef.current = state;
    if (primaryStorageTimerRef.current !== null) {
      window.clearTimeout(primaryStorageTimerRef.current);
    }
    primaryStorageTimerRef.current = window.setTimeout(() => {
      primaryStorageTimerRef.current = null;
      void flushPrimaryState();
    }, 650);

    return () => {
      if (primaryStorageTimerRef.current !== null) {
        window.clearTimeout(primaryStorageTimerRef.current);
        primaryStorageTimerRef.current = null;
      }
    };
  }, [
    cashClosures,
    cashMovements,
    cashOpen,
    cashOpenedAt,
    expenses,
    hydrated,
    openingBalance,
    operatorCredentials,
    pinRecoveryCredential,
    products,
    sales,
    flushPrimaryState,
    rememberPendingSync,
    showToast,
  ]);

  useEffect(() => {
    const flushBeforeLeaving = () => {
      if (primaryStorageTimerRef.current !== null) {
        window.clearTimeout(primaryStorageTimerRef.current);
        primaryStorageTimerRef.current = null;
      }
      void flushPrimaryState();
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushBeforeLeaving();
    };
    window.addEventListener("pagehide", flushBeforeLeaving);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flushBeforeLeaving);
      document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, [flushPrimaryState]);

  useEffect(() => {
    if (!hydrated) return;
    const syncFromAnotherTab = (event: StorageEvent) => {
      if (primaryStorageReadyRef.current) return;
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      const state = parseStoredState(event.newValue);
      if (!state) return;
      restorePoolState(state);
      showToast(
        "Os dados foram atualizados por outra aba. A comanda atual foi limpa.",
        "info",
      );
    };
    window.addEventListener("storage", syncFromAnotherTab);
    return () => window.removeEventListener("storage", syncFromAnotherTab);
  }, [hydrated, restorePoolState, showToast]);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    if (!hydrated || activeView !== "musica") return;
    let cancelled = false;
    window.queueMicrotask(() => {
      if (!cancelled) void syncMusicCompanion();
    });
    return () => {
      cancelled = true;
    };
  }, [activeView, hydrated, syncMusicCompanion]);

  useEffect(() => {
    const query = downloadSourceUrl.trim();
    const sequence = ++youtubeSearchSequenceRef.current;
    if (
      !hydrated ||
      activeView !== "musica" ||
      query.length < 2 ||
      isCompleteWebUrl(query)
    ) {
      return;
    }

    const debounce = window.setTimeout(() => {
      const search = async () => {
        if (sequence !== youtubeSearchSequenceRef.current) return;

        const controller = new AbortController();
        let requestTimedOut = false;
        const requestTimeout = window.setTimeout(() => {
          requestTimedOut = true;
          controller.abort();
        }, 18_000);

        setYoutubeSearchStatus("loading");
        try {
          const response = await fetch(
            `${MUSIC_COMPANION_URL}/api/youtube/search?q=${encodeURIComponent(
              query,
            )}&limit=5`,
            {
              headers: { Accept: "application/json" },
              signal: controller.signal,
            },
          );
          const payload: unknown = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(
              readCompanionError(
                payload,
                response.status === 429
                  ? "Há outra pesquisa em andamento. Aguarde um instante."
                  : response.status === 504
                    ? "A pesquisa demorou mais do que o esperado. Tente novamente."
                    : "Não foi possível pesquisar agora. Você ainda pode colar o link da faixa.",
              ),
            );
          }
          if (sequence !== youtubeSearchSequenceRef.current) return;
          const results = parseYoutubeSearchResults(payload);
          setYoutubeSearchResults(results);
          setYoutubeSearchStatus("success");
          setYoutubeSearchError("");
        } catch (error) {
          if (sequence !== youtubeSearchSequenceRef.current) return;
          setYoutubeSearchResults([]);
          setYoutubeSearchStatus("error");
          setYoutubeSearchError(
            requestTimedOut
              ? "A pesquisa demorou mais do que o esperado. Tente novamente."
              : error instanceof Error && error.message
                ? error.message
                : "Não foi possível pesquisar agora. Você ainda pode colar o link da faixa.",
          );
        } finally {
          window.clearTimeout(requestTimeout);
        }
      };

      /*
       * Uma busca por vez evita que consultas parciais, abandonadas enquanto a
       * pessoa digita, ocupem simultaneamente os dois slots do serviço local.
       * Consultas já ultrapassadas saem da fila sem acessar a rede.
       */
      youtubeSearchQueueRef.current = youtubeSearchQueueRef.current
        .catch(() => undefined)
        .then(search);
    }, 450);

    return () => {
      window.clearTimeout(debounce);
    };
  }, [activeView, downloadSourceUrl, hydrated]);

  useEffect(
    () => () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      tracksRef.current
        .filter((track) => track.source === "upload")
        .forEach((track) => URL.revokeObjectURL(track.url));
    },
    [],
  );

  useEffect(() => {
    if (!notificationsOpen) return;
    const closeNotifications = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        notificationsRef.current &&
        !notificationsRef.current.contains(target)
      ) {
        setNotificationsOpen(false);
      }
    };
    const closeNotificationsWithKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationsOpen(false);
    };
    window.addEventListener("pointerdown", closeNotifications);
    window.addEventListener("keydown", closeNotificationsWithKeyboard);
    return () => {
      window.removeEventListener("pointerdown", closeNotifications);
      window.removeEventListener("keydown", closeNotificationsWithKeyboard);
    };
  }, [notificationsOpen]);

  useEffect(() => {
    if (!modal) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.queueMicrotask(() => dialogRef.current?.focus());

    const handleDialogKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModal(null);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1) ?? first;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleDialogKeyboard);
    return () => {
      window.removeEventListener("keydown", handleDialogKeyboard);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [modal]);

  useEffect(() => {
    if (
      !hydrated ||
      previousViewRef.current === activeView
    ) {
      return;
    }
    previousViewRef.current = activeView;
    const frame = window.requestAnimationFrame(() => {
      const heading = mainRef.current?.querySelector<HTMLElement>("h1");
      if (!heading) return;
      heading.tabIndex = -1;
      heading.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeView, hydrated]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100;
  }, [volume]);

  const todayKey = now ? formatDateKey(now.getTime()) : "";
  const todaySales = useMemo(
    () =>
      todayKey
        ? sales.filter((sale) => formatDateKey(sale.timestamp) === todayKey)
        : [],
    [sales, todayKey],
  );
  const activeOperator = activeOperatorId
    ? getOperatorProfile(activeOperatorId)
    : null;
  const operatorSalesSummary = useMemo(
    () => buildOperatorSalesSummary(todaySales),
    [todaySales],
  );
  const activeOrders = useMemo(
    () => sortOrdersOldestFirst(sales.filter(isActiveOrder)),
    [sales],
  );
  const completedOrders = useMemo(
    () =>
      sortOrdersNewestFirst(
        sales.filter((sale) => sale.orderStatus === "entregue"),
      ),
    [sales],
  );
  const ordersByStatus = useMemo(
    () => ({
      aguardando: activeOrders.filter(
        (sale) => sale.orderStatus === "aguardando",
      ),
      "em-preparo": activeOrders.filter(
        (sale) => sale.orderStatus === "em-preparo",
      ),
      pronto: activeOrders.filter((sale) => sale.orderStatus === "pronto"),
    }),
    [activeOrders],
  );
  const todayExpenses = useMemo(
    () =>
      todayKey
        ? expenses.filter(
            (expense) => formatDateKey(expense.timestamp) === todayKey,
          )
        : [],
    [expenses, todayKey],
  );
  const dailyRevenue = useMemo(
    () => (todayKey ? buildDailyRevenue(sales) : []),
    [sales, todayKey],
  );
  const recentRevenue = useMemo(
    () => dailyRevenue.reduce((total, day) => total + day.total, 0),
    [dailyRevenue],
  );
  const recentSalesCount = useMemo(() => {
    const visibleDays = new Set(dailyRevenue.map((day) => day.key));
    return sales.filter((sale) => visibleDays.has(formatDateKey(sale.timestamp)))
      .length;
  }, [dailyRevenue, sales]);
  const maxDailyRevenue = Math.max(
    1,
    ...dailyRevenue.map((day) => day.total),
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
  const sessionSales = useMemo(
    () => sales.filter((sale) => sale.timestamp >= cashOpenedAt),
    [cashOpenedAt, sales],
  );
  const sessionExpenses = useMemo(
    () => expenses.filter((expense) => expense.timestamp >= cashOpenedAt),
    [cashOpenedAt, expenses],
  );
  const sessionMovements = useMemo(
    () =>
      cashMovements.filter((movement) => movement.timestamp >= cashOpenedAt),
    [cashMovements, cashOpenedAt],
  );
  const cashSalesTotal = useMemo(
    () =>
      sessionSales
        .filter((sale) => sale.payment === "Dinheiro")
        .reduce((total, sale) => total + sale.total, 0),
    [sessionSales],
  );
  const cashExpenseTotal = useMemo(
    () =>
      sessionExpenses
        .filter((expense) => expense.payment === "Dinheiro")
        .reduce((total, expense) => total + expense.amount, 0),
    [sessionExpenses],
  );
  const cashMovementTotal = useMemo(
    () =>
      sessionMovements.reduce(
        (total, movement) =>
          total +
          (movement.kind === "suprimento" ? movement.amount : -movement.amount),
        0,
      ),
    [sessionMovements],
  );
  const cashBalance = calculateCashBalance({
    openingBalance,
    cashSalesTotal,
    cashExpenseTotal,
    cashMovementTotal,
  });
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
      roundMoney(
        cartDetails.reduce(
        (total, item) => total + item.product.price * item.quantity,
        0,
        ),
      ),
    [cartDetails],
  );
  const cashReceivedAmount = parseAmount(cashReceived);
  const cashPaymentInvalid =
    paymentMethod === "Dinheiro" &&
    (!Number.isFinite(cashReceivedAmount) ||
      cashReceivedAmount + Number.EPSILON < cartTotal);

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
          detail: `${sale.items.reduce((sum, item) => sum + item.quantity, 0)} item(ns) • ${sale.payment} • ${sale.operatorName}`,
          amount: sale.total,
          kind: "entrada" as const,
        })),
        ...todayExpenses.map((expense) => ({
          id: expense.id,
          timestamp: expense.timestamp,
          description: expense.description,
          detail: `${expense.category} • ${expense.payment}`,
          amount: expense.amount,
          kind: "saida" as const,
        })),
        ...cashMovements
          .filter(
            (movement) =>
              todayKey &&
              formatDateKey(movement.timestamp) === todayKey,
          )
          .map((movement) => ({
            id: movement.id,
            timestamp: movement.timestamp,
            description: movement.description,
            detail:
              movement.kind === "suprimento"
                ? "Suprimento de caixa"
                : "Sangria de caixa",
            amount: movement.amount,
            kind:
              movement.kind === "suprimento"
                ? ("entrada" as const)
                : ("saida" as const),
          })),
      ].sort((a, b) => b.timestamp - a.timestamp),
    [cashMovements, todayExpenses, todayKey, todaySales],
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
      timeZone: RECIFE_TIME_ZONE,
    }).format(now);
  }, [now]);

  const timeLabel = useMemo(() => {
    if (!now) return "--:--";
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: RECIFE_TIME_ZONE,
    }).format(now);
  }, [now]);

  const recifeHour = now ? getRecifeClock(now).hour : 15;
  const businessStatus = getBusinessStatus(now);

  const currentTrack =
    currentTrackIndex >= 0 ? tracks[currentTrackIndex] : undefined;
  const productToDelete =
    products.find((product) => product.id === productDeleteId) ?? null;
  const modalContent = modal
    ? {
        stock: {
          eyebrow: "Reposição",
          title: "Registrar entrada",
          aria: "Registrar entrada de estoque",
        },
        product: {
          eyebrow: productForm.id ? "Cadastro e preço" : "Novo cadastro",
          title: productForm.id ? "Editar produto e preço" : "Criar produto",
          aria: productForm.id ? "Editar produto e preço" : "Criar produto",
        },
        "product-delete": {
          eyebrow: "Ação permanente",
          title: "Excluir produto?",
          aria: "Confirmar exclusão do produto",
        },
        expense: {
          eyebrow: "Financeiro",
          title: "Registrar saída",
          aria: "Registrar saída financeira",
        },
        "cash-open": {
          eyebrow: "Caixa",
          title: "Abrir caixa",
          aria: "Abrir caixa",
        },
        "cash-close": {
          eyebrow: "Caixa",
          title: "Fechar caixa",
          aria: "Fechar caixa",
        },
        "cash-movement": {
          eyebrow: "Dinheiro físico",
          title: "Movimentar caixa",
          aria: "Registrar sangria ou suprimento",
        },
      }[modal]
    : null;

  function loginOperator(operatorId: OperatorId) {
    setActiveOperatorId(operatorId);
    try {
      window.sessionStorage.setItem(OPERATOR_SESSION_KEY, operatorId);
    } catch {
      // A identificação continua válida enquanto esta página estiver aberta.
    }
  }

  function updateOperatorCredential(
    operatorId: OperatorId,
    credential: OperatorCredential,
  ) {
    setOperatorCredentials((current) => ({
      ...current,
      [operatorId]: credential,
    }));
  }

  function changeOperator() {
    if (cart.length > 0) {
      navigateTo("venda");
      showToast(
        "Finalize a comanda atual antes de trocar de operador.",
        "warning",
      );
      return;
    }
    try {
      window.sessionStorage.removeItem(OPERATOR_SESSION_KEY);
    } catch {
      // Sem ação adicional: o estado em memória é suficiente para sair.
    }
    setNotificationsOpen(false);
    setActiveOperatorId(null);
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
      return [
        ...current,
        { productId: product.id, quantity: 1, observation: "" },
      ];
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

  function updateCartObservation(productId: string, observation: string) {
    setCart((current) =>
      current.map((item) =>
        item.productId === productId
          ? { ...item, observation: observation.slice(0, 180) }
          : item,
      ),
    );
  }

  function finishSale() {
    if (!activeOperator) {
      showToast("Escolha o operador antes de registrar a venda.", "warning");
      return;
    }
    if (!cashOpen) {
      showToast("O caixa está fechado.", "warning");
      return;
    }
    if (!cartDetails.length) {
      showToast("Adicione pelo menos um produto ao pedido.", "warning");
      return;
    }
    const orderCustomerName = customerName.trim();
    if (!orderCustomerName) {
      showToast("Informe o nome da pessoa para criar a comanda.", "warning");
      return;
    }
    const unavailableItem = cartDetails.find(
      (item) => item.quantity > item.product.stock,
    );
    if (unavailableItem) {
      showToast(
        `Revise ${unavailableItem.product.name}: o estoque disponível mudou.`,
        "warning",
      );
      return;
    }
    if (cashPaymentInvalid) {
      showToast(
        Number.isFinite(cashReceivedAmount)
          ? "O valor recebido é menor que o total da venda."
          : "Informe um valor recebido válido.",
        "warning",
      );
      return;
    }
    const items: SaleItem[] = cartDetails.map((item) => ({
      productId: item.product.id,
      name: item.product.name,
      price: item.product.price,
      quantity: item.quantity,
      ...(item.observation.trim()
        ? { observation: item.observation.trim() }
        : {}),
    }));
    const timestamp = Date.now();
    const sale: Sale = {
      id: createRecordId("PV"),
      timestamp,
      total: cartTotal,
      payment: paymentMethod,
      operatorId: activeOperator.id,
      operatorName: activeOperator.name,
      items,
      customerName: orderCustomerName,
      orderStatus: "aguardando",
      statusUpdatedAt: timestamp,
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
    setCustomerName("");
    setCashReceived("");
    setOrdersMode("andamento");
    navigateTo("comandas");
    showToast(
      `Comanda de ${sale.customerName} adicionada em Aguardando.`,
    );
  }

  function setOrderStatus(sale: Sale, status: OrderStatus) {
    const updatedAt = Date.now();
    setSales((current) =>
      current.map((candidate) =>
        candidate.id === sale.id
          ? { ...candidate, orderStatus: status, statusUpdatedAt: updatedAt }
          : candidate,
      ),
    );
    showToast(
      status === "entregue"
        ? `Comanda de ${sale.customerName} concluída e guardada no histórico.`
        : `${sale.customerName}: ${ORDER_STATUS_LABELS[status]}.`,
    );
  }

  function advanceOrder(sale: Sale) {
    const nextStatus = nextOrderStatus(sale.orderStatus);
    if (nextStatus) setOrderStatus(sale, nextStatus);
  }

  function rewindOrder(sale: Sale) {
    const previousStatus = previousOrderStatus(sale.orderStatus);
    if (previousStatus) setOrderStatus(sale, previousStatus);
  }

  function renderOrderCard(sale: Sale) {
    const stage = ORDER_STAGE_CONFIG[sale.orderStatus];
    const nextStatus = nextOrderStatus(sale.orderStatus);
    const previousStatus = previousOrderStatus(sale.orderStatus);
    const itemCount = sale.items.reduce(
      (total, item) => total + item.quantity,
      0,
    );
    return (
      <article
        key={sale.id}
        data-testid={`order-${sale.id}`}
        className={`pool-card-enter overflow-hidden rounded-2xl border border-[#e5deda] border-t-4 bg-white shadow-[0_10px_28px_rgba(66,45,37,.07)] ${stage.accent}`}
      >
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="block text-xs font-extrabold uppercase tracking-[.08em] text-[#9c928d]">
                {sale.id}
              </span>
              <h3 className="mt-1 truncate text-xl font-black tracking-[-.03em] text-[#24201f]">
                {sale.customerName}
              </h3>
            </div>
            <span
              className={`shrink-0 rounded-full border px-3 py-2 text-xs font-extrabold ${stage.badge}`}
            >
              {stage.label}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-[#6d6561]">
            <span className="flex items-center gap-1.5">
              <Clock3 size={16} className="text-[#d9202c]" />
              {formatTime(sale.timestamp)}
            </span>
            <span>
              {formatOrderWait(
                sale.timestamp,
                now?.getTime() ?? sale.timestamp,
              )}
            </span>
          </div>

          <div className="mt-4 space-y-2 rounded-xl bg-[#faf8f6] p-3">
            {sale.items.map((item, itemIndex) => (
              <div
                key={`${sale.id}-${item.productId}-${itemIndex}`}
                className="flex items-start gap-2 text-sm"
              >
                <strong className="min-w-7 text-[#d9202c]">
                  {item.quantity}×
                </strong>
                <span className="min-w-0 font-semibold leading-5 text-[#4f4743]">
                  <span className="block">{item.name}</span>
                  {item.observation && (
                    <span className="mt-1 flex items-start gap-1.5 rounded-lg border border-[#f0d7b4] bg-[#fff8ec] px-2.5 py-2 text-[13px] font-bold leading-5 text-[#80561b]">
                      <MessageSquareText
                        size={15}
                        className="mt-0.5 shrink-0"
                      />
                      {item.observation}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-[#776f6b]">
              {itemCount} item(ns) • Pagamento: {sale.payment}
            </span>
            <strong className="text-base">{currency.format(sale.total)}</strong>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs font-bold text-[#8d8581]">
            <UserRound size={14} />
            Venda registrada por {sale.operatorName}
          </div>
        </div>

        <div className="flex gap-2 border-t border-[#eee8e4] bg-[#fcfaf8] p-3">
          {previousStatus && (
            <button
              type="button"
              onClick={() => rewindOrder(sale)}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#ded7d2] bg-white px-3 text-sm font-extrabold text-[#5f5753] transition hover:border-[#b9aca5]"
              aria-label={`Voltar a comanda de ${sale.customerName} para ${ORDER_STATUS_LABELS[previousStatus]}`}
            >
              <RotateCcw size={17} />
              {sale.orderStatus === "entregue" ? "Reabrir" : "Voltar"}
            </button>
          )}
          {nextStatus && (
            <button
              type="button"
              onClick={() => advanceOrder(sale)}
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#d9202c] px-4 text-sm font-extrabold text-white shadow-[0_9px_20px_rgba(217,32,44,.18)] transition hover:bg-[#b41622]"
              aria-label={`${stage.action}: comanda de ${sale.customerName}`}
            >
              {stage.action}
              <ChevronRight size={18} />
            </button>
          )}
        </div>
      </article>
    );
  }

  function openProductModal(product?: Product) {
    setProductForm(createProductForm(product));
    setModal("product");
  }

  function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = productForm.name.trim();
    const price = parseAmount(productForm.price);
    const stock = Number(productForm.stock);
    const minimum = Number(productForm.minimum);
    const category = productForm.category;

    if (!name) {
      showToast("Informe o nome do produto.", "warning");
      return;
    }
    if (productForm.price.trim() === "" || !Number.isFinite(price) || price < 0) {
      showToast("Informe um preço válido.", "warning");
      return;
    }
    if (!Number.isInteger(stock) || stock < 0) {
      showToast("Informe um estoque atual inteiro e maior ou igual a zero.", "warning");
      return;
    }
    if (!Number.isInteger(minimum) || minimum < 0) {
      showToast("Informe um estoque mínimo inteiro e maior ou igual a zero.", "warning");
      return;
    }
    if (!productCategories.includes(category)) {
      showToast("Escolha uma categoria válida.", "warning");
      return;
    }
    const duplicatedName = products.some(
      (product) =>
        product.id !== productForm.id &&
        normalizeText(product.name) === normalizeText(name),
    );
    if (duplicatedName) {
      showToast("Já existe um produto com esse nome.", "warning");
      return;
    }

    const product: Product = {
      id:
        productForm.id ??
        `PR-${Date.now()}-${window.crypto.randomUUID().slice(0, 8)}`,
      name,
      category,
      price: roundMoney(price),
      stock,
      minimum,
      emoji: productForm.emoji.trim() || "🍽️",
    };
    if (productForm.id) {
      if (!products.some((item) => item.id === productForm.id)) {
        showToast("Esse produto não está mais disponível para edição.", "warning");
        setModal(null);
        return;
      }
      setProducts((current) =>
        current.map((item) => (item.id === product.id ? product : item)),
      );
      setCart((current) =>
        current
          .map((item) =>
            item.productId === product.id
              ? { ...item, quantity: Math.min(item.quantity, product.stock) }
              : item,
          )
          .filter((item) => item.quantity > 0),
      );
      showToast(`${product.name} foi atualizado.`);
    } else {
      setProducts((current) => [...current, product]);
      showToast(`${product.name} foi criado e já aparece nas vendas.`);
    }
    setModal(null);
  }

  function requestProductDelete(product: Product) {
    setProductDeleteId(product.id);
    setModal("product-delete");
  }

  function confirmProductDelete() {
    if (!productToDelete) {
      setModal(null);
      showToast("Esse produto já foi removido.", "info");
      return;
    }
    const replacement = products.find(
      (product) => product.id !== productToDelete.id,
    );
    setProducts((current) =>
      current.filter((product) => product.id !== productToDelete.id),
    );
    setCart((current) =>
      current.filter((item) => item.productId !== productToDelete.id),
    );
    setStockForm((current) =>
      current.productId === productToDelete.id
        ? { ...current, productId: replacement?.id ?? "" }
        : current,
    );
    setProductDeleteId(null);
    setModal(null);
    showToast(
      `${productToDelete.name} foi excluído. As vendas anteriores continuam no histórico.`,
      "info",
    );
  }

  function openStockModal(productId?: string) {
    setStockForm({
      productId: productId ?? products[0]?.id ?? "",
      quantity: "10",
      cost: "",
      payment: "Dinheiro",
    });
    setModal("stock");
  }

  function submitStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantity = Number(stockForm.quantity);
    const cost = parseAmount(stockForm.cost);
    const hasCost = stockForm.cost.trim().length > 0;
    if (!Number.isInteger(quantity) || quantity <= 0) {
      showToast("Informe uma quantidade inteira válida.", "warning");
      return;
    }
    const product = products.find((item) => item.id === stockForm.productId);
    if (!product) {
      showToast("Selecione um produto válido.", "warning");
      return;
    }
    if (hasCost && (!Number.isFinite(cost) || cost < 0)) {
      showToast("Informe um custo válido ou deixe o campo vazio.", "warning");
      return;
    }
    if (cost > 0 && stockForm.payment === "Dinheiro") {
      if (!cashOpen) {
        showToast(
          "Abra o caixa ou escolha outra forma para registrar este pagamento.",
          "warning",
        );
        return;
      }
      if (cost > cashBalance) {
        showToast(
          "O custo em dinheiro não pode ser maior que o saldo do caixa.",
          "warning",
        );
        return;
      }
    }
    setProducts((current) =>
      current.map((item) =>
        item.id === stockForm.productId
          ? { ...item, stock: item.stock + quantity }
          : item,
      ),
    );
    if (cost > 0) {
      setExpenses((current) => [
        {
          id: createRecordId("DS"),
          timestamp: Date.now(),
          description: `Reposição: ${product.name}`,
          category: "Compra de estoque",
          amount: cost,
          payment: stockForm.payment,
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
    const amount = parseAmount(expenseForm.amount);
    if (
      !expenseForm.description.trim() ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      showToast("Preencha a descrição e um valor válido.", "warning");
      return;
    }
    if (expenseForm.payment === "Dinheiro") {
      if (!cashOpen) {
        showToast(
          "Abra o caixa ou escolha Pix/Cartão para registrar esta saída.",
          "warning",
        );
        return;
      }
      if (amount > cashBalance) {
        showToast(
          "A saída em dinheiro não pode ser maior que o saldo do caixa.",
          "warning",
        );
        return;
      }
    }
    setExpenses((current) => [
      {
        id: createRecordId("DS"),
        timestamp: Date.now(),
        description: expenseForm.description.trim(),
        category: expenseForm.category,
        amount,
        payment: expenseForm.payment,
      },
      ...current,
    ]);
    setExpenseForm({
      description: "",
      category: "Matéria-prima",
      amount: "",
      payment: "Dinheiro",
    });
    setModal(null);
    showToast("Saída registrada no financeiro.");
  }

  function requestCashToggle() {
    if (cashOpen) {
      if (
        cart.length > 0 &&
        !window.confirm(
          "Há uma comanda em andamento. Fechar o caixa descartará esse pedido. Continuar?",
        )
      ) {
        return;
      }
      setCashCloseForm("");
      setModal("cash-close");
      return;
    }
    setCashOpenForm("");
    setModal("cash-open");
  }

  function submitCashOpen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseAmount(cashOpenForm);
    if (!Number.isFinite(amount) || amount < 0) {
      showToast("Informe um valor de abertura válido.", "warning");
      return;
    }
    setOpeningBalance(amount);
    setCashOpenedAt(Date.now());
    setCashOpen(true);
    setCart([]);
    setCashReceived("");
    setPaymentMethod("Pix");
    setModal(null);
    showToast(`Caixa aberto com ${currency.format(amount)}.`, "info");
  }

  function submitCashClose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const countedBalance = parseAmount(cashCloseForm);
    if (!Number.isFinite(countedBalance) || countedBalance < 0) {
      showToast("Informe o valor contado no caixa.", "warning");
      return;
    }
    const closedAt = Date.now();
    const difference = roundMoney(countedBalance - cashBalance);
    setCashClosures((current) => [
      {
        id: createRecordId("FC"),
        openedAt: cashOpenedAt,
        closedAt,
        openingBalance,
        expectedBalance: cashBalance,
        countedBalance,
        difference,
      },
      ...current,
    ]);
    setCashOpen(false);
    setCart([]);
    setCashReceived("");
    setPaymentMethod("Pix");
    setModal(null);
    showToast(
      Math.abs(difference) < 0.005
        ? "Caixa fechado sem diferença."
        : `Caixa fechado com diferença de ${currency.format(difference)}.`,
      Math.abs(difference) < 0.005 ? "success" : "warning",
    );
  }

  function submitCashMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseAmount(cashMovementForm.amount);
    if (!cashOpen) {
      showToast("Abra o caixa antes de movimentar dinheiro.", "warning");
      return;
    }
    if (
      !cashMovementForm.description.trim() ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      showToast("Preencha a descrição e um valor válido.", "warning");
      return;
    }
    if (cashMovementForm.kind === "sangria" && amount > cashBalance) {
      showToast("A sangria não pode ser maior que o saldo esperado.", "warning");
      return;
    }
    setCashMovements((current) => [
      {
        id: createRecordId("MC"),
        timestamp: Date.now(),
        description: cashMovementForm.description.trim(),
        amount,
        kind: cashMovementForm.kind,
      },
      ...current,
    ]);
    setCashMovementForm({
      kind: "sangria",
      description: "",
      amount: "",
    });
    setModal(null);
    showToast(
      cashMovementForm.kind === "sangria"
        ? "Sangria registrada."
        : "Suprimento registrado.",
    );
  }

  function exportBackup() {
    const backup = createBackup(currentPoolState());
    downloadBackupFile(
      backup,
      `pool-backup-${formatDateKey(Date.now())}.json`,
    );
    showToast("Backup exportado. Guarde o arquivo no OneDrive.", "info");
  }

  async function exportSqliteDatabase() {
    if (!primaryStorageReadyRef.current) {
      showToast(
        "A cópia completa está disponível no aplicativo instalado no caixa.",
        "warning",
      );
      return;
    }
    try {
      const database = await downloadLocalDatabase();
      downloadBlob(database, "pool-petiscos.db");
      showToast("Cópia completa do banco baixada.", "info");
    } catch {
      showToast(
        "Não foi possível preparar a cópia completa do banco.",
        "warning",
      );
    }
  }

  function currentPoolState(): PersistedPoolState {
    return {
      products,
      sales,
      expenses,
      cashOpen,
      openingBalance,
      cashOpenedAt,
      cashMovements,
      cashClosures,
      operatorCredentials,
      ...(pinRecoveryCredential ? { pinRecoveryCredential } : {}),
    };
  }

  function downloadBackupFile(
    backup: ReturnType<typeof createBackup>,
    filename: string,
  ) {
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, filename);
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const restoredState = parseBackup(String(reader.result));
      if (!restoredState) {
        showToast("Este arquivo não é um backup válido da Pool.", "warning");
        return;
      }
      if (
        !window.confirm(
          "Restaurar este backup? Os dados atuais serão baixados em uma cópia de segurança antes da substituição.",
        )
      ) {
        return;
      }
      downloadBackupFile(
        createBackup(currentPoolState()),
        `pool-backup-antes-restauracao-${formatDateKey(Date.now())}.json`,
      );
      restorePoolState(restoredState);
      showToast("Backup validado e restaurado com sucesso.");
    };
    reader.onerror = () =>
      showToast("Não foi possível ler o arquivo selecionado.", "warning");
    reader.readAsText(file);
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
      source: "upload" as const,
    }));
    const startIndex = tracks.length;
    setTracks((current) => [...current, ...imported]);
    if (currentTrackIndex === -1) setCurrentTrackIndex(startIndex);
    showToast(`${imported.length} áudio(s) importado(s) do computador.`);
    event.target.value = "";
  }

  function updateMusicSource(value: string) {
    setDownloadSourceUrl(value);
    setSelectedYoutubeResult(null);
    setYoutubeSearchResults([]);
    setYoutubeSearchError("");
    setYoutubeSearchStatus(
      value.trim().length >= 2 && !isCompleteWebUrl(value)
        ? "waiting"
        : "idle",
    );
  }

  function chooseYoutubeResult(result: YoutubeSearchResult) {
    setDownloadSourceUrl(result.url);
    setSelectedYoutubeResult(result);
    setYoutubeSearchResults([]);
    setYoutubeSearchError("");
    setYoutubeSearchStatus("idle");
  }

  async function handleCompanionDownload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sourceUrl = downloadSourceUrl.trim();
    if (!sourceUrl) {
      showToast("Pesquise uma música ou cole o link de uma faixa.", "warning");
      return;
    }
    if (!isCompleteWebUrl(sourceUrl)) {
      showToast(
        "Escolha uma música nos resultados ou cole um link completo.",
        "warning",
      );
      return;
    }
    if (musicCompanionStatus !== "ready") {
      showToast(
        "O serviço de músicas está indisponível. Tente novamente.",
        "warning",
      );
      return;
    }

    setMusicDownloadBusy(true);
    try {
      let job = await queueTrackDownload(sourceUrl);
      setDownloadJob(job);
      for (let attempt = 0; attempt < 240; attempt += 1) {
        if (job.status === "finished" || job.status === "failed") break;
        await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        job = await getTrackDownloadJob(job.id);
        setDownloadJob(job);
      }
      if (job.status === "finished") {
        setDownloadSourceUrl("");
        setSelectedYoutubeResult(null);
        setYoutubeSearchStatus("idle");
        await syncMusicCompanion();
        showToast("Faixa adicionada à biblioteca do caixa.");
      } else if (job.status === "failed") {
        showToast(
          "Não foi possível baixar esta faixa. Confira o link e tente novamente.",
          "warning",
        );
      } else {
        showToast(
          "A faixa continua sendo preparada. Atualize a biblioteca em instantes.",
          "info",
        );
      }
    } catch {
      showToast(
        "Não foi possível iniciar o download. Tente novamente.",
        "warning",
      );
    } finally {
      setMusicDownloadBusy(false);
    }
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

  if (!hydrated || !operatorSessionReady) {
    return <StartupScreen />;
  }

  if (!activeOperator) {
    return (
      <OperatorLogin
        credentials={operatorCredentials}
        recoveryCredential={pinRecoveryCredential}
        onCredentialChange={updateOperatorCredential}
        onRecoveryCredentialChange={setPinRecoveryCredential}
        onLogin={loginOperator}
      />
    );
  }

  return (
    <div className="pool-app min-h-screen bg-[#f7f5f2] text-[#24201f]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[252px] flex-col overflow-y-auto bg-[#211e1d] px-4 py-5 text-white shadow-2xl lg:flex">
        <div className="rounded-xl bg-white/5 p-2">
          <Image
            src="/pool-logo-banner.jpg"
            alt="Pool Petiscos & Lanches"
            width={220}
            height={37}
            unoptimized
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
                onClick={() => navigateTo(item.id)}
                aria-current={active ? "page" : undefined}
                data-testid={`nav-${item.id}`}
                className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition ${
                  active
                    ? "bg-[#d9202c] text-white shadow-[0_10px_24px_rgba(217,32,44,.25)]"
                    : "text-white/60 hover:bg-white/7 hover:text-white"
                }`}
              >
                <Icon size={19} strokeWidth={2.1} />
                <span className="flex-1">{item.label}</span>
                {item.id === "comandas" && activeOrders.length > 0 && (
                  <span className="grid min-h-6 min-w-6 place-items-center rounded-full bg-white px-1.5 text-xs font-black text-[#d9202c]">
                    {activeOrders.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex-1" />
        <button
          type="button"
          onClick={changeOperator}
          className="mt-2 flex min-h-14 items-center gap-3 rounded-2xl border-t border-white/8 px-2 pt-4 text-left hover:bg-white/5"
          aria-label={`Trocar operador. Conectado como ${activeOperator.name}`}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-base font-extrabold text-[#d9202c]">
            {activeOperator.initials}
          </span>
          <div className="min-w-0 flex-1">
            <strong className="block text-[11px]">{activeOperator.name}</strong>
            <span className="block text-[9px] text-white/45">
              {activeOperator.role}
            </span>
          </div>
          <LogOut size={18} className="text-white/45" />
        </button>
      </aside>

      <main
        ref={mainRef}
        className="min-h-screen pb-24 lg:ml-[252px] lg:pb-0"
      >
        <header className="sticky top-0 z-30 flex min-h-[70px] items-center justify-between gap-4 border-b border-[#ebe5e1] bg-[#f7f5f2]/92 px-4 backdrop-blur-xl sm:px-6 lg:px-9">
          <Image
            src="/pool-logo-banner.jpg"
            alt="Pool Petiscos & Lanches"
            width={126}
            height={21}
            unoptimized
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
              onClick={requestCashToggle}
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
            <div ref={notificationsRef} className="relative">
              <button
                type="button"
                onClick={() => setNotificationsOpen((current) => !current)}
                aria-label={`${lowStock.length} notificação(ões)`}
                aria-expanded={notificationsOpen}
                aria-controls="pool-notifications"
                className="relative grid size-11 place-items-center rounded-xl border border-[#ebe5e1] bg-white text-[#5f5753] shadow-sm transition hover:border-[#d9cfca] hover:text-[#d9202c]"
              >
                <Bell size={19} />
                {lowStock.length > 0 && (
                  <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full border-2 border-[#f7f5f2] bg-[#d9202c] px-1 text-[10px] font-extrabold leading-none text-white">
                    {lowStock.length}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <section
                  id="pool-notifications"
                  aria-labelledby="pool-notifications-title"
                  className="absolute right-0 top-[calc(100%+.75rem)] z-50 w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[#e5deda] bg-white shadow-[0_22px_55px_rgba(44,35,31,.2)]"
                >
                  <div className="border-b border-[#eee8e4] bg-[#faf8f6] px-4 py-3">
                    <span className="text-[11px] font-extrabold uppercase tracking-[.12em] text-[#d9202c]">
                      Central de alertas
                    </span>
                    <h2
                      id="pool-notifications-title"
                      className="mt-0.5 text-base font-extrabold"
                    >
                      Notificações
                    </h2>
                  </div>
                  {lowStock.length ? (
                    <>
                      <div className="max-h-72 divide-y divide-[#eee8e4] overflow-y-auto">
                        {lowStock.slice(0, 5).map((product) => (
                          <div
                            key={product.id}
                            className="flex items-center gap-3 px-4 py-3"
                          >
                            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fff0f1] text-lg">
                              {product.emoji}
                            </span>
                            <div className="min-w-0 flex-1">
                              <strong className="block truncate text-[13px]">
                                {product.name}
                              </strong>
                              <span className="text-[11px] font-semibold text-[#b41622]">
                                {product.stock} un. • mínimo {product.minimum}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setStockFilter("Baixo");
                          setNotificationsOpen(false);
                          navigateTo("estoque");
                        }}
                        className="flex min-h-12 w-full items-center justify-between px-4 text-[12px] font-extrabold text-[#d9202c] transition hover:bg-[#fff7f7]"
                      >
                        Ver estoque que precisa de reposição
                        <ChevronRight size={17} />
                      </button>
                    </>
                  ) : (
                    <div className="p-5 text-center">
                      <CheckCircle2
                        size={28}
                        className="mx-auto text-[#31a36f]"
                      />
                      <strong className="mt-2 block text-sm">
                        Nenhum alerta agora
                      </strong>
                      <span className="mt-1 block text-[12px] text-[#776f6b]">
                        O estoque está acima dos mínimos cadastrados.
                      </span>
                    </div>
                  )}
                </section>
              )}
            </div>
            <button
              type="button"
              onClick={changeOperator}
              className="hidden min-h-11 items-center gap-2 rounded-xl pl-1 pr-2 text-left transition hover:bg-white md:flex"
              aria-label={`Trocar operador. Conectado como ${activeOperator.name}`}
            >
              <span className="grid size-9 place-items-center rounded-xl bg-[#302b29] text-white">
                <span className="text-sm font-black">
                  {activeOperator.initials}
                </span>
              </span>
              <div>
                <strong className="block text-[10px]">
                  {activeOperator.familiarName}
                </strong>
                <span className="block text-[8px] text-[#8d8581]">
                  Trocar operador
                </span>
              </div>
              <LogOut size={15} className="text-[#8d8581]" />
            </button>
          </div>
        </header>

        {activeView === "inicio" && (
          <div className="pool-view-enter mx-auto w-full max-w-[1480px] space-y-4 p-4 sm:p-6 lg:p-9">
            <section className="relative flex min-h-[220px] items-center overflow-hidden rounded-[24px] border border-[#f1d0d3] bg-gradient-to-br from-[#d9202c] to-[#a8101c] p-6 shadow-[0_16px_40px_rgba(66,45,37,.08)] sm:p-9">
              <div className="absolute inset-y-0 left-0 w-full bg-white sm:w-[70%] sm:[clip-path:polygon(0_0,82%_0,100%_100%,0_100%)]" />
              <div className="relative z-10 max-w-[600px]">
                <span className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.12em] text-[#d9202c]">
                  <Sparkles size={15} />
                  Tudo pronto por aqui
                </span>
                <h1 className="mt-2 text-3xl font-extrabold tracking-[-.04em] sm:text-[40px]">
                  {getGreeting(recifeHour)}, {activeOperator.familiarName}!
                </h1>
                <p className="mt-2 max-w-[480px] text-xs leading-6 text-[#776f6b] sm:text-sm">
                  Acompanhe as vendas, o caixa e o estoque da Pool sem
                  complicação.
                </p>
                <div className="mt-5 flex flex-col gap-2 min-[450px]:flex-row">
                  <button
                    type="button"
                    onClick={() => navigateTo("venda")}
                    data-testid="start-sale"
                    className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#d9202c] px-4 text-xs font-extrabold text-white shadow-[0_9px_20px_rgba(217,32,44,.2)] transition hover:bg-[#b41622]"
                  >
                    <Plus size={18} />
                    Registrar nova venda
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateTo("comandas")}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#ebe5e1] bg-white px-4 text-xs font-bold transition hover:border-[#d9202c] hover:text-[#d9202c]"
                  >
                    <ReceiptText size={17} />
                    {activeOrders.length > 0
                      ? `${activeOrders.length} comanda(s) na fila`
                      : "Ver comandas"}
                  </button>
                </div>
              </div>
              <div className="absolute bottom-3 right-3 z-10 hidden rounded-full border border-white/30 bg-white/10 p-2 shadow-2xl sm:bottom-auto sm:right-[6%] sm:block">
                <Image
                  src="/pool-logo-round.jpg"
                  alt=""
                  width={160}
                  height={160}
                  unoptimized
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
                    onClick={() => navigateTo("financeiro")}
                    className="flex items-center text-[10px] font-extrabold text-[#d9202c]"
                  >
                    Ver financeiro <ChevronRight size={15} />
                  </button>
                </div>
                <div className="mt-5 flex items-end justify-between gap-3">
                  <div>
                    <strong className="block text-xl tracking-[-.03em]">
                      {currency.format(recentRevenue)}
                    </strong>
                    <span className="text-[9px] text-[#776f6b]">
                      Total real dos últimos 5 dias
                    </span>
                  </div>
                  <span className="rounded-full bg-[#eaf8f1] px-2 py-1 text-[9px] font-extrabold text-[#27865d]">
                    {recentSalesCount} venda(s) no período
                  </span>
                </div>
                <div className="mt-3 flex h-40 items-end justify-around gap-3 border-b border-[#ebe5e1] px-2">
                  {dailyRevenue.map((day) => (
                    <div
                      key={day.key}
                      aria-label={`${day.label}: ${currency.format(day.total)}`}
                      className="group flex h-full flex-1 flex-col items-center justify-end"
                    >
                      <span className="mb-1 text-[8px] text-[#9c928d] opacity-0 transition group-hover:opacity-100">
                        {shortCurrency.format(day.total)}
                      </span>
                      <div className="flex h-[120px] w-full max-w-9 items-end overflow-hidden rounded-t-lg bg-[#f5f1ee]">
                        <i
                          className={`block w-full rounded-t-lg ${
                            day.label === "Hoje"
                              ? "bg-gradient-to-t from-[#e5a70c] to-[#f8c738]"
                              : "bg-gradient-to-t from-[#c91824] to-[#e83a45]"
                          }`}
                          style={{
                            height: `${(day.total / maxDailyRevenue) * 100}%`,
                          }}
                        />
                      </div>
                      <strong className="py-2 text-[9px] text-[#776f6b]">
                        {day.label}
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
                    onClick={() => navigateTo("estoque")}
                    className="flex items-center text-[10px] font-extrabold text-[#d9202c]"
                  >
                    Ver todos <ChevronRight size={15} />
                  </button>
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  {lowStock.length === 0 && (
                    <div className="rounded-xl border border-dashed border-[#dfe9e4] bg-[#f5fbf8] p-4 text-center">
                      <CheckCircle2
                        size={26}
                        className="mx-auto text-[#27865d]"
                      />
                      <strong className="mt-2 block text-sm text-[#276348]">
                        {products.length
                          ? "Estoque em dia"
                          : "Nenhum produto cadastrado"}
                      </strong>
                      <span className="mt-1 block text-xs text-[#6d6561]">
                        {products.length
                          ? "Nenhum item precisa de reposição agora."
                          : "Abra Estoque para cadastrar o primeiro produto."}
                      </span>
                    </div>
                  )}
                  {lowStock.slice(0, 4).map((product) => (
                    <article
                      key={product.id}
                      className="pool-low-stock-card flex items-center gap-3 rounded-xl border border-[#f0e9e5] bg-[#fdfcfb] p-3"
                    >
                      <span className="pool-low-stock-icon grid size-10 shrink-0 place-items-center rounded-xl bg-[#fff2e8] text-lg">
                        {product.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <strong className="truncate text-sm text-[#302b29]">
                            {product.name}
                          </strong>
                          <span className="shrink-0 text-xs font-extrabold text-[#d76822]">
                            {product.stock} un.
                          </span>
                        </div>
                        <div className="pool-low-stock-track mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#f1e8e2]">
                          <i
                            className="block h-full rounded-full bg-[#d76822] transition-[width] duration-300"
                            style={{
                              width: `${Math.min(
                                100,
                                product.minimum > 0
                                  ? (product.stock / product.minimum) * 100
                                  : 0,
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

          </div>
        )}

        {activeView === "venda" && (
          <div className="pool-view-enter mx-auto w-full max-w-[1480px] p-4 sm:p-6 lg:p-9">
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
              <span className="flex items-center gap-2 self-start rounded-full bg-white px-4 py-2 text-sm font-extrabold text-[#4f4743] shadow-sm sm:self-auto">
                <UserRound size={17} className="text-[#d9202c]" />
                Venda de {activeOperator.familiarName}
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_380px]">
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
                      aria-pressed={category === item}
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
                <div className="mt-4 grid grid-cols-2 gap-3 min-[1180px]:grid-cols-3 2xl:grid-cols-4">
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
                      {products.length ? (
                        <Search size={30} className="mx-auto text-[#c7beba]" />
                      ) : (
                        <Package size={30} className="mx-auto text-[#c7beba]" />
                      )}
                      <strong className="mt-3 block text-sm">
                        {products.length
                          ? "Nenhum produto encontrado"
                          : "Cadastre o primeiro produto"}
                      </strong>
                      <span className="text-[10px] text-[#8d8581]">
                        {products.length
                          ? "Ajuste a busca ou escolha outra categoria."
                          : "Os produtos cadastrados aparecerão aqui para venda."}
                      </span>
                      {!products.length && (
                        <button
                          type="button"
                          onClick={() => navigateTo("estoque")}
                          className="mx-auto mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#d9202c] px-5 text-sm font-extrabold text-white"
                        >
                          <Plus size={18} />
                          Ir para Estoque
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </section>

              <aside className="h-fit rounded-[20px] border border-[#ebe5e1] bg-white p-4 shadow-[0_10px_30px_rgba(66,45,37,.06)] lg:sticky lg:top-[88px]">
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
                        className="rounded-2xl border border-[#eee8e4] bg-white p-3"
                      >
                        <div className="flex items-center gap-2">
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fff7ec] text-lg">
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
                              className="grid size-11 place-items-center rounded-lg border border-[#ebe5e1] text-[#776f6b]"
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
                              className="grid size-11 place-items-center rounded-lg border border-[#ebe5e1] text-[#d9202c]"
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        </div>

                        <label className="mt-3 block border-t border-[#eee8e4] pt-3">
                          <span className="mb-1.5 flex items-center gap-1.5 text-xs font-extrabold text-[#6d6561]">
                            <MessageSquareText
                              size={15}
                              className="text-[#d9202c]"
                            />
                            Observação deste item
                          </span>
                          <textarea
                            rows={2}
                            maxLength={180}
                            value={item.observation}
                            onChange={(event) =>
                              updateCartObservation(
                                item.productId,
                                event.target.value,
                              )
                            }
                            placeholder="Ex.: sem cebola, sem tomate"
                            className="w-full resize-none rounded-xl border border-[#ded7d2] bg-[#fcfaf8] px-3 py-2 text-sm leading-5 outline-none transition focus:border-[#d9202c] focus:bg-white focus:ring-4 focus:ring-[#d9202c]/10"
                          />
                        </label>
                      </article>
                    ))
                  )}
                </div>

                <div className="mt-4 border-t border-[#ebe5e1] pt-4">
                  <label className="mb-4 block">
                    <span className="mb-1.5 flex items-center gap-2 text-sm font-extrabold text-[#4f4743]">
                      <UserRound size={17} className="text-[#d9202c]" />
                      Nome na comanda
                    </span>
                    <input
                      value={customerName}
                      onChange={(event) => setCustomerName(event.target.value)}
                      autoComplete="off"
                      maxLength={60}
                      placeholder="Ex.: João"
                      className="h-12 w-full rounded-xl border border-[#ded7d2] bg-white px-4 text-base font-bold outline-none transition focus:border-[#d9202c] focus:ring-4 focus:ring-[#d9202c]/10"
                    />
                    <span className="mt-1.5 block text-xs leading-5 text-[#776f6b]">
                      Esse nome aparecerá na fila de preparo.
                    </span>
                  </label>
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
                          aria-pressed={paymentMethod === method.id}
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
                      <span className="mb-1.5 block text-sm font-extrabold text-[#5f5753]">
                        Valor recebido
                      </span>
                      <input
                        value={cashReceived}
                        onChange={(event) => setCashReceived(event.target.value)}
                        inputMode="decimal"
                        placeholder="R$ 0,00"
                        className="h-12 w-full rounded-xl border border-[#ded7d2] px-4 text-lg font-bold outline-none transition focus:border-[#d9202c] focus:ring-4 focus:ring-[#d9202c]/10"
                      />
                      {Number.isFinite(cashReceivedAmount) &&
                        cashReceivedAmount >= cartTotal &&
                        cartTotal > 0 && (
                          <span
                            className="pool-emphasis mt-3 block rounded-2xl border-2 border-[#9bd0b6] bg-[#eaf8f1] p-4 text-[#185c3e] shadow-[0_10px_24px_rgba(39,134,93,.12)]"
                            role="status"
                            aria-live="polite"
                          >
                            <span className="block text-sm font-extrabold uppercase tracking-[.08em]">
                              Troco a devolver
                            </span>
                            <strong className="mt-1 block text-3xl font-black tracking-[-.04em] sm:text-4xl">
                              {currency.format(
                                roundMoney(cashReceivedAmount - cartTotal),
                              )}
                            </strong>
                          </span>
                        )}
                      {cashReceived.trim() && cashPaymentInvalid && (
                        <span className="mt-1 block text-[10px] font-bold text-[#b41622]">
                          {Number.isFinite(cashReceivedAmount)
                            ? "O valor ainda não cobre o pedido."
                            : "Use um valor como 50,00."}
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
                    Finalizar e criar comanda
                  </button>
                </div>
              </aside>
            </div>
          </div>
        )}

        {activeView === "comandas" && (
          <div className="pool-view-enter mx-auto w-full max-w-[1560px] p-4 sm:p-6 lg:p-9">
            <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
              <div>
                <span className="text-xs font-extrabold uppercase tracking-[.13em] text-[#d9202c]">
                  Fila de pedidos da Pool
                </span>
                <h1 className="mt-1 text-3xl font-black tracking-[-.04em] sm:text-4xl">
                  Comandas
                </h1>
                <p className="mt-2 max-w-2xl text-base leading-6 text-[#6d6561]">
                  Veja quem chegou primeiro e avance cada pedido com um toque.
                  Nada desaparece: as comandas entregues ficam no histórico.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigateTo("venda")}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#d9202c] px-5 text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(217,32,44,.2)] transition hover:bg-[#b41622]"
              >
                <Plus size={19} />
                Nova venda
              </button>
            </div>

            <section
              className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
              aria-label="Resumo das comandas"
            >
              {[
                {
                  label: "Aguardando",
                  value: ordersByStatus.aguardando.length,
                  tone: "border-[#efd38c] bg-[#fff8de] text-[#8d6100]",
                },
                {
                  label: "Em preparo",
                  value: ordersByStatus["em-preparo"].length,
                  tone: "border-[#f1b7bc] bg-[#fff0f1] text-[#b41622]",
                },
                {
                  label: "Prontas",
                  value: ordersByStatus.pronto.length,
                  tone: "border-[#a9d9c2] bg-[#eaf8f1] text-[#23734f]",
                },
                {
                  label: "Em andamento",
                  value: activeOrders.length,
                  tone: "border-[#d9d2ce] bg-white text-[#302b29]",
                },
              ].map((summary) => (
                <article
                  key={summary.label}
                  className={`flex items-center justify-between rounded-2xl border p-4 shadow-sm ${summary.tone}`}
                >
                  <strong className="text-sm">{summary.label}</strong>
                  <span className="text-3xl font-black tabular-nums">
                    {summary.value}
                  </span>
                </article>
              ))}
            </section>

            <div className="mb-5 flex w-full rounded-2xl border border-[#e5deda] bg-white p-1.5 shadow-sm sm:w-fit">
              <button
                type="button"
                onClick={() => setOrdersMode("andamento")}
                aria-pressed={ordersMode === "andamento"}
                className={`min-h-12 flex-1 rounded-xl px-5 text-sm font-extrabold transition sm:flex-none ${
                  ordersMode === "andamento"
                    ? "bg-[#302b29] text-white"
                    : "text-[#6d6561] hover:bg-[#f7f5f2]"
                }`}
              >
                Em andamento ({activeOrders.length})
              </button>
              <button
                type="button"
                onClick={() => setOrdersMode("historico")}
                aria-pressed={ordersMode === "historico"}
                className={`min-h-12 flex-1 rounded-xl px-5 text-sm font-extrabold transition sm:flex-none ${
                  ordersMode === "historico"
                    ? "bg-[#302b29] text-white"
                    : "text-[#6d6561] hover:bg-[#f7f5f2]"
                }`}
              >
                Concluídas ({completedOrders.length})
              </button>
            </div>

            {ordersMode === "andamento" ? (
              activeOrders.length > 0 ? (
                <div className="grid items-start gap-4 xl:grid-cols-3">
                  {ACTIVE_ORDER_COLUMNS.map((status) => {
                    const stage = ORDER_STAGE_CONFIG[status];
                    const stageOrders = ordersByStatus[status];
                    return (
                      <section
                        key={status}
                        aria-labelledby={`orders-${status}`}
                        className="pool-order-lane overflow-hidden rounded-[22px] border border-[#e5deda] bg-[#f4f1ee] shadow-[0_12px_34px_rgba(66,45,37,.05)]"
                      >
                        <header className="border-b border-[#e5deda] bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <h2
                              id={`orders-${status}`}
                              className="text-xl font-black tracking-[-.03em]"
                            >
                              {stage.label}
                            </h2>
                            <span
                              className={`grid min-h-9 min-w-9 place-items-center rounded-full border px-2 text-base font-black ${stage.badge}`}
                            >
                              {stageOrders.length}
                            </span>
                          </div>
                          <p className="mt-1 text-sm leading-5 text-[#776f6b]">
                            {stage.helper}
                          </p>
                        </header>
                        <div className="space-y-3 p-3">
                          {stageOrders.length > 0 ? (
                            stageOrders.map(renderOrderCard)
                          ) : (
                            <div className="pool-order-empty grid min-h-32 place-items-center rounded-2xl border border-dashed border-[#d9d2ce] bg-white/70 p-5 text-center">
                              <div>
                                <CheckCircle2
                                  size={26}
                                  className="mx-auto text-[#b9aca5]"
                                />
                                <strong className="mt-2 block text-sm">
                                  {stage.empty}
                                </strong>
                              </div>
                            </div>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <section className="grid min-h-[320px] place-items-center rounded-[24px] border border-dashed border-[#d9d2ce] bg-white p-6 text-center shadow-sm">
                  <div className="max-w-md">
                    <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#eaf8f1] text-[#27865d]">
                      <CheckCircle2 size={32} />
                    </span>
                    <h2 className="mt-4 text-2xl font-black">
                      A fila está livre
                    </h2>
                    <p className="mt-2 text-base leading-6 text-[#776f6b]">
                      Ao finalizar uma venda, a nova comanda aparecerá aqui
                      automaticamente em Aguardando.
                    </p>
                    <button
                      type="button"
                      onClick={() => navigateTo("venda")}
                      className="mt-5 min-h-12 rounded-xl bg-[#d9202c] px-5 text-sm font-extrabold text-white"
                    >
                      Registrar uma venda
                    </button>
                  </div>
                </section>
              )
            ) : completedOrders.length > 0 ? (
              <section className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
                {completedOrders.map(renderOrderCard)}
              </section>
            ) : (
              <section className="rounded-[22px] border border-dashed border-[#d9d2ce] bg-white p-8 text-center">
                <strong className="text-lg">Nenhuma comanda concluída.</strong>
                <p className="mt-2 text-sm text-[#776f6b]">
                  Quando um pedido for entregue, ele ficará guardado aqui.
                </p>
              </section>
            )}
          </div>
        )}

        {activeView === "estoque" && (
          <div className="pool-view-enter mx-auto w-full max-w-[1480px] p-4 sm:p-6 lg:p-9">
            <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <span className="text-xs font-extrabold uppercase tracking-[.13em] text-[#d9202c]">
                  Controle de produtos
                </span>
                <h1 className="text-3xl font-extrabold tracking-[-.04em] sm:text-4xl">
                  Estoque
                </h1>
                <p className="mt-2 text-base leading-6 text-[#6d6561]">
                  Crie produtos, altere preços e mantenha as quantidades em dia.
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <button
                  type="button"
                  onClick={() => openStockModal()}
                  disabled={products.length === 0}
                  data-testid="open-stock-modal"
                  className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#ded7d2] bg-white px-5 text-sm font-extrabold text-[#4b4542] shadow-sm transition hover:-translate-y-0.5 hover:border-[#d9202c] hover:text-[#d9202c] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
                >
                  <Plus size={19} />
                  Registrar entrada
                </button>
                <button
                  type="button"
                  onClick={() => openProductModal()}
                  data-testid="open-product-modal"
                  className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#d9202c] px-5 text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(217,32,44,.2)] transition hover:-translate-y-0.5 hover:bg-[#b41622]"
                >
                  <Plus size={19} />
                  Novo produto
                </button>
              </div>
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
                      <span className="block text-sm font-semibold text-[#6d6561]">
                        {item.label}
                      </span>
                      <strong className="text-2xl">{item.value}</strong>
                      <small className="ml-2 text-xs text-[#8d8581]">
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
                    className="h-12 w-full rounded-xl border border-[#ebe5e1] bg-[#faf8f6] pl-10 pr-3 text-base outline-none transition focus:border-[#d9202c] focus:bg-white"
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
                  className="h-12 rounded-xl border border-[#ebe5e1] bg-white px-4 text-sm font-bold outline-none focus:border-[#d9202c]"
                >
                  <option>Todos</option>
                  <option>Baixo</option>
                  <option>Normal</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-left">
                  <thead className="bg-[#faf8f6] text-[11px] font-extrabold uppercase tracking-[.1em] text-[#776f6b]">
                    <tr>
                      <th className="px-5 py-4">Produto</th>
                      <th className="px-4 py-4">Categoria</th>
                      <th className="px-4 py-4">Preço atual</th>
                      <th className="px-4 py-4">Quantidade</th>
                      <th className="px-4 py-4">Estoque mínimo</th>
                      <th className="px-4 py-4">Situação</th>
                      <th className="px-5 py-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eee9e5]">
                    {filteredStock.map((product) => {
                      const low = product.stock <= product.minimum;
                      return (
                        <tr
                          key={product.id}
                          className="transition-colors hover:bg-[#fdfbf9]"
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <span className="grid size-11 place-items-center rounded-xl bg-[#fff7ec] text-2xl">
                                {product.emoji}
                              </span>
                              <div>
                                <strong className="block text-base">
                                  {product.name}
                                </strong>
                                <span className="text-xs text-[#8d8581]">
                                  Código {product.id}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-[#6d6561]">
                            {product.category}
                          </td>
                          <td className="px-4 py-4">
                            <strong className="text-base text-[#302b29]">
                              {currency.format(product.price)}
                            </strong>
                          </td>
                          <td className="px-4 py-4">
                            <strong
                              className={`text-xl ${
                                low ? "text-[#d76822]" : ""
                              }`}
                            >
                              {product.stock}
                            </strong>
                            <span className="ml-1 text-xs text-[#8d8581]">
                              un.
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm text-[#6d6561]">
                            {product.minimum} un.
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-extrabold ${
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
                          <td className="px-5 py-4">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => openStockModal(product.id)}
                                aria-label={`Repor ${product.name}`}
                                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#e4ddd8] px-3 text-sm font-extrabold text-[#d9202c] transition hover:border-[#d9202c] hover:bg-[#fff0f1]"
                              >
                                <Plus size={16} />
                                Repor
                              </button>
                              <button
                                type="button"
                                onClick={() => openProductModal(product)}
                                aria-label={`Editar preço e cadastro de ${product.name}`}
                                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#e4ddd8] px-3 text-sm font-extrabold text-[#4b4542] transition hover:border-[#4b4542] hover:bg-[#f7f5f2]"
                              >
                                <Pencil size={15} />
                                Editar preço
                              </button>
                              <button
                                type="button"
                                onClick={() => requestProductDelete(product)}
                                aria-label={`Excluir ${product.name}`}
                                className="grid size-10 place-items-center rounded-xl border border-[#f1d0d3] text-[#b41622] transition hover:border-[#b41622] hover:bg-[#fff0f1]"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!filteredStock.length && (
                      <tr>
                        <td colSpan={7} className="px-6 py-14 text-center">
                          <Package
                            size={30}
                            className="mx-auto text-[#c7beba]"
                          />
                          <strong className="mt-3 block text-base">
                            Nenhum produto encontrado
                          </strong>
                          <span className="mt-1 block text-sm text-[#776f6b]">
                            Limpe a busca ou cadastre um novo produto.
                          </span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#f1dfaf] bg-[#fff9e9] p-4">
              <Sparkles size={18} className="shrink-0 text-[#b27a00]" />
              <div>
                <strong className="block text-sm text-[#8d6100]">
                  Dica para manter o estoque confiável
                </strong>
                <p className="mt-1 text-sm leading-5 text-[#7b6129]">
                  Use <strong>Repor</strong> quando chegar mercadoria. Use{" "}
                  <strong>Editar preço</strong> para corrigir valor, nome, quantidade
                  atual ou estoque mínimo.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeView === "financeiro" && (
          <div className="pool-view-enter mx-auto w-full max-w-[1480px] p-4 sm:p-6 lg:p-9">
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
                  onClick={requestCashToggle}
                  className="min-h-11 rounded-xl border border-[#ebe5e1] bg-white px-4 text-[10px] font-extrabold"
                >
                  {cashOpen ? "Fechar caixa" : "Abrir caixa"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCashMovementForm({
                      kind: "sangria",
                      description: "",
                      amount: "",
                    });
                    setModal("cash-movement");
                  }}
                  disabled={!cashOpen}
                  className="min-h-11 rounded-xl border border-[#ebe5e1] bg-white px-4 text-[10px] font-extrabold disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Sangria / suprimento
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
                  helper: cashOpen
                    ? `Abertura: ${currency.format(openingBalance)} • só dinheiro`
                    : "Caixa fechado",
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

            <section className="mt-4 rounded-[22px] border border-[#e5deda] bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <span className="text-xs font-extrabold uppercase tracking-[.12em] text-[#d9202c]">
                    Vendas por login
                  </span>
                  <h2 className="mt-1 text-xl font-black tracking-[-.025em]">
                    Quanto cada operador vendeu hoje
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-[#6d6561]">
                    Cada comanda é somada ao perfil conectado no momento da
                    venda.
                  </p>
                </div>
                <span className="inline-flex min-h-10 items-center gap-2 self-start rounded-full bg-[#f7f5f2] px-4 text-sm font-bold text-[#6d6561] sm:self-auto">
                  <UsersRound size={17} className="text-[#d9202c]" />
                  {todaySales.length} venda(s) hoje
                </span>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {operatorSalesSummary.map((summary) => {
                  const profile = OPERATOR_PROFILES.find(
                    (operator) => operator.id === summary.id,
                  );
                  const isCurrent = summary.id === activeOperator.id;
                  return (
                    <article
                      key={summary.id}
                      className={`relative overflow-hidden rounded-2xl border p-5 ${
                        isCurrent
                          ? "border-[#f0b6bb] bg-[#fff7f7]"
                          : "border-[#e9e2de] bg-[#fcfaf8]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span
                          className="grid size-12 place-items-center rounded-2xl text-lg font-black"
                          style={{
                            backgroundColor: profile?.softAccent ?? "#eee9e5",
                            color: profile?.accent ?? "#6d6561",
                          }}
                        >
                          {profile?.initials ?? "?"}
                        </span>
                        {isCurrent && (
                          <span className="rounded-full bg-[#d9202c] px-3 py-1.5 text-xs font-extrabold text-white">
                            Login atual
                          </span>
                        )}
                      </div>
                      <strong className="mt-4 block text-lg font-black">
                        {summary.name}
                      </strong>
                      <strong className="mt-1 block text-3xl font-black tracking-[-.04em] text-[#302b29]">
                        {currency.format(summary.total)}
                      </strong>
                      <span className="mt-1 block text-sm font-semibold text-[#776f6b]">
                        {summary.count} venda(s)
                      </span>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="mt-4 flex flex-col gap-4 rounded-[20px] border border-[#ebe5e1] bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f1eefc] text-[#7458b4]">
                  <Download size={19} />
                </span>
                <div>
                  <h2 className="text-sm font-extrabold">Proteção dos dados</h2>
                  <p className="mt-1 max-w-2xl text-[9px] leading-4 text-[#776f6b]">
                    Guarde uma cópia simples para restauração ou baixe o banco
                    completo para conferência e auditoria.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={exportBackup}
                  className="flex min-h-10 items-center gap-2 rounded-xl bg-[#302b29] px-4 text-[9px] font-extrabold text-white"
                >
                  <Download size={15} />
                  Exportar backup
                </button>
                <button
                  type="button"
                  onClick={() => void exportSqliteDatabase()}
                  className="flex min-h-11 items-center gap-2 rounded-xl border border-[#d9cfca] bg-white px-4 text-[9px] font-extrabold text-[#4f4743] transition hover:border-[#b9aca5] hover:bg-[#faf8f6]"
                >
                  <DatabaseBackup size={15} />
                  Baixar banco completo
                </button>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#ebe5e1] px-4 text-[9px] font-extrabold text-[#5f5753] focus-within:ring-2 focus-within:ring-[#d9202c] focus-within:ring-offset-2">
                  <Upload size={15} />
                  Restaurar backup
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={importBackup}
                    className="sr-only"
                  />
                </label>
              </div>
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
          <div className="pool-view-enter mx-auto w-full max-w-[1240px] p-4 sm:p-6 lg:p-9">
            <div className="mb-5">
              <span className="text-[9px] font-extrabold uppercase tracking-[.13em] text-[#d9202c]">
                Um cantinho para o MC Poolblay
              </span>
              <h1 className="text-2xl font-extrabold tracking-[-.04em] sm:text-3xl">
                Música ambiente
              </h1>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-[#776f6b]">
                Importe arquivos de áudio ou adicione faixas por link. Tudo fica
                organizado na biblioteca deste caixa.
              </p>
            </div>

            <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#272220] to-[#161312] p-5 text-white shadow-2xl sm:p-8">
              <div className="absolute -right-20 -top-20 size-72 rounded-full border-[50px] border-[#d9202c]/10" />
              <div className="relative z-10 grid gap-7 lg:grid-cols-[1fr_320px] lg:items-center">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#d9202c]/15 px-3 py-2 text-[9px] font-extrabold text-[#ff8790]">
                    <Music2 size={14} />
                    Biblioteca do caixa
                  </span>
                  <h2 className="mt-5 max-w-lg text-2xl font-extrabold tracking-[-.04em] sm:text-4xl">
                    O clima da Pool, do jeito de vocês.
                  </h2>
                  <p className="mt-3 max-w-xl text-[10px] leading-5 text-white/50 sm:text-xs">
                    O sistema usa a saída de som escolhida no Windows. Basta
                    conectar a caixa Bluetooth no computador e selecioná-la nas
                    configurações de áudio.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-[#d9202c] px-4 text-[10px] font-extrabold shadow-lg focus-within:ring-2 focus-within:ring-white focus-within:ring-offset-2 focus-within:ring-offset-[#211e1d]">
                      <Upload size={17} />
                      Importar arquivos
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

            <section className="mt-4 overflow-hidden rounded-[20px] border border-[#ebe5e1] bg-white shadow-sm">
              <div className="grid gap-5 p-5 lg:grid-cols-[1fr_auto] lg:items-start lg:p-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-[.13em] text-[#d9202c]">
                      Busca rápida no YouTube
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                        musicCompanionStatus === "ready"
                          ? "bg-[#eaf8f1] text-[#23734f]"
                          : musicCompanionStatus === "checking"
                            ? "bg-[#f1eefc] text-[#5e4893]"
                            : "bg-[#fff0f1] text-[#b41622]"
                      }`}
                    >
                      {musicCompanionStatus === "checking" ? (
                        <LoaderCircle size={13} className="animate-spin" />
                      ) : musicCompanionStatus === "ready" ? (
                        <Wifi size={13} />
                      ) : (
                        <WifiOff size={13} />
                      )}
                      {musicCompanionStatus === "ready"
                        ? "Biblioteca disponível"
                        : musicCompanionStatus === "checking"
                          ? "Verificando"
                          : "Serviço indisponível"}
                    </span>
                  </div>
                  <h2 className="mt-2 text-2xl font-extrabold tracking-[-.025em]">
                    Encontre uma música ou cole o link
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6d6561]">
                    Digite o nome e escolha entre os cinco resultados. Se já
                    tiver o endereço da música, basta colá-lo no mesmo campo.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void syncMusicCompanion(true)}
                  disabled={musicCompanionStatus === "checking"}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#e5deda] px-4 text-[12px] font-extrabold text-[#5f5753] transition hover:border-[#d9202c] hover:text-[#d9202c] disabled:opacity-50"
                >
                  <RotateCcw size={16} />
                  Atualizar biblioteca
                </button>
              </div>

              <form
                onSubmit={handleCompanionDownload}
                className="border-t border-[#eee8e4] bg-[#faf8f6] p-5 lg:p-6"
              >
                <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                  <div>
                    <label
                      htmlFor="music-source-search"
                      className="mb-1.5 block text-sm font-extrabold text-[#4b4542]"
                    >
                      Nome da música ou link
                    </label>
                    <div className="relative">
                      <Search
                        size={20}
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8d8581]"
                      />
                      <input
                        id="music-source-search"
                        type="text"
                        maxLength={120}
                        value={downloadSourceUrl}
                        onChange={(event) =>
                          updateMusicSource(event.target.value)
                        }
                        placeholder="Ex.: Tim Maia Azul da Cor do Mar"
                        autoComplete="off"
                        aria-controls="youtube-search-results"
                        aria-describedby="music-source-help"
                        className="h-14 w-full rounded-2xl border border-[#ded7d2] bg-white pl-12 pr-12 text-base font-semibold outline-none transition focus:border-[#d9202c] focus:ring-4 focus:ring-[#d9202c]/10"
                      />
                      {downloadSourceUrl && (
                        <button
                          type="button"
                          onClick={() => updateMusicSource("")}
                          aria-label="Limpar pesquisa"
                          className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-xl text-[#776f6b] transition hover:bg-[#f3efec] hover:text-[#302b29]"
                        >
                          <X size={18} />
                        </button>
                      )}
                    </div>
                    <span
                      id="music-source-help"
                      className="mt-2 block text-xs leading-5 text-[#776f6b]"
                    >
                      A busca começa automaticamente enquanto você digita.
                    </span>
                  </div>
                  <button
                    type="submit"
                    disabled={
                      musicDownloadBusy ||
                      musicCompanionStatus !== "ready" ||
                      !isCompleteWebUrl(downloadSourceUrl)
                    }
                    className="flex min-h-14 items-center justify-center gap-2 self-end rounded-2xl bg-[#302b29] px-6 text-sm font-extrabold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[#211e1d] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {musicDownloadBusy ? (
                      <LoaderCircle size={18} className="animate-spin" />
                    ) : (
                      <Download size={18} />
                    )}
                    {musicDownloadBusy ? "Preparando faixa…" : "Baixar faixa"}
                  </button>
                </div>

                <div
                  className="mt-3"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {(youtubeSearchStatus === "waiting" ||
                    youtubeSearchStatus === "loading") && (
                    <div
                      role="status"
                      className="flex min-h-12 items-center gap-3 rounded-xl border border-[#e5deda] bg-white px-4 text-sm font-semibold text-[#5f5753]"
                    >
                      <LoaderCircle
                        size={18}
                        className={
                          youtubeSearchStatus === "loading"
                            ? "animate-spin text-[#d9202c]"
                            : "text-[#9c928d]"
                        }
                      />
                      {youtubeSearchStatus === "loading"
                        ? "Pesquisando no YouTube…"
                        : "Aguardando você terminar de digitar…"}
                    </div>
                  )}

                  {youtubeSearchStatus === "error" && (
                    <div
                      role="alert"
                      className="flex min-h-12 items-center gap-3 rounded-xl border border-[#f0dfad] bg-[#fff9e9] px-4 text-sm leading-5 text-[#7b6129]"
                    >
                      <AlertTriangle size={18} className="shrink-0" />
                      {youtubeSearchError}
                    </div>
                  )}

                  {youtubeSearchStatus === "success" &&
                    youtubeSearchResults.length === 0 && (
                      <div className="rounded-xl border border-[#e5deda] bg-white px-4 py-3 text-sm text-[#6d6561]">
                        Nenhuma música encontrada. Tente escrever o nome do
                        artista junto com o título.
                      </div>
                    )}

                  {youtubeSearchResults.length > 0 && (
                    <div
                      id="youtube-search-results"
                      className="overflow-hidden rounded-2xl border border-[#ded7d2] bg-white shadow-[0_16px_38px_rgba(48,43,41,.1)]"
                    >
                      <div className="border-b border-[#eee8e4] px-4 py-3">
                        <strong className="text-sm">
                          Escolha uma música
                        </strong>
                        <span className="ml-2 text-xs text-[#776f6b]">
                          {youtubeSearchResults.length} resultado(s)
                        </span>
                      </div>
                      <ul className="divide-y divide-[#eee8e4]">
                        {youtubeSearchResults.map((result) => (
                          <li key={result.id}>
                            <button
                              type="button"
                              onClick={() => chooseYoutubeResult(result)}
                              className="group grid w-full grid-cols-[96px_1fr_auto] items-center gap-3 p-3 text-left transition hover:bg-[#fff7f7] focus:bg-[#fff7f7] focus:outline-none"
                            >
                              <span
                                role="img"
                                aria-label={`Miniatura de ${result.title}`}
                                className="relative block aspect-video overflow-hidden rounded-xl bg-[#e9e3df] bg-cover bg-center"
                                style={
                                  result.thumbnail
                                    ? {
                                        backgroundImage: `url(${JSON.stringify(
                                          result.thumbnail,
                                        )})`,
                                      }
                                    : undefined
                                }
                              >
                                {!result.thumbnail && (
                                  <Music2
                                    size={22}
                                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[#9c928d]"
                                  />
                                )}
                              </span>
                              <span className="min-w-0">
                                <strong className="block truncate text-sm text-[#302b29] group-hover:text-[#b41622]">
                                  {result.title}
                                </strong>
                                <span className="mt-1 block truncate text-xs text-[#776f6b]">
                                  {result.channel || "Canal do YouTube"}
                                  {result.duration
                                    ? ` • ${result.duration}`
                                    : ""}
                                </span>
                              </span>
                              <span className="inline-flex min-h-10 items-center rounded-xl bg-[#f5f1ee] px-3 text-xs font-extrabold text-[#4b4542] transition group-hover:bg-[#d9202c] group-hover:text-white">
                                Escolher
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selectedYoutubeResult && (
                    <div className="flex items-center gap-3 rounded-2xl border border-[#bfe0d0] bg-[#eef9f3] p-4 text-[#205f43]">
                      <CheckCircle2 size={21} className="shrink-0" />
                      <div className="min-w-0 flex-1">
                        <strong className="block truncate text-sm">
                          {selectedYoutubeResult.title}
                        </strong>
                        <span className="block truncate text-xs">
                          Pronta para baixar •{" "}
                          {selectedYoutubeResult.channel || "YouTube"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {downloadJob && (
                  <div
                    className={`mt-4 rounded-xl border p-4 ${
                      downloadJob.status === "failed"
                        ? "border-[#f1d0d3] bg-[#fff0f1]"
                        : "border-[#dfe9e4] bg-white"
                    }`}
                    role="status"
                  >
                    <div className="flex items-center justify-between gap-3 text-[12px]">
                      <strong>
                        {downloadJob.status === "queued"
                          ? "Aguardando início…"
                          : downloadJob.status === "downloading"
                            ? "Baixando faixa…"
                            : downloadJob.status === "processing"
                              ? "Preparando para reprodução…"
                              : downloadJob.status === "finished"
                                ? "Faixa pronta"
                                : "Não foi possível concluir"}
                      </strong>
                      <span className="font-extrabold tabular-nums">
                        {downloadJob.progress}%
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#eee8e4]">
                      <div
                        className={`h-full rounded-full transition-[width] ${
                          downloadJob.status === "failed"
                            ? "bg-[#d9202c]"
                            : "bg-[#31a36f]"
                        }`}
                        style={{ width: `${downloadJob.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {musicCompanionStatus === "unavailable" && (
                  <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[#f0dfad] bg-[#fff9e9] p-4 text-[12px] leading-5 text-[#7b6129] sm:flex-row sm:items-center">
                    <AlertTriangle size={18} className="shrink-0" />
                    <div className="flex-1">
                      <strong className="block">
                        Serviço de músicas indisponível
                      </strong>
                      <span>
                        As demais funções do caixa continuam disponíveis.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void syncMusicCompanion(true)}
                      className="min-h-10 rounded-xl border border-[#d7be79] bg-white px-4 font-extrabold text-[#6d5421] transition hover:border-[#a98029]"
                    >
                      Tentar novamente
                    </button>
                  </div>
                )}
              </form>
            </section>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_310px]">
              <section className="overflow-hidden rounded-[20px] border border-[#ebe5e1] bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-[#ebe5e1] p-5">
                  <div>
                    <span className="text-[9px] font-extrabold uppercase tracking-[.13em] text-[#9c928d]">
                      Biblioteca do caixa
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
                        Adicione uma música para começar a reprodução.
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
                        aria-pressed={currentTrackIndex === index}
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
                            {track.source === "yt-dlp"
                              ? "Biblioteca do caixa"
                              : "Arquivo selecionado"}{" "}
                            • {track.size}
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
                  Como a biblioteca funciona
                </h2>
                <ul className="mt-3 space-y-3">
                  {[
                    "Uma faixa por vez para evitar lotes acidentais",
                    "Faixas prontas para reprodução",
                    "Arquivos mantidos neste caixa",
                    "Biblioteca carregada ao abrir esta tela",
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
              </aside>
            </div>
          </div>
        )}

        {activeView === "configuracoes" && (
          <SettingsPanel
            activeOperatorId={activeOperator.id}
            credentials={operatorCredentials}
            recoveryCredential={pinRecoveryCredential}
            displayPreferences={displayPreferences}
            resolvedTheme={resolvedTheme}
            onCredentialChange={updateOperatorCredential}
            onRecoveryCredentialChange={setPinRecoveryCredential}
            onDisplayPreferencesChange={setDisplayPreferences}
            onMessage={showToast}
          />
        )}
      </main>

      <nav
        className="fixed bottom-[max(.75rem,env(safe-area-inset-bottom))] left-3 right-3 z-40 grid grid-cols-7 rounded-2xl border border-white/10 bg-[#211e1d]/96 p-1.5 text-white shadow-2xl backdrop-blur-xl lg:hidden"
        aria-label="Navegação móvel"
      >
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigateTo(item.id)}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-[50px] flex-col items-center justify-center gap-1 rounded-xl text-[7px] font-bold ${
                active ? "bg-[#d9202c] text-white" : "text-white/45"
              }`}
            >
              <Icon size={18} />
              {item.id === "venda"
                ? "Venda"
                : item.id === "configuracoes"
                  ? "Ajustes"
                  : item.label}
              {item.id === "comandas" && activeOrders.length > 0 && (
                <span className="absolute right-1 top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-white px-1 text-[9px] font-black text-[#d9202c]">
                  {activeOrders.length}
                </span>
              )}
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
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={modalContent?.aria}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
            className={`max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-[22px] bg-white p-5 shadow-2xl outline-none sm:p-6 ${
              modal === "product" ? "max-w-2xl" : "max-w-md"
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[9px] font-extrabold uppercase tracking-[.13em] text-[#d9202c]">
                  {modalContent?.eyebrow}
                </span>
                <h2 className="text-xl font-extrabold tracking-tight">
                  {modalContent?.title}
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

            {modal === "product" ? (
              <form onSubmit={submitProduct} className="mt-6 space-y-5">
                <div className="grid gap-4 sm:grid-cols-[1fr_110px]">
                  <label className="block">
                    <span className="mb-2 block text-sm font-extrabold text-[#5f5753]">
                      Nome do produto
                    </span>
                    <input
                      required
                      autoFocus
                      maxLength={80}
                      value={productForm.name}
                      onChange={(event) =>
                        setProductForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Ex.: X-Bacon"
                      className="h-12 w-full rounded-xl border border-[#ded7d2] px-4 text-base outline-none transition focus:border-[#d9202c] focus:ring-4 focus:ring-[#d9202c]/10"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-extrabold text-[#5f5753]">
                      Ícone
                    </span>
                    <input
                      maxLength={12}
                      value={productForm.emoji}
                      onChange={(event) =>
                        setProductForm((current) => ({
                          ...current,
                          emoji: event.target.value,
                        }))
                      }
                      aria-describedby="product-emoji-help"
                      className="h-12 w-full rounded-xl border border-[#ded7d2] px-3 text-center text-2xl outline-none transition focus:border-[#d9202c]"
                    />
                    <span
                      id="product-emoji-help"
                      className="mt-1 block text-center text-[11px] text-[#8d8581]"
                    >
                      Um emoji
                    </span>
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-extrabold text-[#5f5753]">
                      Categoria
                    </span>
                    <select
                      value={productForm.category}
                      onChange={(event) =>
                        setProductForm((current) => ({
                          ...current,
                          category: event.target.value as Product["category"],
                        }))
                      }
                      className="h-12 w-full rounded-xl border border-[#ded7d2] bg-white px-4 text-base outline-none focus:border-[#d9202c]"
                    >
                      {productCategories.map((productCategory) => (
                        <option value={productCategory} key={productCategory}>
                          {productCategory}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-extrabold text-[#5f5753]">
                      Preço de venda
                    </span>
                    <input
                      required
                      inputMode="decimal"
                      value={productForm.price}
                      onChange={(event) =>
                        setProductForm((current) => ({
                          ...current,
                          price: event.target.value,
                        }))
                      }
                      placeholder="R$ 0,00"
                      className="h-12 w-full rounded-xl border border-[#ded7d2] px-4 text-base font-bold outline-none transition focus:border-[#d9202c]"
                    />
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-extrabold text-[#5f5753]">
                      Quantidade atual
                    </span>
                    <input
                      required
                      type="number"
                      min="0"
                      step="1"
                      value={productForm.stock}
                      onChange={(event) =>
                        setProductForm((current) => ({
                          ...current,
                          stock: event.target.value,
                        }))
                      }
                      className="h-12 w-full rounded-xl border border-[#ded7d2] px-4 text-base font-bold outline-none transition focus:border-[#d9202c]"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-extrabold text-[#5f5753]">
                      Avisar quando chegar a
                    </span>
                    <input
                      required
                      type="number"
                      min="0"
                      step="1"
                      value={productForm.minimum}
                      onChange={(event) =>
                        setProductForm((current) => ({
                          ...current,
                          minimum: event.target.value,
                        }))
                      }
                      aria-describedby="product-minimum-help"
                      className="h-12 w-full rounded-xl border border-[#ded7d2] px-4 text-base font-bold outline-none transition focus:border-[#d9202c]"
                    />
                    <span
                      id="product-minimum-help"
                      className="mt-1.5 block text-xs leading-4 text-[#776f6b]"
                    >
                      Esse é o estoque mínimo para o alerta de reposição.
                    </span>
                  </label>
                </div>

                {productForm.id && (
                  <div className="rounded-xl border border-[#dfe9e4] bg-[#eef9f3] p-4 text-sm leading-5 text-[#276348]">
                    As alterações valem para as próximas vendas. Vendas antigas
                    continuam com o nome e o preço registrados no momento da
                    compra.
                  </div>
                )}

                <div className="flex flex-col-reverse gap-3 border-t border-[#eee8e4] pt-5 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="min-h-12 rounded-xl border border-[#ded7d2] px-5 text-sm font-extrabold text-[#5f5753] transition hover:bg-[#f7f5f2]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#d9202c] px-6 text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(217,32,44,.18)] transition hover:bg-[#b41622]"
                  >
                    <Check size={19} />
                    {productForm.id ? "Salvar alterações" : "Criar produto"}
                  </button>
                </div>
              </form>
            ) : modal === "product-delete" ? (
              <div className="mt-6">
                {productToDelete ? (
                  <>
                    <div className="flex items-center gap-4 rounded-2xl bg-[#fff7ec] p-4">
                      <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white text-3xl shadow-sm">
                        {productToDelete.emoji}
                      </span>
                      <div className="min-w-0">
                        <strong className="block truncate text-lg">
                          {productToDelete.name}
                        </strong>
                        <span className="text-sm text-[#776f6b]">
                          {productToDelete.stock} un. •{" "}
                          {currency.format(productToDelete.price)}
                        </span>
                      </div>
                    </div>
                    <p className="mt-5 text-base leading-6 text-[#4b4542]">
                      O produto deixará de aparecer no estoque e nas novas
                      vendas. <strong>As vendas antigas serão preservadas.</strong>
                    </p>
                    {cart.some(
                      (item) => item.productId === productToDelete.id,
                    ) && (
                      <div
                        role="alert"
                        className="mt-4 flex items-start gap-3 rounded-xl border border-[#f0dfad] bg-[#fff9e9] p-4 text-sm leading-5 text-[#7b6129]"
                      >
                        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                        Este produto está na comanda atual e também será
                        removido dela.
                      </div>
                    )}
                    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={() => setModal(null)}
                        className="min-h-12 rounded-xl border border-[#ded7d2] px-5 text-sm font-extrabold text-[#5f5753] transition hover:bg-[#f7f5f2]"
                      >
                        Manter produto
                      </button>
                      <button
                        type="button"
                        onClick={confirmProductDelete}
                        className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#b41622] px-6 text-sm font-extrabold text-white transition hover:bg-[#8f111a]"
                      >
                        <Trash2 size={18} />
                        Sim, excluir produto
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-[#776f6b]">
                    Esse produto já não está mais disponível.
                  </p>
                )}
              </div>
            ) : modal === "stock" ? (
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
                       step="1"
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
                <label className="block">
                  <span className="mb-1.5 block text-[9px] font-extrabold text-[#776f6b]">
                    Se houver custo, pago com
                  </span>
                  <select
                    value={stockForm.payment}
                    onChange={(event) =>
                      setStockForm((current) => ({
                        ...current,
                        payment: event.target.value as PaymentMethod,
                      }))
                    }
                    className="h-11 w-full rounded-xl border border-[#ebe5e1] bg-white px-3 text-xs outline-none"
                  >
                    <option value="Dinheiro">Dinheiro do caixa</option>
                    <option>Pix</option>
                    <option>Cartão</option>
                  </select>
                </label>
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
            ) : modal === "expense" ? (
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
                <label className="block">
                  <span className="mb-1.5 block text-[9px] font-extrabold text-[#776f6b]">
                    Forma usada para pagar
                  </span>
                  <select
                    value={expenseForm.payment}
                    onChange={(event) =>
                      setExpenseForm((current) => ({
                        ...current,
                        payment: event.target.value as PaymentMethod,
                      }))
                    }
                    className="h-11 w-full rounded-xl border border-[#ebe5e1] bg-white px-3 text-xs outline-none"
                  >
                    <option value="Dinheiro">Dinheiro do caixa</option>
                    <option>Pix</option>
                    <option>Cartão</option>
                  </select>
                </label>
                <button
                  type="submit"
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#302b29] text-xs font-extrabold text-white"
                >
                  <Check size={18} />
                  Salvar saída
                </button>
              </form>
            ) : modal === "cash-open" ? (
              <form onSubmit={submitCashOpen} className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-[9px] font-extrabold text-[#776f6b]">
                    Dinheiro inicial para troco
                  </span>
                  <input
                    required
                    autoFocus
                    inputMode="decimal"
                    value={cashOpenForm}
                    onChange={(event) => setCashOpenForm(event.target.value)}
                    placeholder="R$ 0,00"
                    className="h-11 w-full rounded-xl border border-[#ebe5e1] px-3 text-xs outline-none focus:border-[#d9202c]"
                  />
                </label>
                <div className="rounded-xl bg-[#f1eefc] p-3 text-[8px] leading-4 text-[#5e4893]">
                  Este valor inicia uma nova sessão. Pix e cartão aparecem no
                  financeiro, mas não entram no dinheiro físico do caixa.
                </div>
                <button
                  type="submit"
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#27865d] text-xs font-extrabold text-white"
                >
                  <Check size={18} />
                  Confirmar abertura
                </button>
              </form>
            ) : modal === "cash-close" ? (
              <form onSubmit={submitCashClose} className="mt-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-[#f7f5f2] p-3">
                    <span className="block text-[8px] text-[#776f6b]">
                      Saldo esperado
                    </span>
                    <strong className="mt-1 block text-lg">
                      {currency.format(cashBalance)}
                    </strong>
                  </div>
                  <div className="rounded-xl bg-[#f7f5f2] p-3">
                    <span className="block text-[8px] text-[#776f6b]">
                      Vendas em dinheiro
                    </span>
                    <strong className="mt-1 block text-lg">
                      {currency.format(cashSalesTotal)}
                    </strong>
                  </div>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-[9px] font-extrabold text-[#776f6b]">
                    Valor contado na gaveta
                  </span>
                  <input
                    required
                    autoFocus
                    inputMode="decimal"
                    value={cashCloseForm}
                    onChange={(event) => setCashCloseForm(event.target.value)}
                    placeholder="R$ 0,00"
                    className="h-11 w-full rounded-xl border border-[#ebe5e1] px-3 text-xs outline-none focus:border-[#d9202c]"
                  />
                </label>
                {cashCloseForm.trim() &&
                  Number.isFinite(parseAmount(cashCloseForm)) && (
                  <div
                    className={`rounded-xl p-3 text-[9px] font-bold ${
                      Math.abs(
                        roundMoney(parseAmount(cashCloseForm) - cashBalance),
                      ) < 0.005
                        ? "bg-[#eaf8f1] text-[#23734f]"
                        : "bg-[#fff9e9] text-[#8d6100]"
                    }`}
                  >
                    Diferença:{" "}
                    {currency.format(
                      roundMoney(parseAmount(cashCloseForm) - cashBalance),
                    )}
                  </div>
                )}
                <button
                  type="submit"
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#302b29] text-xs font-extrabold text-white"
                >
                  <Check size={18} />
                  Confirmar fechamento
                </button>
              </form>
            ) : (
              <form onSubmit={submitCashMovement} className="mt-5 space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {(["sangria", "suprimento"] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() =>
                        setCashMovementForm((current) => ({ ...current, kind }))
                      }
                      aria-pressed={cashMovementForm.kind === kind}
                      className={`min-h-11 rounded-xl border text-[10px] font-extrabold ${
                        cashMovementForm.kind === kind
                          ? "border-[#d9202c] bg-[#fff0f1] text-[#d9202c]"
                          : "border-[#ebe5e1] text-[#776f6b]"
                      }`}
                    >
                      {kind === "sangria"
                        ? "Retirar dinheiro"
                        : "Adicionar dinheiro"}
                    </button>
                  ))}
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-[9px] font-extrabold text-[#776f6b]">
                    Motivo
                  </span>
                  <input
                    required
                    value={cashMovementForm.description}
                    onChange={(event) =>
                      setCashMovementForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder={
                      cashMovementForm.kind === "sangria"
                        ? "Ex.: guardar dinheiro no cofre"
                        : "Ex.: reforço para troco"
                    }
                    className="h-11 w-full rounded-xl border border-[#ebe5e1] px-3 text-xs outline-none focus:border-[#d9202c]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[9px] font-extrabold text-[#776f6b]">
                    Valor
                  </span>
                  <input
                    required
                    inputMode="decimal"
                    value={cashMovementForm.amount}
                    onChange={(event) =>
                      setCashMovementForm((current) => ({
                        ...current,
                        amount: event.target.value,
                      }))
                    }
                    placeholder="R$ 0,00"
                    className="h-11 w-full rounded-xl border border-[#ebe5e1] px-3 text-xs outline-none focus:border-[#d9202c]"
                  />
                </label>
                <button
                  type="submit"
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#302b29] text-xs font-extrabold text-white"
                >
                  <Check size={18} />
                  Salvar movimentação
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
