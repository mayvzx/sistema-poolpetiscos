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
        items: [
          {
            productId: "pastel",
            name: "Pastel",
            price: 9,
            quantity: 2,
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

test("valida estado e backup completos antes de restaurar", () => {
  const state = validState();
  assert.deepEqual(parsePoolState(state), state);

  const backup = createBackup(state);
  assert.deepEqual(parseBackup(JSON.stringify(backup)), state);

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
