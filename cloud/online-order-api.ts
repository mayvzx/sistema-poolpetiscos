import type { D1Database, D1Result } from "@cloudflare/workers-types";
import {
  parsePublicOrderInput,
  priceOnlineOrder,
  stableJson,
  transitionForAction,
  type OnlineOrderAction,
  type OnlinePaymentMethod,
  type OnlineOrderStatus,
  type PublicOrderInput,
} from "../features/online-orders/domain";

export interface OnlineOrderEnv {
  DB?: D1Database;
  POOL_INSTALLATION_TOKEN?: string;
  POOL_TRACKING_SECRET?: string;
  POOL_RATE_LIMIT_SALT?: string;
  POOL_STORE_SLUG?: string;
}

type StoreRow = {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  ordering_enabled: number;
  table_orders_enabled: number;
  pickup_orders_enabled: number;
  cash_open: number;
  catalog_version: number;
  last_heartbeat_at: number | null;
};

type ProductRow = {
  id: string;
  source_product_id: string;
  category_id: string | null;
  name: string;
  description: string;
  image_url: string | null;
  emoji: string;
  price_cents: number;
  available: number;
  sort_order: number;
};

type OrderRow = {
  order_number: number;
  id: string;
  store_id: string;
  status: OnlineOrderStatus;
  version: number;
  fulfillment_mode: "table" | "pickup";
  table_label_snapshot: string | null;
  customer_name: string;
  customer_note: string;
  payment_method: string;
  subtotal_cents: number;
  surcharge_rate_bps: number;
  surcharge_cents: number;
  total_cents: number;
  catalog_version: number;
  local_sale_id: string | null;
  rejection_reason: string | null;
  created_at: number;
  updated_at: number;
  expires_at: number;
};

type OrderItemRow = {
  id: string;
  product_id: string;
  source_product_id: string;
  name_snapshot: string;
  unit_price_cents: number;
  quantity: number;
  note: string;
  line_total_cents: number;
  sort_order: number;
};

type EventRow = {
  id: number;
  order_id: string;
  order_version: number;
  event_type: string;
  actor_type: string;
  created_at: number;
};

const API_PREFIX = "/api/v1/";
const MAX_JSON_BYTES = 64 * 1024;
const HEARTBEAT_FRESH_MS = 120_000;
const PENDING_EXPIRY_MS = 10 * 60_000;
const IDEMPOTENCY_RETENTION_MS = 48 * 60 * 60_000;
const COMMAND_RETENTION_MS = 30 * 24 * 60 * 60_000;
const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60_000;
const CLEANUP_BATCH_SIZE = 200;
const textEncoder = new TextEncoder();
const ONLINE_PAYMENT_METHODS = new Set<OnlinePaymentMethod>([
  "Pix",
  "Dinheiro",
  "Débito",
  "Crédito",
]);

function responseHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  headers.set("X-Frame-Options", "DENY");
  return headers;
}

function json(payload: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: responseHeaders(headers),
  });
}

function apiError(
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit,
): Response {
  return json({ error: { code, message } }, status, headers);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned.length <= maximum ? cleaned : null;
}

function integerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new ApiFailure(415, "CONTENT_TYPE", "Envie os dados em formato JSON.");
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) {
    throw new ApiFailure(413, "BODY_TOO_LARGE", "O pedido é muito grande.");
  }
  const serialized = await request.text();
  if (!serialized || textEncoder.encode(serialized).byteLength > MAX_JSON_BYTES) {
    throw new ApiFailure(400, "INVALID_BODY", "Conteúdo inválido.");
  }
  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    throw new ApiFailure(400, "INVALID_JSON", "Não foi possível ler os dados.");
  }
}

class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers?: HeadersInit,
  ) {
    super(message);
  }
}

function requireDb(env: OnlineOrderEnv): D1Database {
  if (!env.DB) {
    throw new ApiFailure(
      503,
      "DATABASE_UNAVAILABLE",
      "O cardápio está temporariamente indisponível.",
    );
  }
  return env.DB;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return toBase64Url(new Uint8Array(digest));
}

async function hmacSha256(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(value));
  return toBase64Url(new Uint8Array(signature));
}

