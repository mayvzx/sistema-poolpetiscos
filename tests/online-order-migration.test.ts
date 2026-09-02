import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const migration = readFileSync(
  new URL("../drizzle/0000_pool_online_orders.sql", import.meta.url),
  "utf8",
);

function migratedDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
  database
    .prepare(
      `INSERT INTO stores (id, slug, name, timezone, created_at, updated_at)
       VALUES ('pool-petiscos', 'pool-petiscos', 'Pool Petiscos & Lanches',
         'America/Sao_Paulo', 0, 0)`,
    )
    .run();
  return database;
}

function insertPickupOrder(database: DatabaseSync, id: string, paymentMethod = "Pix") {
  database
    .prepare(
      `INSERT INTO public_orders (
        id, store_id, status, version, fulfillment_mode, table_id,
        table_label_snapshot, customer_name, customer_note, payment_method,
        subtotal_cents, surcharge_rate_bps, surcharge_cents, total_cents,
        catalog_version, created_at, updated_at, expires_at
      ) VALUES (?, 'pool-petiscos', 'pending', 1, 'pickup', NULL, NULL,
        'Maria', '', ?, 1000, 0, 0, 1000, 0, 1000, 1000, 9999999)`,
    )
    .run(id, paymentMethod);
}

test("a migração cria o esquema e os índices de retenção sem violações", () => {
  const database = migratedDatabase();
  const indexes = database
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'index' AND name IN (
         'idx_request_idempotency_expiry',
         'idx_installation_commands_created',
         'idx_rate_limit_created'
       ) ORDER BY name`,
    )
    .all()
    .map((row) => String(row.name));
  assert.deepEqual(indexes, [
    "idx_installation_commands_created",
    "idx_rate_limit_created",
    "idx_request_idempotency_expiry",
  ]);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});

test("o banco bloqueia saltos de status e registra transições válidas", () => {
  const database = migratedDatabase();
  insertPickupOrder(database, "order-1");
  assert.throws(() =>
    database
      .prepare("UPDATE public_orders SET status = 'ready', version = 2 WHERE id = 'order-1'")
      .run(),
  );
  database
    .prepare(
      `UPDATE public_orders SET status = 'accepted', version = 2,
       updated_at = 2000, last_actor_id = 'pool-primary:test' WHERE id = 'order-1'`,
    )
    .run();
  const event = database
    .prepare(
      `SELECT event_type, actor_type, actor_id, order_version
       FROM order_events WHERE order_id = 'order-1'`,
    )
    .get();
  assert.deepEqual({ ...event }, {
    event_type: "order.accepted",
    actor_type: "installation",
    actor_id: "pool-primary:test",
    order_version: 2,
  });
  database.close();
});

test("o banco recusa forma de pagamento e total inconsistentes", () => {
  const database = migratedDatabase();
  assert.throws(() => insertPickupOrder(database, "order-payment", "Boleto"));
  insertPickupOrder(database, "order-total");
  assert.throws(() =>
    database
      .prepare("UPDATE public_orders SET surcharge_cents = 60 WHERE id = 'order-total'")
      .run(),
  );
  database.close();
});
