import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import {
  calculateOrderTotalsForPayment,
  handleOnlineOrderApi,
  type OnlineOrderEnv,
} from "../cloud/online-order-api";

type SqlValue = string | number | bigint | null | Uint8Array;

class TestD1Statement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
    private readonly values: SqlValue[] = [],
  ) {}

  bind(...values: SqlValue[]): TestD1Statement {
    return new TestD1Statement(this.database, this.sql, values);
  }

  async first<T>(): Promise<T | null> {
    const row = this.database.prepare(this.sql).get(...this.values);
    return (row ?? null) as T | null;
  }

  async all<T>() {
    const results = this.database.prepare(this.sql).all(...this.values) as T[];
    return { results, success: true, meta: {} };
  }

  async run<T>() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return {
      results: [] as T[],
      success: true,
      meta: { changes: Number(result.changes) },
    };
  }

  async execute() {
    return /^\s*(SELECT|PRAGMA|WITH)\b/i.test(this.sql)
      ? this.all()
      : this.run();
  }
}

class TestD1Database {
  readonly sqlite = new DatabaseSync(":memory:");

  constructor() {
    this.sqlite.exec(
      readFileSync(
        new URL("../drizzle/0000_pool_online_orders.sql", import.meta.url),
        "utf8",
      ),
    );
  }

  prepare(sql: string): TestD1Statement {
    return new TestD1Statement(this.sqlite, sql);
  }

  async batch(statements: TestD1Statement[]) {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.execute());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  asD1(): D1Database {
    return this as unknown as D1Database;
  }

  close() {
    this.sqlite.close();
  }
}

const installationToken = "installation-token-with-at-least-32-characters";

function apiEnv(database: TestD1Database): OnlineOrderEnv {
  return {
    DB: database.asD1(),
    POOL_INSTALLATION_TOKEN: installationToken,
    POOL_TRACKING_SECRET: "tracking-secret-with-at-least-32-characters",
    POOL_RATE_LIMIT_SALT: "rate-limit-salt-with-at-least-16-characters",
    POOL_STORE_SLUG: "pool-petiscos",
  };
}