function constantTimeEqual(left: string, right: string): boolean {
  const maximum = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maximum; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

function requireInstallation(request: Request, env: OnlineOrderEnv): void {
  const expected = env.POOL_INSTALLATION_TOKEN?.trim() ?? "";
  const supplied = bearerToken(request);
  if (expected.length < 32 || !supplied || !constantTimeEqual(expected, supplied)) {
    throw new ApiFailure(401, "UNAUTHORIZED", "Instalação não autorizada.");
  }
}

async function trackingToken(env: OnlineOrderEnv, orderId: string): Promise<string> {
  const secret = env.POOL_TRACKING_SECRET?.trim() ?? "";
  if (secret.length < 32) {
    throw new ApiFailure(
      503,
      "TRACKING_UNAVAILABLE",
      "O envio de pedidos ainda não foi ativado.",
    );
  }
  return hmacSha256(secret, `pool-order:v1:${orderId}`);
}

async function getStoreBySlug(db: D1Database, slug: string): Promise<StoreRow> {
  const store = await db
    .prepare(
      `SELECT id, slug, name, timezone, ordering_enabled, table_orders_enabled,
              pickup_orders_enabled, cash_open, catalog_version, last_heartbeat_at
       FROM stores WHERE slug = ? LIMIT 1`,
    )
    .bind(slug)
    .first<StoreRow>();
  if (!store) throw new ApiFailure(404, "STORE_NOT_FOUND", "Cardápio não encontrado.");
  return store;
}

async function getConfiguredStore(db: D1Database, env: OnlineOrderEnv): Promise<StoreRow> {
  const slug = env.POOL_STORE_SLUG?.trim() || "pool-petiscos";
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO stores (id, slug, name, timezone, created_at, updated_at)
       VALUES (?, ?, 'Pool Petiscos & Lanches', 'America/Sao_Paulo', ?, ?)
       ON CONFLICT(slug) DO NOTHING`,
    )
    .bind(slug, slug, now, now)
    .run();
  return getStoreBySlug(db, slug);
}

function acceptingOrders(store: StoreRow, now: number): boolean {
  return Boolean(
    store.ordering_enabled &&
      store.cash_open &&
      store.last_heartbeat_at &&
      now - store.last_heartbeat_at <= HEARTBEAT_FRESH_MS,
  );
}

export function calculateOrderTotalsForPayment(
  subtotalCents: number,
  paymentMethod: OnlinePaymentMethod,
): { surchargeRateBps: number; surchargeCents: number; totalCents: number } {
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0) {
    throw new Error("invalid order subtotal");
  }
  const surchargeRateBps =
    paymentMethod === "Débito" ? 300 : paymentMethod === "Crédito" ? 600 : 0;
  const surchargeCents = Math.round((subtotalCents * surchargeRateBps) / 10_000);
  const totalCents = subtotalCents + surchargeCents;
  if (!Number.isSafeInteger(totalCents)) throw new Error("invalid order total");
  return { surchargeRateBps, surchargeCents, totalCents };
}

async function cleanupExpiredRecords(db: D1Database, now: number): Promise<void> {
  await db.batch([
    db
      .prepare(
        `DELETE FROM rate_limit_events
         WHERE id IN (
           SELECT id FROM rate_limit_events
           WHERE created_at < ? ORDER BY created_at LIMIT ?
         )`,
      )
      .bind(now - RATE_LIMIT_RETENTION_MS, CLEANUP_BATCH_SIZE),
    db
      .prepare(
        `DELETE FROM request_idempotency
         WHERE rowid IN (
           SELECT rowid FROM request_idempotency
           WHERE expires_at <= ? ORDER BY expires_at LIMIT ?
         )`,
      )
      .bind(now, CLEANUP_BATCH_SIZE),
    db
      .prepare(
        `DELETE FROM installation_commands
         WHERE rowid IN (
           SELECT rowid FROM installation_commands
           WHERE created_at < ? ORDER BY created_at LIMIT ?
         )`,
      )
      .bind(now - COMMAND_RETENTION_MS, CLEANUP_BATCH_SIZE),
  ]);
}

async function expirePendingOrders(db: D1Database, storeId: string, now: number) {
  await db
    .prepare(
      `UPDATE public_orders
       SET status = 'expired', version = version + 1, updated_at = ?, last_actor_id = 'system'
       WHERE store_id = ? AND status = 'pending' AND expires_at <= ?`,
    )
    .bind(now, storeId, now)
    .run();
}

async function expirePendingOrder(db: D1Database, orderId: string, now: number) {
  await db
    .prepare(
      `UPDATE public_orders
       SET status = 'expired', version = version + 1, updated_at = ?, last_actor_id = 'system'
       WHERE id = ? AND status = 'pending' AND expires_at <= ?`,
    )
    .bind(now, orderId, now)
    .run();
}

async function orderSnapshot(db: D1Database, orderId: string) {
  const order = await db
    .prepare(
      `SELECT order_number, id, store_id, status, version, fulfillment_mode,
              table_label_snapshot, customer_name, customer_note, payment_method,
              subtotal_cents, surcharge_rate_bps, surcharge_cents, total_cents,
              catalog_version, local_sale_id, rejection_reason, created_at,
              updated_at, expires_at
       FROM public_orders WHERE id = ? LIMIT 1`,
    )
    .bind(orderId)
    .first<OrderRow>();
  if (!order) return null;
  const items = await db
    .prepare(
      `SELECT id, product_id, source_product_id, name_snapshot, unit_price_cents,
              quantity, note, line_total_cents, sort_order
       FROM public_order_items WHERE order_id = ? ORDER BY sort_order, id`,
    )
    .bind(orderId)
    .all<OrderItemRow>();
  return {
    id: order.id,
    number: order.order_number,
    status: order.status,
    version: order.version,
    fulfillmentMode: order.fulfillment_mode,
    tableLabel: order.table_label_snapshot,
    customerName: order.customer_name,
    customerNote: order.customer_note,
    paymentMethod: order.payment_method,
    subtotalCents: order.subtotal_cents,
    surchargeRate: order.surcharge_rate_bps / 10_000,
    surchargeCents: order.surcharge_cents,
    totalCents: order.total_cents,
    catalogVersion: order.catalog_version,
    localSaleId: order.local_sale_id,
    rejectionReason: order.rejection_reason,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    expiresAt: order.expires_at,
    items: items.results.map((item) => ({
      id: item.id,
      productId: item.source_product_id,
      name: item.name_snapshot,
      unitPriceCents: item.unit_price_cents,
      quantity: item.quantity,
      note: item.note,
      lineTotalCents: item.line_total_cents,
    })),
  };
}

async function handleMenu(
  request: Request,
  env: OnlineOrderEnv,
  slug: string,
): Promise<Response> {
  const db = requireDb(env);
  const store = await getStoreBySlug(db, slug);
  const now = Date.now();
  await expirePendingOrders(db, store.id, now);
  const url = new URL(request.url);
  const tableToken = url.searchParams.get("tableToken")?.trim() ?? "";
  let table: { label: string } | null = null;
  if (tableToken) {
    const tokenHash = await sha256(tableToken);
    const row = await db
      .prepare(
        `SELECT label FROM store_tables
         WHERE store_id = ? AND public_token_hash = ? AND enabled = 1 LIMIT 1`,
      )
      .bind(store.id, tokenHash)
      .first<{ label: string }>();
    if (!row) throw new ApiFailure(404, "TABLE_NOT_FOUND", "Este QR Code não é válido.");
    table = { label: row.label };
  }
  const [categories, products] = await Promise.all([
    db
      .prepare(
        `SELECT id, source_key, name, sort_order
         FROM catalog_categories
         WHERE store_id = ? AND visible = 1 ORDER BY sort_order, name`,
      )
      .bind(store.id)
      .all<{ id: string; source_key: string; name: string; sort_order: number }>(),
    db
      .prepare(
        `SELECT id, source_product_id, category_id, name, description, image_url,
                emoji, price_cents, available, sort_order
         FROM catalog_products
         WHERE store_id = ? AND visible = 1 ORDER BY sort_order, name`,
      )
      .bind(store.id)
      .all<ProductRow>(),
  ]);
  return json(
    {
      store: {
        slug: store.slug,
        name: store.name,
        acceptingOrders: acceptingOrders(store, now),
        table,
        modes: [
          ...(store.table_orders_enabled ? ["table"] : []),
          ...(store.pickup_orders_enabled ? ["pickup"] : []),
        ],
      },
      catalogVersion: store.catalog_version,
      categories: categories.results.map((category) => ({
        id: category.id,
        key: category.source_key,
        name: category.name,
        sortOrder: category.sort_order,
      })),
      products: products.results.map((product) => ({
        id: product.source_product_id,
        categoryId: product.category_id,
        name: product.name,
        description: product.description,
        imageUrl: product.image_url,
        emoji: product.emoji,
        priceCents: product.price_cents,
        available: Boolean(product.available),
        sortOrder: product.sort_order,
      })),
    },
    200,
    { "Cache-Control": "public, max-age=15, stale-while-revalidate=30" },
  );
}

async function checkRateLimit(
  request: Request,
  env: OnlineOrderEnv,
  db: D1Database,
  storeId: string,
  input: PublicOrderInput,
  now: number,
) {
  const salt = env.POOL_RATE_LIMIT_SALT?.trim() ?? "";
  if (salt.length < 16) {
    throw new ApiFailure(503, "RATE_LIMIT_UNAVAILABLE", "Pedidos ainda não foram ativados.");
  }
  const ip = request.headers.get("CF-Connecting-IP") ?? "local-preview";
  const ipHash = await sha256(`${salt}:ip:${ip}`);
  const deviceHash = await sha256(`${salt}:device:${input.deviceToken}`);
  const since = now - 10 * 60_000;
  const [ipCount, deviceCount, storeCount] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM rate_limit_events
         WHERE store_id = ? AND scope = 'ip' AND actor_hash = ? AND created_at >= ?`,
      )
      .bind(storeId, ipHash, since)
      .first<{ count: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM rate_limit_events
         WHERE store_id = ? AND scope = 'device' AND actor_hash = ? AND created_at >= ?`,
      )
      .bind(storeId, deviceHash, since)
      .first<{ count: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM public_orders
         WHERE store_id = ? AND created_at >= ?`,
      )
      .bind(storeId, now - 5 * 60_000)
      .first<{ count: number }>(),
  ]);
  if ((ipCount?.count ?? 0) >= 5 || (deviceCount?.count ?? 0) >= 3 || (storeCount?.count ?? 0) >= 30) {
    throw new ApiFailure(
      429,
      "TOO_MANY_ORDERS",
      "Aguarde alguns minutos antes de tentar novamente.",
      { "Retry-After": "120" },
    );
  }
  return { ipHash, deviceHash };
}

