import {
  ClipboardList,
  LayoutDashboard,
  Music2,
  Package,
  Settings,
  ShoppingCart,
  WalletCards,
} from "lucide-react";
import { INITIAL_PRODUCTS } from "./catalog-data";
import { currency } from "./domain";
import { DEFAULT_CASH_FUND } from "./domain";
import { parsePoolState, STORAGE_KEY } from "./persistence";
import type { PersistedPoolState, Product, View } from "./types";

export const categories = [
  "Todos",
  "Hambúrgueres",
  "Salgados",
  "Petiscos",
  "Sobremesas",
  "Bebidas",
  "Adicionais",
] as const;

export const productCategories = categories.slice(
  1,
) as readonly Product["category"][];

export const navigation = [
  { id: "inicio" as const, label: "Início", icon: LayoutDashboard },
  { id: "venda" as const, label: "Nova venda", icon: ShoppingCart },
  { id: "comandas" as const, label: "Comandas", icon: ClipboardList },
  { id: "estoque" as const, label: "Estoque", icon: Package },
  { id: "financeiro" as const, label: "Financeiro", icon: WalletCards },
  { id: "musica" as const, label: "Músicas", icon: Music2 },
  { id: "configuracoes" as const, label: "Configurações", icon: Settings },
];

const views = new Set<View>(navigation.map((item) => item.id));

export const PENDING_SYNC_KEY = `${STORAGE_KEY}.pending-v1`;

export type PendingStateSync = {
  state: PersistedPoolState;
  expectedRevision: number | null;
  savedAt: string;
};

export type ProductFormState = {
  id: string | null;
  name: string;
  category: Product["category"];
  price: string;
  stock: string;
  minimum: string;
  emoji: string;
};

export type YoutubeSearchResult = {
  id: string;
  title: string;
  channel: string;
  duration: string;
  thumbnail: string;
  url: string;
};

export type YoutubeSearchStatus =
  | "idle"
  | "waiting"
  | "loading"
  | "success"
  | "error";

export function createProductForm(product?: Product): ProductFormState {
  return {
    id: product?.id ?? null,
    name: product?.name ?? "",
    category: product?.category ?? "Salgados",
    price: product ? currency.format(product.price).replace("R$", "").trim() : "",
    stock: String(product?.stock ?? 0),
    minimum: String(product?.minimum ?? 0),
    emoji: product?.emoji ?? "🍽️",
  };
}

export function isCompleteWebUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseYoutubeSearchResults(
  payload: unknown,
): YoutubeSearchResult[] {
  const source =
    Array.isArray(payload)
      ? payload
      : payload &&
          typeof payload === "object" &&
          "results" in payload &&
          Array.isArray(payload.results)
        ? payload.results
        : [];

  return source
    .map((candidate): YoutubeSearchResult | null => {
      if (!candidate || typeof candidate !== "object") return null;
      const item = candidate as Record<string, unknown>;
      const id =
        typeof item.id === "string"
          ? item.id
          : typeof item.video_id === "string"
            ? item.video_id
            : "";
      const title = typeof item.title === "string" ? item.title.trim() : "";
      const channel =
        typeof item.channel === "string"
          ? item.channel.trim()
          : typeof item.uploader === "string"
            ? item.uploader.trim()
            : "Canal do YouTube";
      const duration =
        typeof item.duration === "string"
          ? item.duration
          : typeof item.duration === "number" &&
              Number.isFinite(item.duration) &&
              item.duration >= 0
            ? `${Math.floor(item.duration / 60)}:${String(
                Math.floor(item.duration % 60),
              ).padStart(2, "0")}`
            : typeof item.duration_label === "string"
              ? item.duration_label
              : "";
      const thumbnail =
        typeof item.thumbnail === "string" ? item.thumbnail : "";
      const url =
        typeof item.url === "string"
          ? item.url
          : id
            ? `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`
            : "";
      if (!id || !title || !isCompleteWebUrl(url)) return null;
      return { id, title, channel, duration, thumbnail, url };
    })
    .filter((item): item is YoutubeSearchResult => item !== null)
    .slice(0, 5);
}

export function readCompanionError(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    const message = payload.error.trim();
    if (message && message.length <= 300) return message;
  }
  return fallback;
}

export function parsePendingStateSync(
  value: string | null,
): PendingStateSync | null {
  if (!value) return null;
  try {
    const candidate = JSON.parse(value) as {
      state?: unknown;
      expectedRevision?: unknown;
      savedAt?: unknown;
    };
    const state = parsePoolState(candidate.state);
    const expectedRevision =
      candidate.expectedRevision === null ||
      (Number.isInteger(candidate.expectedRevision) &&
        Number(candidate.expectedRevision) >= 0)
        ? (candidate.expectedRevision as number | null)
        : undefined;
    if (
      !state ||
      expectedRevision === undefined ||
      typeof candidate.savedAt !== "string" ||
      !Number.isFinite(Date.parse(candidate.savedAt))
    ) {
      return null;
    }
    return { state, expectedRevision, savedAt: candidate.savedAt };
  } catch {
    return null;
  }
}

export function viewFromLocation(): View | null {
  const candidate = window.location.hash.replace(/^#/, "");
  return views.has(candidate as View) ? (candidate as View) : null;
}

export function createInitialPoolState(): PersistedPoolState {
  return {
    products: INITIAL_PRODUCTS.map((product) => ({ ...product })),
    sales: [],
    expenses: [],
    cashOpen: false,
    openingBalance: 0,
    cashFund: DEFAULT_CASH_FUND,
    cashOpenedAt: Date.now(),
    activeCashSession: null,
    cashMovements: [],
    cashClosures: [],
    operatorCredentials: {},
  };
}