function operatorRequest(path: string, body: unknown, method = "POST") {
  return new Request(`https://pool.example${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${installationToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function requiredResponse(response: Promise<Response | null>): Promise<Response> {
  const result = await response;
  assert.ok(result);
  return result;
}

test("recalcula o total ao concluir sem taxa para Pix e dinheiro", () => {
  assert.deepEqual(calculateOrderTotalsForPayment(1_250, "Pix"), {
    surchargeRateBps: 0,
    surchargeCents: 0,
    totalCents: 1_250,
  });
  assert.deepEqual(calculateOrderTotalsForPayment(1_250, "Dinheiro"), {
    surchargeRateBps: 0,
    surchargeCents: 0,
    totalCents: 1_250,
  });
});

test("recalcula e arredonda as taxas de débito e crédito em centavos", () => {
  assert.deepEqual(calculateOrderTotalsForPayment(2_998, "Débito"), {
    surchargeRateBps: 300,
    surchargeCents: 90,
    totalCents: 3_088,
  });
  assert.deepEqual(calculateOrderTotalsForPayment(999, "Crédito"), {
    surchargeRateBps: 600,
    surchargeCents: 60,
    totalCents: 1_059,
  });
});

test("recusa subtotais inválidos ou que produziriam total inseguro", () => {
  assert.throws(() => calculateOrderTotalsForPayment(-1, "Pix"));
  assert.throws(() => calculateOrderTotalsForPayment(1.5, "Pix"));
  assert.throws(() =>
    calculateOrderTotalsForPayment(Number.MAX_SAFE_INTEGER, "Crédito"),
  );
});

test("heartbeat, catálogo e consulta preservam versão e revisão da instalação", async () => {
  const database = new TestD1Database();
  const env = apiEnv(database);
  const heartbeat = await requiredResponse(
    handleOnlineOrderApi(
      operatorRequest("/api/v1/operator/heartbeat", {
        cashOpen: true,
        ordersEnabled: true,
        appVersion: "1.9.0",
        localRevision: 42,
      }),
      env,
    ),
  );
  assert.equal(heartbeat.status, 200);

  const catalog = await requiredResponse(
    handleOnlineOrderApi(
      operatorRequest(
        "/api/v1/operator/catalog",
        { sourceRevision: 42, categories: [], products: [] },
        "PUT",
      ),
      env,
    ),
  );
  assert.equal(catalog.status, 201);
  const events = await requiredResponse(
    handleOnlineOrderApi(
      operatorRequest("/api/v1/operator/order-events?after=0", undefined, "GET"),
      env,
    ),
  );
  assert.equal(events.status, 200);
  const menu = await requiredResponse(
    handleOnlineOrderApi(
      new Request("https://pool.example/api/v1/public/stores/pool-petiscos/menu", {
        method: "GET",
      }),
      env,
    ),
  );
  assert.equal(menu.status, 200);
  assert.equal(menu.headers.get("cache-control"), "no-store");
  assert.equal(menu.headers.get("x-pool-catalog-version"), "1");
  const installation = database.sqlite
    .prepare(
      "SELECT app_version, local_revision FROM installations WHERE id = 'pool-primary'",
    )
    .get();
  assert.deepEqual({ ...installation }, { app_version: "1.9.0", local_revision: 42 });

  const heartbeatWithoutVersion = await requiredResponse(
    handleOnlineOrderApi(
      operatorRequest("/api/v1/operator/heartbeat", {
        cashOpen: true,
        ordersEnabled: true,
      }),
      env,
    ),
  );
  assert.equal(heartbeatWithoutVersion.status, 200);
  const preserved = database.sqlite
    .prepare(
      "SELECT app_version, local_revision FROM installations WHERE id = 'pool-primary'",
    )
    .get();
  assert.deepEqual({ ...preserved }, { app_version: "1.9.0", local_revision: 42 });
  database.close();
});

test("conclusão recalcula cartão e é idempotente junto da mudança de estado", async () => {
  const database = new TestD1Database();
  const env = apiEnv(database);
  await requiredResponse(
    handleOnlineOrderApi(
      operatorRequest("/api/v1/operator/heartbeat", {
        cashOpen: true,
        ordersEnabled: true,
        appVersion: "1.9.0",
        localRevision: 7,
      }),
      env,
    ),
  );
  database.sqlite
    .prepare(
      `INSERT INTO public_orders (
        id, store_id, status, version, fulfillment_mode, customer_name,
        customer_note, payment_method, subtotal_cents, surcharge_rate_bps,
        surcharge_cents, total_cents, catalog_version, created_at, updated_at, expires_at
      ) VALUES (
        'order-ready', 'pool-petiscos', 'ready', 4, 'pickup', 'Maria', '',
        'Pix', 2998, 0, 0, 2998, 1, 1000, 1000, 9999999999999
      )`,
    )
    .run();
  const action = {
    localMutationId: "mutation-complete-00000001",
    expectedVersion: 4,
    action: "complete",
    localSaleId: "sale-local-1",
    paymentMethod: "Crédito",
  };
  const completed = await requiredResponse(
    handleOnlineOrderApi(
      operatorRequest("/api/v1/operator/orders/order-ready/actions", action),
      env,
    ),
  );
  assert.equal(completed.status, 200);
  const completedPayload = (await completed.json()) as {
    repeated: boolean;
    order: { status: string; surchargeCents: number; totalCents: number };
  };
  assert.equal(completedPayload.repeated, false);
  assert.equal(completedPayload.order.status, "completed");
  assert.equal(completedPayload.order.surchargeCents, 180);
  assert.equal(completedPayload.order.totalCents, 3178);
  const stored = database.sqlite
    .prepare(
      `SELECT status, version, payment_method, surcharge_rate_bps,
              surcharge_cents, total_cents, local_sale_id
       FROM public_orders WHERE id = 'order-ready'`,
    )
    .get();
  assert.deepEqual(
    { ...stored },
    {
      status: "completed",
      version: 5,
      payment_method: "Crédito",
      surcharge_rate_bps: 600,
      surcharge_cents: 180,
      total_cents: 3178,
      local_sale_id: "sale-local-1",
    },
  );
  assert.equal(
    database.sqlite
      .prepare("SELECT COUNT(*) AS count FROM installation_commands")
      .get()?.count,
    1,
  );

  const repeated = await requiredResponse(
    handleOnlineOrderApi(
      operatorRequest("/api/v1/operator/orders/order-ready/actions", action),
      env,
    ),
  );
  assert.equal(repeated.status, 200);
  assert.equal(((await repeated.json()) as { repeated: boolean }).repeated, true);
  assert.equal(
    database.sqlite
      .prepare("SELECT COUNT(*) AS count FROM installation_commands")
      .get()?.count,
    1,
  );
  database.close();
});

test("criação limpa registros expirados em lote limitado e mantém preço do servidor", async () => {
  const database = new TestD1Database();
  const env = apiEnv(database);
  await requiredResponse(
    handleOnlineOrderApi(
      operatorRequest("/api/v1/operator/heartbeat", {
        cashOpen: true,
        ordersEnabled: true,
        appVersion: "1.9.0",
        localRevision: 8,
      }),
      env,
    ),
  );
  const catalogResponse = await requiredResponse(
    handleOnlineOrderApi(
      operatorRequest(
        "/api/v1/operator/catalog",
        {
          sourceRevision: 8,
          categories: [{ key: "lanches", name: "Lanches", sortOrder: 0 }],
          products: [
            {
              id: "x-bacon",
              categoryKey: "lanches",
              name: "X-Bacon",
              description: "",
              imageUrl: null,
              emoji: "🥓",
              priceCents: 1499,
              available: true,
              visible: true,
              sortOrder: 0,
            },
          ],
        },
        "PUT",
      ),
      env,
    ),
  );
  assert.equal(catalogResponse.status, 201);
  const old = Date.now() - 40 * 24 * 60 * 60_000;
  database.sqlite
    .prepare(
      `INSERT INTO public_orders (
        id, store_id, status, version, fulfillment_mode, customer_name,
        customer_note, payment_method, subtotal_cents, surcharge_rate_bps,
        surcharge_cents, total_cents, catalog_version, created_at, updated_at, expires_at
      ) VALUES (
        'old-order', 'pool-petiscos', 'completed', 2, 'pickup', 'Antigo', '',
        'Pix', 100, 0, 0, 100, 1, ?, ?, ?
      )`,
    )
    .run(old, old, old);
  database.sqlite
    .prepare(
      `INSERT INTO request_idempotency (
        store_id, key_hash, request_hash, order_id, created_at, expires_at
      ) VALUES ('pool-petiscos', 'old-key', 'old-request', 'old-order', ?, ?)`,
    )
    .run(old, old);
  database.sqlite
    .prepare(
      `INSERT INTO installation_commands (
        installation_id, mutation_id, order_id, request_hash, resulting_version, created_at
      ) VALUES ('pool-primary', 'old-mutation', 'old-order', 'old-command', 2, ?)`,
    )
    .run(old);
  database.sqlite
    .prepare(
      `INSERT INTO rate_limit_events (store_id, scope, actor_hash, created_at)
       VALUES ('pool-petiscos', 'ip', 'old-actor', ?)`,
    )
    .run(old);

  const now = Date.now();
  const created = await requiredResponse(
    handleOnlineOrderApi(
      new Request("https://pool.example/api/v1/public/stores/pool-petiscos/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "checkout-attempt-00000001",
          "CF-Connecting-IP": "203.0.113.8",
        },
        body: JSON.stringify({
          fulfillmentMode: "pickup",
          customerName: "Maria",
          customerNote: "",
          paymentMethod: "Débito",
          catalogVersion: 1,
          deviceToken: "device-token-1234567890",
          formStartedAt: now - 2_000,
          website: "",
          items: [{ productId: "x-bacon", quantity: 2, note: "" }],
        }),
      }),
      env,
    ),
  );
  assert.equal(created.status, 201);
  const payload = (await created.json()) as {
    order: { subtotalCents: number; surchargeCents: number; totalCents: number };
  };
  assert.equal(payload.order.subtotalCents, 2998);
  assert.equal(payload.order.surchargeCents, 90);
  assert.equal(payload.order.totalCents, 3088);
  assert.equal(
    database.sqlite
      .prepare("SELECT COUNT(*) AS count FROM request_idempotency WHERE key_hash = 'old-key'")
      .get()?.count,
    0,
  );
  assert.equal(
    database.sqlite
      .prepare("SELECT COUNT(*) AS count FROM installation_commands WHERE mutation_id = 'old-mutation'")
      .get()?.count,
    0,
  );
  assert.equal(
    database.sqlite
      .prepare("SELECT COUNT(*) AS count FROM rate_limit_events WHERE actor_hash = 'old-actor'")
      .get()?.count,
    0,
  );
  database.close();
});

test("percorre o fluxo completo do cliente até a venda concluída no caixa", async () => {
  const database = new TestD1Database();
  const env = apiEnv(database);
  const heartbeat = await requiredResponse(
    handleOnlineOrderApi(
      operatorRequest("/api/v1/operator/heartbeat", {
        cashOpen: true,
        ordersEnabled: true,
        appVersion: "1.9.0",
        localRevision: 25,
      }),
      env,
    ),
  );
  assert.equal(heartbeat.status, 200);
  const catalog = await requiredResponse(
    handleOnlineOrderApi(
      operatorRequest(
        "/api/v1/operator/catalog",
        {
          sourceRevision: 25,
          categories: [{ key: "lanches", name: "Lanches", sortOrder: 0 }],
          products: [
            {
              id: "x-bacon",
              categoryKey: "lanches",
              name: "X-Bacon",
              description: "",
              imageUrl: null,
              emoji: "🥓",
              priceCents: 1499,
              available: true,
              visible: true,
              sortOrder: 0,
            },
          ],
        },
        "PUT",
      ),
      env,
    ),
  );
  assert.equal(catalog.status, 201);

  const orderBody = {
    fulfillmentMode: "pickup",
    customerName: "Maria",
    customerNote: "Retirada no balcão",
    paymentMethod: "Pix",
    catalogVersion: 1,
    deviceToken: "device-token-completo-123456",
    formStartedAt: Date.now() - 2_000,
    website: "",
    items: [{ productId: "x-bacon", quantity: 2, note: "sem cebola" }],
  };
  const idempotencyKey = "checkout-fluxo-completo-0001";
  const createRequest = () =>
    new Request("https://pool.example/api/v1/public/stores/pool-petiscos/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "CF-Connecting-IP": "203.0.113.31",
      },
      body: JSON.stringify(orderBody),
    });
  const created = await requiredResponse(handleOnlineOrderApi(createRequest(), env));
  assert.equal(created.status, 201);
  const createdPayload = (await created.json()) as {
    order: { id: string; status: string; version: number; totalCents: number };
    accessToken: string;
  };
  assert.equal(createdPayload.order.status, "pending");
  assert.equal(createdPayload.order.totalCents, 2998);

  const retried = await requiredResponse(handleOnlineOrderApi(createRequest(), env));
  assert.equal(retried.status, 200);
  const retriedPayload = (await retried.json()) as {
    order: { id: string };
  };
  assert.equal(retriedPayload.order.id, createdPayload.order.id);
  assert.equal(
    database.sqlite.prepare("SELECT COUNT(*) AS count FROM public_orders").get()?.count,
    1,
  );

  const events = await requiredResponse(
    handleOnlineOrderApi(
      operatorRequest("/api/v1/operator/order-events?after=0", undefined, "GET"),
      env,
    ),
  );
  assert.equal(events.status, 200);
  const eventPayload = (await events.json()) as {
    events: Array<{ type: string; order: { id: string; status: string } }>;
  };
  assert.equal(eventPayload.events[0]?.type, "order.pending");
  assert.equal(eventPayload.events[0]?.order.id, createdPayload.order.id);

  let version = createdPayload.order.version;
  for (const [index, action] of (["accept", "start", "ready"] as const).entries()) {
    const response = await requiredResponse(
      handleOnlineOrderApi(
        operatorRequest(
          `/api/v1/operator/orders/${createdPayload.order.id}/actions`,
          {
            localMutationId: `fluxo-completo-${action}-000${index}`,
            expectedVersion: version,
            action,
          },
        ),
        env,
      ),
    );
    assert.equal(
      response.status,
      200,
      `${JSON.stringify({ action, version, mutation: `fluxo-completo-${action}-000${index}` })} ${await response.clone().text()}`,
    );
    const payload = (await response.json()) as {
      order: { version: number; status: string };
    };
    version = payload.order.version;
  }

  const completed = await requiredResponse(
    handleOnlineOrderApi(
      operatorRequest(
        `/api/v1/operator/orders/${createdPayload.order.id}/actions`,
        {
          localMutationId: "fluxo-completo-complete-0003",
          expectedVersion: version,
          action: "complete",
          localSaleId: "VENDA-ONLINE-1",
          paymentMethod: "Crédito",
        },
      ),
      env,
    ),
  );
  assert.equal(completed.status, 200);
  const completedPayload = (await completed.json()) as {
    order: { status: string; paymentMethod: string; totalCents: number };
  };
  assert.equal(completedPayload.order.status, "completed");
  assert.equal(completedPayload.order.paymentMethod, "Crédito");
  assert.equal(completedPayload.order.totalCents, 3178);

  const tracking = await requiredResponse(
    handleOnlineOrderApi(
      new Request(
        `https://pool.example/api/v1/public/orders/${createdPayload.order.id}`,
        { headers: { Authorization: `Bearer ${createdPayload.accessToken}` } },
      ),
      env,
    ),
  );
  assert.equal(tracking.status, 200);
  const trackingPayload = (await tracking.json()) as {
    order: { status: string; localSaleId: string; totalCents: number };
    timeline: Array<{ status: string }>;
  };
  assert.equal(trackingPayload.order.status, "completed");
  assert.equal(trackingPayload.order.localSaleId, "VENDA-ONLINE-1");
  assert.equal(trackingPayload.order.totalCents, 3178);
  assert.deepEqual(
    trackingPayload.timeline.map((event) => event.status),
    ["pending", "accepted", "preparing", "ready", "completed"],
  );
  database.close();
});