async function handleCreateOrder(
  request: Request,
  env: OnlineOrderEnv,
  slug: string,
): Promise<Response> {
  const db = requireDb(env);
  const now = Date.now();
  const parsed = parsePublicOrderInput(await readJson(request), now);
  if (!parsed.ok) throw new ApiFailure(422, "INVALID_ORDER", parsed.error);
  const input = parsed.value;
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) {
    throw new ApiFailure(400, "IDEMPOTENCY_KEY", "Atualize a página e tente novamente.");
  }
  const store = await getStoreBySlug(db, slug);
  const requestHash = await sha256(stableJson(input));
  const keyHash = await sha256(`${store.id}:${idempotencyKey}`);
  const existing = await db
    .prepare(
      `SELECT request_hash, order_id FROM request_idempotency
       WHERE store_id = ? AND key_hash = ? AND expires_at > ? LIMIT 1`,
    )
    .bind(store.id, keyHash, now)
    .first<{ request_hash: string; order_id: string }>();
  if (existing) {
    if (!constantTimeEqual(existing.request_hash, requestHash)) {
      throw new ApiFailure(409, "IDEMPOTENCY_REUSED", "O envio já foi usado por outro pedido.");
    }
    const snapshot = await orderSnapshot(db, existing.order_id);
    if (!snapshot) throw new ApiFailure(409, "ORDER_RECOVERY_FAILED", "Confirme o pedido no balcão.");
    return json(
      { order: snapshot, accessToken: await trackingToken(env, existing.order_id) },
      200,
      { "Cache-Control": "no-store" },
    );
  }
  await expirePendingOrders(db, store.id, now);
  if (!acceptingOrders(store, now)) {
    throw new ApiFailure(
      409,
      "STORE_OFFLINE",
      "Não estamos recebendo pedidos online agora. Faça seu pedido no balcão.",
    );
  }
  if (input.catalogVersion !== store.catalog_version) {
    throw new ApiFailure(422, "CATALOG_CHANGED", "O cardápio mudou. Confira seu pedido novamente.");
  }
  if (input.fulfillmentMode === "table" && !store.table_orders_enabled) {
    throw new ApiFailure(409, "TABLE_DISABLED", "Pedidos na mesa estão pausados.");
  }
  if (input.fulfillmentMode === "pickup" && !store.pickup_orders_enabled) {
    throw new ApiFailure(409, "PICKUP_DISABLED", "Pedidos para retirada estão pausados.");
  }

  let tableRow: { id: string; label: string } | null = null;
  if (input.fulfillmentMode === "table") {
    const tokenHash = await sha256(input.tableToken ?? "");
    tableRow = await db
      .prepare(
        `SELECT id, label FROM store_tables
         WHERE store_id = ? AND public_token_hash = ? AND enabled = 1 LIMIT 1`,
      )
      .bind(store.id, tokenHash)
      .first<{ id: string; label: string }>();
    if (!tableRow) throw new ApiFailure(404, "TABLE_NOT_FOUND", "Este QR Code não é válido.");
  }

  const productStatements = input.items.map((item) =>
    db
      .prepare(
        `SELECT id, source_product_id, category_id, name, description, image_url,
                emoji, price_cents, available, sort_order
         FROM catalog_products
         WHERE store_id = ? AND source_product_id = ? AND visible = 1 LIMIT 1`,
      )
      .bind(store.id, item.productId),
  );
  const productResults = (await db.batch(productStatements)) as D1Result<ProductRow>[];
  const products = productResults.flatMap((result) => result.results ?? []);
  const productMap = new Map(
    products.map((product) => [
      product.source_product_id,
      {
        productId: product.source_product_id,
        priceCents: product.price_cents,
        available: Boolean(product.available),
      },
    ]),
  );
  const pricing = priceOnlineOrder(input.items, productMap, input.paymentMethod);
  if (!pricing || products.length !== input.items.length) {
    throw new ApiFailure(422, "ITEM_UNAVAILABLE", "Um item não está mais disponível.");
  }

  await cleanupExpiredRecords(db, now);
  const limitKeys = await checkRateLimit(request, env, db, store.id, input, now);
  const orderId = crypto.randomUUID();
  const expiresAt = now + PENDING_EXPIRY_MS;
  const productBySource = new Map(products.map((product) => [product.source_product_id, product]));
  const statements = [
    db
      .prepare(
        `INSERT INTO public_orders (
          id, store_id, status, version, fulfillment_mode, table_id,
          table_label_snapshot, customer_name, customer_note, payment_method,
          subtotal_cents, surcharge_rate_bps, surcharge_cents, total_cents,
          catalog_version, created_at, updated_at, expires_at
        ) VALUES (?, ?, 'pending', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        orderId,
        store.id,
        input.fulfillmentMode,
        tableRow?.id ?? null,
        tableRow?.label ?? null,
        input.customerName,
        input.customerNote,
        input.paymentMethod,
        pricing.subtotalCents,
        Math.round(pricing.surchargeRate * 10_000),
        pricing.surchargeCents,
        pricing.totalCents,
        store.catalog_version,
        now,
        now,
        expiresAt,
      ),
    ...input.items.map((item, index) => {
      const product = productBySource.get(item.productId)!;
      return db
        .prepare(
          `INSERT INTO public_order_items (
            id, order_id, product_id, source_product_id, name_snapshot,
            unit_price_cents, quantity, note, line_total_cents, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          orderId,
          product.id,
          product.source_product_id,
          product.name,
          product.price_cents,
          item.quantity,
          item.note,
          product.price_cents * item.quantity,
          index,
        );
    }),
    db
      .prepare(
        `INSERT INTO order_events (
          store_id, order_id, order_version, event_type, actor_type, payload_json, created_at
        ) VALUES (?, ?, 1, 'order.pending', 'customer', '{}', ?)`,
      )
      .bind(store.id, orderId, now),
    db
      .prepare(
        `INSERT INTO request_idempotency (
          store_id, key_hash, request_hash, order_id, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(store.id, keyHash, requestHash, orderId, now, now + IDEMPOTENCY_RETENTION_MS),
    db
      .prepare(
        `INSERT INTO rate_limit_events (store_id, scope, actor_hash, created_at)
         VALUES (?, 'ip', ?, ?)`,
      )
      .bind(store.id, limitKeys.ipHash, now),
    db
      .prepare(
        `INSERT INTO rate_limit_events (store_id, scope, actor_hash, created_at)
         VALUES (?, 'device', ?, ?)`,
      )
      .bind(store.id, limitKeys.deviceHash, now),
  ];
  try {
    await db.batch(statements);
  } catch (error) {
    const raced = await db
      .prepare(
        `SELECT request_hash, order_id FROM request_idempotency
         WHERE store_id = ? AND key_hash = ? LIMIT 1`,
      )
      .bind(store.id, keyHash)
      .first<{ request_hash: string; order_id: string }>();
    if (!raced) throw error;
    if (!constantTimeEqual(raced.request_hash, requestHash)) {
      throw new ApiFailure(409, "IDEMPOTENCY_REUSED", "O envio já foi usado por outro pedido.");
    }
    const snapshot = await orderSnapshot(db, raced.order_id);
    if (!snapshot) {
      throw new ApiFailure(409, "ORDER_RECOVERY_FAILED", "Confirme o pedido no balcão.");
    }
    return json(
      { order: snapshot, accessToken: await trackingToken(env, raced.order_id) },
      200,
      { "Cache-Control": "no-store" },
    );
  }
  const snapshot = await orderSnapshot(db, orderId);
  return json(
    { order: snapshot, accessToken: await trackingToken(env, orderId) },
    201,
    { "Cache-Control": "no-store" },
  );
}

async function handleTracking(
  request: Request,
  env: OnlineOrderEnv,
  orderId: string,
): Promise<Response> {
  const db = requireDb(env);
  const expected = await trackingToken(env, orderId);
  if (!constantTimeEqual(expected, bearerToken(request))) {
    throw new ApiFailure(404, "ORDER_NOT_FOUND", "Pedido não encontrado.");
  }
  const before = await orderSnapshot(db, orderId);
  if (!before) throw new ApiFailure(404, "ORDER_NOT_FOUND", "Pedido não encontrado.");
  await expirePendingOrder(db, orderId, Date.now());
  const snapshot = await orderSnapshot(db, orderId);
  const events = await db
    .prepare(
      `SELECT id, order_id, order_version, event_type, actor_type, created_at
       FROM order_events WHERE order_id = ? ORDER BY id`,
    )
    .bind(orderId)
    .all<EventRow>();
  return json(
    {
      order: snapshot,
      timeline: events.results.map((event) => ({
        cursor: event.id,
        status: event.event_type.replace("order.", ""),
        createdAt: event.created_at,
      })),
    },
    200,
    { "Cache-Control": "no-store" },
  );
}

async function ensureInstallation(db: D1Database, storeId: string, payload?: Record<string, unknown>) {
  const now = Date.now();
  const appVersion = cleanString(payload?.appVersion ?? "", 40) || null;
  const localRevision = integerInRange(payload?.localRevision, 0, Number.MAX_SAFE_INTEGER);
  await db
    .prepare(
      `INSERT INTO installations (
        id, store_id, name, enabled, app_version, local_revision,
        last_seen_at, created_at, updated_at
      ) VALUES ('pool-primary', ?, 'Caixa principal', 1, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        app_version = COALESCE(excluded.app_version, installations.app_version),
        local_revision = COALESCE(excluded.local_revision, installations.local_revision),
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at`,
    )
    .bind(storeId, appVersion, localRevision, now, now, now)
    .run();
}

async function handleHeartbeat(request: Request, env: OnlineOrderEnv): Promise<Response> {
  requireInstallation(request, env);
  const db = requireDb(env);
  const payload = await readJson(request);
  if (!isRecord(payload)) throw new ApiFailure(422, "INVALID_HEARTBEAT", "Estado inválido.");
  if (typeof payload.cashOpen !== "boolean" || typeof payload.ordersEnabled !== "boolean") {
    throw new ApiFailure(422, "INVALID_HEARTBEAT", "Informe o estado do caixa e dos pedidos.");
  }
  const cashOpen = payload.cashOpen;
  const orderingEnabled = payload.ordersEnabled;
  const appVersion =
    payload.appVersion === undefined ? null : cleanString(payload.appVersion, 40);
  const localRevision =
    payload.localRevision === undefined
      ? null
      : integerInRange(payload.localRevision, 0, Number.MAX_SAFE_INTEGER);
  if (
    (payload.appVersion !== undefined && !appVersion) ||
    (payload.localRevision !== undefined && localRevision === null)
  ) {
    throw new ApiFailure(422, "INVALID_HEARTBEAT", "Versão local inválida.");
  }
  const store = await getConfiguredStore(db, env);
  const now = Date.now();
  await db.batch([
    db
      .prepare(
        `UPDATE stores SET ordering_enabled = ?, cash_open = ?,
          last_heartbeat_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(orderingEnabled ? 1 : 0, cashOpen ? 1 : 0, now, now, store.id),
    db
      .prepare(
        `INSERT INTO installations (
          id, store_id, name, enabled, app_version, local_revision,
          last_seen_at, created_at, updated_at
        ) VALUES ('pool-primary', ?, 'Caixa principal', 1, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          app_version = COALESCE(excluded.app_version, installations.app_version),
          local_revision = COALESCE(excluded.local_revision, installations.local_revision),
          last_seen_at = excluded.last_seen_at,
          updated_at = excluded.updated_at`,
      )
      .bind(
        store.id,
        appVersion,
        localRevision,
        now,
        now,
        now,
      ),
  ]);
  const cursor = await db
    .prepare("SELECT COALESCE(MAX(id), 0) AS cursor FROM order_events WHERE store_id = ?")
    .bind(store.id)
    .first<{ cursor: number }>();
  return json({
    connected: true,
    serverTime: now,
    catalogVersion: store.catalog_version,
    eventCursor: cursor?.cursor ?? 0,
    acceptingOrders: orderingEnabled && cashOpen,
  });
}

