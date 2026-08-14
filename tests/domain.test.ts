import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDailyRevenue,
  calculateCashBalance,
  getBusinessStatus,
  parseAmount,
} from "../features/pool-petiscos/domain";
import {
  createBackup,
  parseBackup,
  parsePoolState,
} from "../features/pool-petiscos/persistence";
import { buildOperatorSalesSummary } from "../features/pool-petiscos/operators";
import type { PersistedPoolState } from "../features/pool-petiscos/types";

function validState(): PersistedPoolState {
  const timestamp = Date.parse("2026-07-25T20:00:00.000Z");
  return {
    products: [
      {
        id: "pastel",
        name: "Pastel",
        category: "Salgados",
        price: 9,
        stock: 10,
        minimum: 3,
        emoji: "🥟",
      },
    ],
    sales: [
      {
        id: "PV-TESTE",
        timestamp,
        total: 18,
        payment: "Dinheiro",
        operatorId: "elaine",
        operatorName: "Elaine",
        customerName: "Cliente teste",
        orderStatus: "entregue",
        statusUpdatedAt: timestamp,
        items: [
          {
            productId: "pastel",
            name: "Pastel",
            price: 9,
            quantity: 2,
            observation: "Sem cebola",
          },
        ],
      },
    ],
    expenses: [],
    cashOpen: true,
    openingBalance: 100,
    cashOpenedAt: timestamp - 60_000,
    cashMovements: [],
    cashClosures: [],
    operatorCredentials: {},
  };
}

test("interpreta valores brasileiros e decimais sem multiplicar centavos", () => {
  assert.equal(parseAmount("R$ 1.234,56"), 1234.56);
  assert.equal(parseAmount("1234,56"), 1234.56);
  assert.equal(parseAmount("1,234.56"), 1234.56);
  assert.equal(parseAmount("10.50"), 10.5);
  assert.equal(parseAmount("1.234"), 1234);
  assert.ok(Number.isNaN(parseAmount("abc")));
  assert.ok(Number.isNaN(parseAmount("1.2.3")));
  assert.ok(Number.isNaN(parseAmount("")));
});

test("calcula o saldo físico separando vendas, despesas e movimentos", () => {
  assert.equal(
    calculateCashBalance({
      openingBalance: 100,
      cashSalesTotal: 35.5,
      cashExpenseTotal: 20.25,
      cashMovementTotal: -10,
    }),
    105.25,
  );
});

test("avalia o funcionamento no horário de Recife", () => {
  assert.equal(
    getBusinessStatus(new Date("2026-07-23T19:30:00.000Z")).open,
    true,
  );
  assert.equal(
    getBusinessStatus(new Date("2026-07-22T19:30:00.000Z")).open,
    false,
  );
  assert.equal(
    getBusinessStatus(new Date("2026-07-23T14:30:00.000Z")).label,
    "Abre hoje às 16h",
  );
});

test("agrupa somente os valores reais do período", () => {
  const now = Date.parse("2026-07-25T20:00:00.000Z");
  const state = validState();
  state.sales.push({
    ...state.sales[0],
    id: "PV-ONTEM",
    timestamp: now - 24 * 60 * 60 * 1000,
    total: 9,
    items: [{ ...state.sales[0].items[0], quantity: 1 }],
  });

  const series = buildDailyRevenue(state.sales, now, 2);
  assert.deepEqual(
    series.map((day) => day.total),
    [9, 18],
  );
});

test("separa quantidade e total das vendas por operador", () => {
  const state = validState();
  state.sales.push({
    ...state.sales[0],
    id: "PV-POOL",
    total: 9,
    operatorId: "poolblay",
    operatorName: "Poolblay",
    items: [{ ...state.sales[0].items[0], quantity: 1 }],
  });

  const summary = buildOperatorSalesSummary(state.sales);
  assert.deepEqual(
    summary.map(({ id, count, total }) => ({ id, count, total })),
    [
      { id: "elaine", count: 1, total: 18 },
      { id: "poolblay", count: 1, total: 9 },
    ],
  );
});

test("valida estado e backup completos antes de restaurar", () => {
  const state = validState();
  assert.deepEqual(parsePoolState(state), state);

  const backup = createBackup(state);
  assert.deepEqual(parseBackup(JSON.stringify(backup)), state);

  const emptyInventory = { ...state, products: [] };
  assert.deepEqual(parsePoolState(emptyInventory), emptyInventory);
  assert.deepEqual(
    parseBackup(JSON.stringify(createBackup(emptyInventory))),
    emptyInventory,
  );

  const invalidStock = structuredClone(backup);
  invalidStock.data.products[0].stock = -1;
  assert.equal(parseBackup(JSON.stringify(invalidStock)), null);

  const invalidTotal = structuredClone(backup);
  invalidTotal.data.sales[0].total = 999;
  assert.equal(parseBackup(JSON.stringify(invalidTotal)), null);

  assert.equal(
    parseBackup(JSON.stringify({ ...backup, app: "Outro sistema" })),
    null,
  );
});

test("migra vendas antigas para o histórico de comandas", () => {
  const legacy = structuredClone(validState()) as unknown as {
    sales: Array<Record<string, unknown>>;
  };
  delete legacy.sales[0].customerName;
  delete legacy.sales[0].orderStatus;
  delete legacy.sales[0].statusUpdatedAt;
  delete legacy.sales[0].operatorId;
  delete legacy.sales[0].operatorName;
  delete (legacy as { operatorCredentials?: unknown }).operatorCredentials;

  const parsed = parsePoolState(legacy);
  assert.ok(parsed);
  assert.equal(parsed.sales[0].customerName, "Cliente sem nome");
  assert.equal(parsed.sales[0].orderStatus, "entregue");
  assert.equal(parsed.sales[0].statusUpdatedAt, parsed.sales[0].timestamp);
  assert.equal(parsed.sales[0].operatorId, "nao-identificado");
  assert.equal(parsed.sales[0].operatorName, "Não identificado");
  assert.equal(parsed.sales[0].items[0].observation, "Sem cebola");
  assert.deepEqual(parsed.operatorCredentials, {});
});

test("rejeita verificadores de PIN adulterados ao restaurar", () => {
  const state = validState();
  state.operatorCredentials.elaine = {
    algorithm: "PBKDF2-SHA-256",
    iterations: 210_000,
    salt: btoa("1234567890abcdef"),
    hash: btoa("12345678901234567890123456789012"),
    updatedAt: Date.now(),
  };
  assert.deepEqual(parsePoolState(state), state);

  const invalid = structuredClone(state);
  invalid.operatorCredentials.elaine!.iterations = 10;
  assert.equal(parsePoolState(invalid), null);
});
