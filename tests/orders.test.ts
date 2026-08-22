import assert from "node:assert/strict";
import test from "node:test";
import {
  formatOrderWait,
  nextOrderStatus,
  previousOrderStatus,
  resolveOrderCustomerName,
  sortOrdersOldestFirst,
} from "../features/pool-petiscos/orders";
import type { Sale } from "../features/pool-petiscos/types";

test("avança e retorna as etapas de uma comanda", () => {
  assert.equal(nextOrderStatus("aguardando"), "em-preparo");
  assert.equal(nextOrderStatus("em-preparo"), "pronto");
  assert.equal(nextOrderStatus("pronto"), "entregue");
  assert.equal(nextOrderStatus("entregue"), null);
  assert.equal(previousOrderStatus("entregue"), "pronto");
  assert.equal(previousOrderStatus("aguardando"), null);
});

test("mantém a fila na ordem de chegada", () => {
  const base: Sale = {
    id: "PV-1",
    timestamp: 200,
    total: 10,
    payment: "Pix",
    operatorId: "elaine",
    operatorName: "Elaine",
    customerName: "Ana",
    orderStatus: "aguardando",
    statusUpdatedAt: 200,
    items: [
      {
        productId: "P1",
        name: "Pastel",
        price: 10,
        quantity: 1,
      },
    ],
  };
  const sorted = sortOrdersOldestFirst([
    base,
    { ...base, id: "PV-2", timestamp: 100, statusUpdatedAt: 100 },
  ]);
  assert.deepEqual(
    sorted.map((sale) => sale.id),
    ["PV-2", "PV-1"],
  );
});

test("mostra o tempo de espera em linguagem curta", () => {
  const now = Date.parse("2026-07-29T20:00:00.000Z");
  assert.equal(formatOrderWait(now - 30_000, now), "agora");
  assert.equal(formatOrderWait(now - 18 * 60_000, now), "há 18 min");
  assert.equal(formatOrderWait(now - 75 * 60_000, now), "há 1h 15min");
});

test("usa o nome informado ou cria uma identificação simples de balcão", () => {
  const timestamp = Date.parse("2026-08-22T12:00:00-03:00");
  const base: Sale = {
    id: "PV-1",
    timestamp,
    total: 10,
    payment: "Pix",
    operatorId: "elaine",
    operatorName: "Elaine",
    customerName: "Balcão 01",
    orderStatus: "aguardando",
    statusUpdatedAt: timestamp,
    items: [{ productId: "P1", name: "Pastel", price: 10, quantity: 1 }],
  };

  assert.equal(resolveOrderCustomerName("  Maria  ", [base], timestamp), "Maria");
  assert.equal(resolveOrderCustomerName("", [base], timestamp), "Balcão 02");
  assert.equal(
    resolveOrderCustomerName(
      "",
      [
        base,
        {
          ...base,
          id: "PV-3",
          customerName: "Balcão 03",
        },
      ],
      timestamp,
    ),
    "Balcão 02",
  );
  assert.equal(
    resolveOrderCustomerName(
      "",
      [
        base,
        {
          ...base,
          id: "PV-OLD",
          timestamp: Date.parse("2026-08-21T12:00:00-03:00"),
        },
      ],
      timestamp,
    ),
    "Balcão 02",
  );
});