type CatalogPayload = {
  sourceRevision: number;
  categories: Array<{ key: string; name: string; sortOrder: number }>;
  products: Array<{
    id: string;
    categoryKey: string;
    name: string;
    description: string;
    imageUrl: string | null;
    emoji: string;
    priceCents: number;
    available: boolean;
    visible: boolean;
    sortOrder: number;
  }>;
};

function parseCatalog(value: unknown): CatalogPayload {
  if (!isRecord(value)) throw new ApiFailure(422, "INVALID_CATALOG", "Cardápio inválido.");
  const sourceRevision = integerInRange(value.sourceRevision, 0, Number.MAX_SAFE_INTEGER);
  if (sourceRevision === null || !Array.isArray(value.categories) || !Array.isArray(value.products)) {
    throw new ApiFailure(422, "INVALID_CATALOG", "Cardápio inválido.");
  }
  if (value.categories.length > 50 || value.products.length > 500) {
    throw new ApiFailure(422, "CATALOG_TOO_LARGE", "O cardápio excede o limite permitido.");
  }
  const categories = value.categories.map((item, index) => {
    if (!isRecord(item)) throw new ApiFailure(422, "INVALID_CATEGORY", "Categoria inválida.");
    const key = cleanString(item.key, 80);
    const name = cleanString(item.name, 80);
    if (!key || !name) throw new ApiFailure(422, "INVALID_CATEGORY", "Categoria inválida.");
    return { key, name, sortOrder: integerInRange(item.sortOrder, 0, 10_000) ?? index };
  });
  const categoryKeys = new Set(categories.map((category) => category.key));
  if (categoryKeys.size !== categories.length) {
    throw new ApiFailure(422, "DUPLICATE_CATEGORY", "Há categorias repetidas.");
  }
  const products = value.products.map((item, index) => {
    if (!isRecord(item)) throw new ApiFailure(422, "INVALID_PRODUCT", "Produto inválido.");
    const id = cleanString(item.id, 120);
    const categoryKey = cleanString(item.categoryKey, 80);
    const name = cleanString(item.name, 120);
    const description = cleanString(item.description ?? "", 500);
    const imageUrl = cleanString(item.imageUrl ?? "", 1_500);
    const emoji = cleanString(item.emoji ?? "🍔", 16);
    const priceCents = integerInRange(item.priceCents, 0, 100_000_000);
    if (!id || !categoryKey || !name || description === null || imageUrl === null || !emoji || priceCents === null || !categoryKeys.has(categoryKey)) {
      throw new ApiFailure(422, "INVALID_PRODUCT", "Produto inválido.");
    }
    return {
      id,
      categoryKey,
      name,
      description,
      imageUrl: imageUrl || null,
      emoji,
      priceCents,
      available: item.available !== false,
      visible: item.visible !== false,
      sortOrder: integerInRange(item.sortOrder, 0, 100_000) ?? index,
    };
  });
  if (new Set(products.map((product) => product.id)).size !== products.length) {
    throw new ApiFailure(422, "DUPLICATE_PRODUCT", "Há produtos repetidos.");
  }
  return { sourceRevision, categories, products };
}

