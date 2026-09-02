import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const stores = sqliteTable(
  "stores",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
    orderingEnabled: integer("ordering_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    tableOrdersEnabled: integer("table_orders_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    pickupOrdersEnabled: integer("pickup_orders_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    cashOpen: integer("cash_open", { mode: "boolean" })
      .notNull()
      .default(false),
    catalogVersion: integer("catalog_version").notNull().default(0),
    lastHeartbeatAt: integer("last_heartbeat_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [uniqueIndex("idx_stores_slug").on(table.slug)],
);

export const storeTables = sqliteTable(
  "store_tables",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    publicTokenHash: text("public_token_hash").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_store_tables_store_label").on(table.storeId, table.label),
    uniqueIndex("idx_store_tables_token").on(table.publicTokenHash),
  ],
);

export const catalogCategories = sqliteTable(
  "catalog_categories",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    sourceKey: text("source_key").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    visible: integer("visible", { mode: "boolean" }).notNull().default(true),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_categories_store_source").on(table.storeId, table.sourceKey),
  ],
);

export const catalogProducts = sqliteTable(
  "catalog_products",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    sourceProductId: text("source_product_id").notNull(),
    categoryId: text("category_id").references(() => catalogCategories.id),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    imageUrl: text("image_url"),
    emoji: text("emoji").notNull().default("🍔"),
    priceCents: integer("price_cents").notNull(),
    visible: integer("visible", { mode: "boolean" }).notNull().default(true),
    available: integer("available", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_products_store_source").on(
      table.storeId,
      table.sourceProductId,
    ),
    index("idx_products_store_visible").on(
      table.storeId,
      table.visible,
      table.available,
      table.sortOrder,
    ),
    check("catalog_products_price_nonnegative", sql`${table.priceCents} >= 0`),
  ],
);

export const installations = sqliteTable(
  "installations",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    appVersion: text("app_version"),
    localRevision: integer("local_revision"),
    lastSeenAt: integer("last_seen_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_installations_store_seen").on(
      table.storeId,
      table.enabled,
      table.lastSeenAt,
    ),
  ],
);

export const publicOrders = sqliteTable(
  "public_orders",
  {
    orderNumber: integer("order_number").primaryKey({ autoIncrement: true }),
    id: text("id").notNull(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    status: text("status").notNull(),
    version: integer("version").notNull().default(1),
    fulfillmentMode: text("fulfillment_mode").notNull(),
    tableId: text("table_id").references(() => storeTables.id),
    tableLabelSnapshot: text("table_label_snapshot"),
    customerName: text("customer_name").notNull(),
    customerNote: text("customer_note").notNull().default(""),
    paymentMethod: text("payment_method").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    surchargeRateBps: integer("surcharge_rate_bps").notNull().default(0),
    surchargeCents: integer("surcharge_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    catalogVersion: integer("catalog_version").notNull(),
    localSaleId: text("local_sale_id"),
    rejectionReason: text("rejection_reason"),
    lastActorId: text("last_actor_id"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_public_orders_id").on(table.id),
    uniqueIndex("idx_public_orders_local_sale").on(table.localSaleId),
    index("idx_orders_store_status_created").on(
      table.storeId,
      table.status,
      table.createdAt,
    ),
    check(
      "public_orders_status",
      sql`${table.status} IN ('pending','accepted','preparing','ready','completed','rejected','cancelled','expired')`,
    ),
    check(
      "public_orders_mode",
      sql`${table.fulfillmentMode} IN ('table','pickup')`,
    ),
    check(
      "public_orders_table_matches_mode",
      sql`(${table.fulfillmentMode} = 'table' AND ${table.tableId} IS NOT NULL) OR (${table.fulfillmentMode} = 'pickup' AND ${table.tableId} IS NULL)`,
    ),
    check(
      "public_orders_payment_method",
      sql`${table.paymentMethod} IN ('Pix','Dinheiro','Débito','Crédito')`,
    ),
    check("public_orders_version_positive", sql`${table.version} >= 1`),
    check("public_orders_subtotal_nonnegative", sql`${table.subtotalCents} >= 0`),
    check(
      "public_orders_surcharge_rate",
      sql`${table.surchargeRateBps} BETWEEN 0 AND 10000`,
    ),
    check("public_orders_surcharge_nonnegative", sql`${table.surchargeCents} >= 0`),
    check(
      "public_orders_total_matches",
      sql`${table.totalCents} = ${table.subtotalCents} + ${table.surchargeCents}`,
    ),
  ],
);

export const publicOrderItems = sqliteTable(
  "public_order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => publicOrders.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => catalogProducts.id),
    sourceProductId: text("source_product_id").notNull(),
    nameSnapshot: text("name_snapshot").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    note: text("note").notNull().default(""),
    lineTotalCents: integer("line_total_cents").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("idx_order_items_order").on(table.orderId, table.sortOrder),
    check("order_items_unit_price_nonnegative", sql`${table.unitPriceCents} >= 0`),
    check("order_items_quantity", sql`${table.quantity} BETWEEN 1 AND 20`),
    check(
      "order_items_line_total",
      sql`${table.lineTotalCents} = ${table.unitPriceCents} * ${table.quantity}`,
    ),
  ],
);

export const orderEvents = sqliteTable(
  "order_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    orderId: text("order_id")
      .notNull()
      .references(() => publicOrders.id, { onDelete: "cascade" }),
    orderVersion: integer("order_version").notNull(),
    eventType: text("event_type").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    payloadJson: text("payload_json").notNull().default("{}"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_events_store_cursor").on(table.storeId, table.id)],
);

export const requestIdempotency = sqliteTable(
  "request_idempotency",
  {
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    keyHash: text("key_hash").notNull(),
    requestHash: text("request_hash").notNull(),
    orderId: text("order_id")
      .notNull()
      .references(() => publicOrders.id),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.storeId, table.keyHash] }),
    index("idx_request_idempotency_expiry").on(table.expiresAt),
  ],
);

export const installationCommands = sqliteTable(
  "installation_commands",
  {
    installationId: text("installation_id")
      .notNull()
      .references(() => installations.id, { onDelete: "cascade" }),
    mutationId: text("mutation_id").notNull(),
    orderId: text("order_id")
      .notNull()
      .references(() => publicOrders.id),
    requestHash: text("request_hash").notNull(),
    resultingVersion: integer("resulting_version").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.installationId, table.mutationId] }),
    index("idx_installation_commands_created").on(table.createdAt),
  ],
);

export const catalogPublications = sqliteTable(
  "catalog_publications",
  {
    installationId: text("installation_id")
      .notNull()
      .references(() => installations.id, { onDelete: "cascade" }),
    sourceRevision: integer("source_revision").notNull(),
    requestHash: text("request_hash").notNull(),
    catalogVersion: integer("catalog_version").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.installationId, table.sourceRevision] }),
  ],
);

export const rateLimitEvents = sqliteTable(
  "rate_limit_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    actorHash: text("actor_hash").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_rate_limit_lookup").on(
      table.storeId,
      table.scope,
      table.actorHash,
      table.createdAt,
    ),
    index("idx_rate_limit_created").on(table.createdAt),
    check("rate_limit_scope", sql`${table.scope} IN ('ip','device')`),
  ],
);