async function handleCatalog(request: Request, env: OnlineOrderEnv): Promise<Response> {
  requireInstallation(request, env);
  const db = requireDb(env);
  const payload = parseCatalog(await readJson(request));
  const store = await getConfiguredStore(db, env);
  await ensureInstallation(db, store.id);
  const requestHash = await sha256(stableJson(payload));
  const existing = await db
    .prepare(
      `SELECT request_hash, catalog_version FROM catalog_publications
       WHERE installation_id = 'pool-primary' AND source_revision = ? LIMIT 1`,
    )
    .bind(payload.sourceRevision)
    .first<{ request_hash: string; catalog_version: number }>();
  if (existing) {
    if (!constantTimeEqual(existing.request_hash, requestHash)) {
      throw new ApiFailure(409, "REVISION_REUSED", "Esta revisão já publicou outro cardápio.");
    }
    return json({ published: true, catalogVersion: existing.catalog_version, repeated: true });
  }
  const latestPublication = await db
    .prepare(
      `SELECT MAX(source_revision) AS source_revision
       FROM catalog_publications WHERE installation_id = 'pool-primary'`,
    )
    .first<{ source_revision: number | null }>();
  if (
    latestPublication?.source_revision !== null &&
    latestPublication?.source_revision !== undefined &&
    payload.sourceRevision < latestPublication.source_revision
  ) {
    throw new ApiFailure(
      409,
      "STALE_REVISION",
      "Existe uma versão mais recente do cardápio publicada.",
    );
  }
  const now = Date.now();
  const nextVersion = store.catalog_version + 1;
  const categoryIds = new Map(
    payload.categories.map((category) => [
      category.key,
      `category:${store.id}:${category.key}`,
    ]),
  );
  const statements = [
    db.prepare("UPDATE catalog_categories SET visible = 0, updated_at = ? WHERE store_id = ?").bind(now, store.id),
    db.prepare("UPDATE catalog_products SET visible = 0, updated_at = ? WHERE store_id = ?").bind(now, store.id),
    ...payload.categories.map((category) =>
      db
        .prepare(
          `INSERT INTO catalog_categories (
            id, store_id, source_key, name, sort_order, visible, updated_at
          ) VALUES (?, ?, ?, ?, ?, 1, ?)
          ON CONFLICT(store_id, source_key) DO UPDATE SET
            name = excluded.name, sort_order = excluded.sort_order,
            visible = 1, updated_at = excluded.updated_at`,
        )
        .bind(
          categoryIds.get(category.key),
          store.id,
          category.key,
          category.name,
          category.sortOrder,
          now,
        ),
    ),
    ...payload.products.map((product) =>
      db
        .prepare(
          `INSERT INTO catalog_products (
            id, store_id, source_product_id, category_id, name, description,
            image_url, emoji, price_cents, visible, available, sort_order, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(store_id, source_product_id) DO UPDATE SET
            category_id = excluded.category_id, name = excluded.name,
            description = excluded.description, image_url = excluded.image_url,
            emoji = excluded.emoji, price_cents = excluded.price_cents,
            visible = excluded.visible, available = excluded.available,
            sort_order = excluded.sort_order, updated_at = excluded.updated_at`,
        )
        .bind(
          `product:${store.id}:${product.id}`,
          store.id,
          product.id,
          categoryIds.get(product.categoryKey),
          product.name,
          product.description,
          product.imageUrl,
          product.emoji,
          product.priceCents,
          product.visible ? 1 : 0,
          product.available ? 1 : 0,
          product.sortOrder,
          now,
        ),
    ),
    db
      .prepare("UPDATE stores SET catalog_version = ?, updated_at = ? WHERE id = ?")
      .bind(nextVersion, now, store.id),
    db
      .prepare(
        `INSERT INTO catalog_publications (
          installation_id, source_revision, request_hash, catalog_version, created_at
        ) VALUES ('pool-primary', ?, ?, ?, ?)`,
      )
      .bind(payload.sourceRevision, requestHash, nextVersion, now),
  ];
  await db.batch(statements);
  return json({ published: true, catalogVersion: nextVersion, repeated: false }, 201);
}

async function handleTables(request: Request, env: OnlineOrderEnv): Promise<Response> {
  requireInstallation(request, env);
  const db = requireDb(env);
  const value = await readJson(request);
  if (!isRecord(value) || !Array.isArray(value.tables) || value.tables.length > 100) {
    throw new ApiFailure(422, "INVALID_TABLES", "Lista de mesas inválida.");
  }
  const tables = await Promise.all(
    value.tables.map(async (candidate) => {
      if (!isRecord(candidate)) throw new ApiFailure(422, "INVALID_TABLE", "Mesa inválida.");
      const label = cleanString(candidate.label, 40);
      const token = cleanString(candidate.token, 160);
      if (!label || !token || token.length < 24) {
        throw new ApiFailure(422, "INVALID_TABLE", "Mesa inválida.");
      }
      const labelHash = await sha256(`table:${label.toLocaleLowerCase("pt-BR")}`);
      return { label, labelHash, tokenHash: await sha256(token) };
    }),
  );
  if (new Set(tables.map((table) => table.label.toLocaleLowerCase("pt-BR"))).size !== tables.length) {
    throw new ApiFailure(422, "DUPLICATE_TABLE", "Há mesas repetidas.");
  }
  if (new Set(tables.map((table) => table.tokenHash)).size !== tables.length) {
    throw new ApiFailure(422, "DUPLICATE_TABLE_TOKEN", "Cada mesa precisa ter seu próprio QR Code.");
  }
  const store = await getConfiguredStore(db, env);
  const now = Date.now();
  await db.batch([
    db.prepare("UPDATE store_tables SET enabled = 0, updated_at = ? WHERE store_id = ?").bind(now, store.id),
    ...tables.map((table) =>
      db
        .prepare(
          `INSERT INTO store_tables (
            id, store_id, label, public_token_hash, enabled, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT(store_id, label) DO UPDATE SET
            public_token_hash = excluded.public_token_hash, enabled = 1,
            updated_at = excluded.updated_at`,
        )
        .bind(
          `table:${store.id}:${table.labelHash.slice(0, 32)}`,
          store.id,
          table.label,
          table.tokenHash,
          now,
          now,
        ),
    ),
  ]);
  return json({ configured: true, count: tables.length });
}

async function handleOrderEvents(request: Request, env: OnlineOrderEnv): Promise<Response> {
  requireInstallation(request, env);
  const db = requireDb(env);
  const store = await getConfiguredStore(db, env);
  await ensureInstallation(db, store.id);
  const url = new URL(request.url);
  const after = Math.max(0, Number.parseInt(url.searchParams.get("after") ?? "0", 10) || 0);
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
  await expirePendingOrders(db, store.id, Date.now());
  const result = await db
    .prepare(
      `SELECT id, order_id, order_version, event_type, actor_type, created_at
       FROM order_events WHERE store_id = ? AND id > ? ORDER BY id LIMIT ?`,
    )
    .bind(store.id, after, limit)
    .all<EventRow>();
  const orderIds = [...new Set(result.results.map((event) => event.order_id))];
  const snapshots = new Map<string, Awaited<ReturnType<typeof orderSnapshot>>>();
  await Promise.all(
    orderIds.map(async (orderId) => snapshots.set(orderId, await orderSnapshot(db, orderId))),
  );
  const events = result.results.map((event) => ({
    cursor: event.id,
    type: event.event_type,
    orderVersion: event.order_version,
    createdAt: event.created_at,
    order: snapshots.get(event.order_id),
  }));
  return json({
    events,
    nextCursor: events.at(-1)?.cursor ?? after,
    hasMore: events.length === limit,
  });
}

async function handleOrderAction(
  request: Request,
  env: OnlineOrderEnv,
  orderId: string,
): Promise<Response> {
  requireInstallation(request, env);
  const db = requireDb(env);
  const store = await getConfiguredStore(db, env);
  await ensureInstallation(db, store.id);
  const value = await readJson(request);
  if (!isRecord(value)) throw new ApiFailure(422, "INVALID_ACTION", "Ação inválida.");
  const mutationId = cleanString(value.localMutationId, 100);
  const expectedVersion = integerInRange(value.expectedVersion, 1, Number.MAX_SAFE_INTEGER);
  const action = cleanString(value.action, 20) as OnlineOrderAction | null;
  if (!mutationId || !/^[A-Za-z0-9_-]{16,100}$/.test(mutationId) || expectedVersion === null || !action || !["accept", "reject", "start", "ready", "complete", "cancel"].includes(action)) {
    throw new ApiFailure(422, "INVALID_ACTION", "Ação inválida.");
  }
  const requestHash = await sha256(stableJson({ orderId, payload: value }));
  const existing = await db
    .prepare(
      `SELECT request_hash, order_id, resulting_version FROM installation_commands
       WHERE installation_id = 'pool-primary' AND mutation_id = ? LIMIT 1`,
    )
    .bind(mutationId)
    .first<{ request_hash: string; order_id: string; resulting_version: number }>();
  if (existing) {
    if (
      existing.order_id !== orderId ||
      !constantTimeEqual(existing.request_hash, requestHash)
    ) {
      throw new ApiFailure(409, "MUTATION_REUSED", "Esta ação já foi usada com outros dados.");
    }
    const snapshot = await orderSnapshot(db, existing.order_id);
    if (!snapshot) {
      throw new ApiFailure(409, "ORDER_RECOVERY_FAILED", "Não foi possível recuperar o pedido.");
    }
    return json({ order: snapshot, repeated: true });
  }
  const current = await db
    .prepare(
      `SELECT status, version, subtotal_cents
       FROM public_orders WHERE id = ? AND store_id = ? LIMIT 1`,
    )
    .bind(orderId, store.id)
    .first<{ status: OnlineOrderStatus; version: number; subtotal_cents: number }>();
  if (!current) throw new ApiFailure(404, "ORDER_NOT_FOUND", "Pedido não encontrado.");
  if (current.version !== expectedVersion) {
    return apiError(409, "VERSION_CONFLICT", "O pedido foi atualizado em outro lugar.");
  }
  const nextStatus = transitionForAction(current.status, action);
  if (!nextStatus) throw new ApiFailure(409, "INVALID_TRANSITION", "Esta ação não é permitida agora.");
  const reason = cleanString(value.reason ?? "", 180);
  const localSaleId = cleanString(value.localSaleId ?? "", 120);
  const paymentCandidate = cleanString(value.paymentMethod ?? "", 20);
  const paymentMethod = ONLINE_PAYMENT_METHODS.has(
    paymentCandidate as OnlinePaymentMethod,
  )
    ? (paymentCandidate as OnlinePaymentMethod)
    : null;
  if ((action === "reject" || action === "cancel") && reason === null) {
    throw new ApiFailure(422, "INVALID_REASON", "Motivo inválido.");
  }
  if (action === "complete" && (!localSaleId || !paymentMethod)) {
    throw new ApiFailure(422, "SALE_REQUIRED", "Informe a venda e a forma de pagamento.");
  }
  const completionTotals = paymentMethod
    ? calculateOrderTotalsForPayment(current.subtotal_cents, paymentMethod)
    : null;
  if (action === "complete" && localSaleId) {
    const saleOwner = await db
      .prepare(
        `SELECT id FROM public_orders
         WHERE store_id = ? AND local_sale_id = ? AND id <> ? LIMIT 1`,
      )
      .bind(store.id, localSaleId, orderId)
      .first<{ id: string }>();
    if (saleOwner) {
      throw new ApiFailure(409, "LOCAL_SALE_REUSED", "Esta venda local já concluiu outro pedido.");
    }
  }
  const now = Date.now();
  const actorMarker = `pool-primary:${mutationId}`;
  try {
    const [updateResult, commandResult] = await db.batch([
      db
        .prepare(
          `UPDATE public_orders SET
            status = ?, version = version + 1, updated_at = ?, last_actor_id = ?,
            rejection_reason = CASE WHEN ? IN ('rejected','cancelled') THEN ? ELSE rejection_reason END,
            local_sale_id = CASE WHEN ? = 'completed' THEN ? ELSE local_sale_id END,
            payment_method = CASE WHEN ? = 'completed' THEN ? ELSE payment_method END,
            surcharge_rate_bps = CASE WHEN ? = 'completed' THEN ? ELSE surcharge_rate_bps END,
            surcharge_cents = CASE WHEN ? = 'completed' THEN ? ELSE surcharge_cents END,
            total_cents = CASE WHEN ? = 'completed' THEN ? ELSE total_cents END
           WHERE id = ? AND store_id = ? AND status = ? AND version = ?`,
        )
        .bind(
          nextStatus,
          now,
          actorMarker,
          nextStatus,
          reason || null,
          nextStatus,
          localSaleId || null,
          nextStatus,
          paymentMethod,
          nextStatus,
          completionTotals?.surchargeRateBps ?? null,
          nextStatus,
          completionTotals?.surchargeCents ?? null,
          nextStatus,
          completionTotals?.totalCents ?? null,
          orderId,
          store.id,
          current.status,
          expectedVersion,
        ),
      db
        .prepare(
          `INSERT INTO installation_commands (
            installation_id, mutation_id, order_id, request_hash, resulting_version, created_at
          )
          SELECT 'pool-primary', ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM public_orders
            WHERE id = ? AND store_id = ? AND status = ? AND version = ?
              AND last_actor_id = ?
          )`,
        )
        .bind(
          mutationId,
          orderId,
          requestHash,
          expectedVersion + 1,
          now,
          orderId,
          store.id,
          nextStatus,
          expectedVersion + 1,
          actorMarker,
        ),
    ]);
    if (
      (updateResult.meta.changes ?? 0) !== 1 ||
      (commandResult.meta.changes ?? 0) !== 1
    ) {
      const raced = await db
        .prepare(
          `SELECT request_hash, order_id FROM installation_commands
           WHERE installation_id = 'pool-primary' AND mutation_id = ? LIMIT 1`,
        )
        .bind(mutationId)
        .first<{ request_hash: string; order_id: string }>();
      if (
        raced?.order_id === orderId &&
        constantTimeEqual(raced.request_hash, requestHash)
      ) {
        const snapshot = await orderSnapshot(db, raced.order_id);
        if (!snapshot) {
          throw new ApiFailure(409, "ORDER_RECOVERY_FAILED", "Não foi possível recuperar o pedido.");
        }
        return json({ order: snapshot, repeated: true });
      }
      throw new ApiFailure(409, "VERSION_CONFLICT", "O pedido foi atualizado em outro lugar.");
    }
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    const raced = await db
      .prepare(
        `SELECT request_hash, order_id FROM installation_commands
         WHERE installation_id = 'pool-primary' AND mutation_id = ? LIMIT 1`,
      )
      .bind(mutationId)
      .first<{ request_hash: string; order_id: string }>();
    if (
      raced &&
      raced.order_id === orderId &&
      constantTimeEqual(raced.request_hash, requestHash)
    ) {
      const snapshot = await orderSnapshot(db, raced.order_id);
      if (!snapshot) {
        throw new ApiFailure(409, "ORDER_RECOVERY_FAILED", "Não foi possível recuperar o pedido.");
      }
      return json({ order: snapshot, repeated: true });
    }
    if (raced) {
      throw new ApiFailure(409, "MUTATION_REUSED", "Esta ação já foi usada com outros dados.");
    }
    if (action === "complete" && localSaleId) {
      const saleOwner = await db
        .prepare(
          `SELECT id FROM public_orders
           WHERE store_id = ? AND local_sale_id = ? AND id <> ? LIMIT 1`,
        )
        .bind(store.id, localSaleId, orderId)
        .first<{ id: string }>();
      if (saleOwner) {
        throw new ApiFailure(409, "LOCAL_SALE_REUSED", "Esta venda local já concluiu outro pedido.");
      }
    }
    const latest = await db
      .prepare("SELECT version FROM public_orders WHERE id = ? AND store_id = ? LIMIT 1")
      .bind(orderId, store.id)
      .first<{ version: number }>();
    if (!latest || latest.version !== expectedVersion) {
      throw new ApiFailure(409, "VERSION_CONFLICT", "O pedido foi atualizado em outro lugar.");
    }
    throw error;
  }
  return json({ order: await orderSnapshot(db, orderId), repeated: false });
}

export async function handleOnlineOrderApi(
  request: Request,
  env: OnlineOrderEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(API_PREFIX)) return null;
  try {
    const menuMatch = url.pathname.match(/^\/api\/v1\/public\/stores\/([^/]+)\/menu$/);
    if (menuMatch && request.method === "GET") {
      return await handleMenu(request, env, decodeURIComponent(menuMatch[1]));
    }
    const createMatch = url.pathname.match(/^\/api\/v1\/public\/stores\/([^/]+)\/orders$/);
    if (createMatch && request.method === "POST") {
      return await handleCreateOrder(request, env, decodeURIComponent(createMatch[1]));
    }
    const trackingMatch = url.pathname.match(/^\/api\/v1\/public\/orders\/([^/]+)$/);
    if (trackingMatch && request.method === "GET") {
      return await handleTracking(request, env, decodeURIComponent(trackingMatch[1]));
    }
    if (url.pathname === "/api/v1/operator/heartbeat" && request.method === "POST") {
      return await handleHeartbeat(request, env);
    }
    if (url.pathname === "/api/v1/operator/catalog" && request.method === "PUT") {
      return await handleCatalog(request, env);
    }
    if (url.pathname === "/api/v1/operator/tables" && request.method === "PUT") {
      return await handleTables(request, env);
    }
    if (url.pathname === "/api/v1/operator/order-events" && request.method === "GET") {
      return await handleOrderEvents(request, env);
    }
    const actionMatch = url.pathname.match(/^\/api\/v1\/operator\/orders\/([^/]+)\/actions$/);
    if (actionMatch && request.method === "POST") {
      return await handleOrderAction(request, env, decodeURIComponent(actionMatch[1]));
    }
    return apiError(404, "ROUTE_NOT_FOUND", "Rota não encontrada.");
  } catch (error) {
    if (error instanceof ApiFailure) {
      return apiError(error.status, error.code, error.message, error.headers);
    }
    console.error("[online-orders] request failed", error instanceof Error ? error.message : "unknown");
    return apiError(500, "INTERNAL_ERROR", "Não foi possível concluir a operação agora.");
  }
}
