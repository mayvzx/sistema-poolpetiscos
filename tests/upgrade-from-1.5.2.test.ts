import assert from "node:assert/strict";
import test from "node:test";
import { REPORT_PAYMENT_METHODS } from "../features/pool-petiscos/payment-methods";
import { parsePoolState } from "../features/pool-petiscos/persistence";
import {
  cancelSale,
  countedSales,
  saleCancelEligibility,
} from "../features/pool-petiscos/sale-cancellation";
import {
  calculateSplitSalePricing,
  sumSalesByPaymentMethod,
} from "../features/pool-petiscos/sale-payments";

// Estado no formato da 1.5.2: caixa aberto com vendas do dia, um fechamento anterior,
// pagamentos "Cartão" antigos, despesas, sangria e PINs configurados.
const day = Date.parse("2026-10-16T16:00:00-03:00");
const cred = (n: number) => ({ algorithm: "PBKDF2-SHA-256", iterations: 210000, salt: Buffer.alloc(16, n).toString("base64"), hash: Buffer.alloc(32, n + 10).toString("base64"), updatedAt: day - 86400000 });
const products = [
  { id: "coxinha", name: "Coxinha", category: "Salgados", price: 6, stock: 20, minimum: 5, emoji: "🥟" },
  { id: "pastel", name: "Pastel", category: "Salgados", price: 9, stock: 12, minimum: 4, emoji: "🥠" },
  { id: "refri", name: "Refrigerante lata", category: "Bebidas", price: 6, stock: 30, minimum: 6, emoji: "🥤" },
];
type LegacyItem = { productId: string; name: string; price: number; quantity: number; observation?: string };
const sale = (id: string, offsetMin: number, payment: string, items: LegacyItem[], status = "entregue") => ({
  id, timestamp: day + offsetMin * 60000, total: items.reduce((t, i) => t + i.price * i.quantity, 0),
  payment, operatorId: "elaine", operatorName: "Elaine", items, customerName: "Cliente " + id,
  orderStatus: status, statusUpdatedAt: day + offsetMin * 60000,
});
const legacyState = {
  products,
  sales: [
    sale("PV-OLD-1", -1440, "Cartão", [{ productId: "coxinha", name: "Coxinha", price: 6, quantity: 2 }]),
    sale("PV-OLD-2", -1400, "Dinheiro", [{ productId: "pastel", name: "Pastel", price: 9, quantity: 1, observation: "sem cebola" }]),
    sale("PV-1", 10, "Pix", [{ productId: "refri", name: "Refrigerante lata", price: 6, quantity: 2 }]),
    sale("PV-2", 20, "Dinheiro", [{ productId: "coxinha", name: "Coxinha", price: 6, quantity: 2 }, { productId: "pastel", name: "Pastel", price: 9, quantity: 2 }], "aguardando"),
  ],
  expenses: [{ id: "D-1", timestamp: day + 5 * 60000, description: "Gás", category: "Insumos", amount: 40, payment: "Cartão" }],
  cashOpen: true,
  openingBalance: 130,
  cashOpenedAt: day,
  cashMovements: [{ id: "M-1", timestamp: day + 30 * 60000, description: "Troco extra", amount: 20, kind: "suprimento" }],
  cashClosures: [{ id: "FC-OLD", openedAt: day - 1500 * 60000, closedAt: day - 1300 * 60000, openingBalance: 130, expectedBalance: 139, countedBalance: 139, difference: 0 }],
  operatorCredentials: { elaine: cred(1), poolblay: cred(2) },
  pinRecoveryCredential: cred(3),
};

test("abre uma base da 1.5.2, divide, cancela e grava sem perder o histórico", () => {
  const raw = structuredClone(legacyState);
  const state = parsePoolState(raw);
  assert.ok(state, "2.5.0 recusou o estado da 1.5.2");
  const session = state.activeCashSession;
  assert.ok(session, "caixa aberto da 1.5.2 virou sessão");
  assert.equal(state.sales.length, 4);
  assert.equal(state.sales[0].payment, "Cartão");
  assert.equal(state.sales[1].items[0].observation, "sem cebola");
  assert.equal(state.sales[2].cashSessionId, session.id, "venda do dia ligada ao caixa aberto");
  assert.equal(state.cashClosures.length, 1);
  assert.equal(Object.keys(state.operatorCredentials).length, 2);
  assert.ok(state.pinRecoveryCredential);
  const before = sumSalesByPaymentMethod(state.sales, REPORT_PAYMENT_METHODS);
  assert.deepEqual(before, { Dinheiro: 39, Pix: 12, "Débito": 0, "Crédito": 0, "Cartão": 12 });

  // Venda dividida R$ 30: R$ 20 em dinheiro + R$ 10 no crédito = R$ 30,60.
  const pricing = calculateSplitSalePricing(30, [
    { method: "Dinheiro", baseAmount: 20 },
    { method: "Crédito", baseAmount: 10 },
  ]);
  assert.equal(pricing.total, 30.6);
  const split = {
    id: "PV-25-SPLIT", cashSessionId: session.id, timestamp: session.openedAt + 60 * 60000,
    subtotal: pricing.subtotal, surchargeRate: pricing.surchargeRate, surchargeAmount: pricing.surchargeAmount,
    total: pricing.total, payment: pricing.payment, payments: pricing.payments,
    operatorId: "poolblay" as const, operatorName: "Poolblay",
    items: [
      { productId: "coxinha", name: "Coxinha", price: 6, quantity: 2 },
      { productId: "pastel", name: "Pastel", price: 9, quantity: 2 },
    ],
    customerName: "Teste dividido", orderStatus: "entregue" as const, statusUpdatedAt: session.openedAt + 60 * 60000,
  };
  const products = state.products.map((p) => p.id === "coxinha" ? { ...p, stock: p.stock - 2 } : p.id === "pastel" ? { ...p, stock: p.stock - 2 } : p);

  // Cancela a venda PV-2 (gravada pela 1.5.2) devolvendo ao estoque.
  const legacy = state.sales.find((s) => s.id === "PV-2")!;
  assert.equal(saleCancelEligibility(legacy, session.id).allowed, true);
  const old = state.sales.find((s) => s.id === "PV-OLD-1")!;
  assert.equal(saleCancelEligibility(old, session.id).allowed, false, "venda de caixa fechado não cancela");
  const cancelled = cancelSale({ sale: legacy, products, operatorId: "elaine", operatorName: "Elaine", reason: "Lançado errado", restock: true, now: session.openedAt + 90 * 60000 });
  assert.throws(() => cancelSale({ sale: cancelled.sale, products: cancelled.products, operatorId: "elaine", operatorName: "Elaine", reason: "x", restock: true, now: session.openedAt + 91 * 60000 }));

  const next = {
    ...state,
    products: cancelled.products,
    sales: [...state.sales.map((s) => s.id === legacy.id ? cancelled.sale : s), split],
  };
  const reparsed = parsePoolState(structuredClone(next));
  assert.ok(reparsed, "2.5.0 relê o próprio estado");
  assert.equal(countedSales(reparsed.sales).length, 4);
  const after = sumSalesByPaymentMethod(reparsed.sales, REPORT_PAYMENT_METHODS);
  assert.deepEqual(after, { Dinheiro: 29, Pix: 12, "Débito": 0, "Crédito": 10.6, "Cartão": 12 });
  assert.deepEqual(reparsed.products.map((p) => p.stock), [20, 12, 30], "estoque: -2/-2 da venda dividida, +2/+2 do cancelamento");
});

test("ler uma base da 1.5.2 não altera nenhum valor já gravado, só acrescenta campos", () => {
  const parsed = parsePoolState(structuredClone(legacyState));
  assert.ok(parsed);
  const changed: string[] = [];
  const walk = (before: unknown, after: unknown, path: string) => {
    if (before !== null && typeof before === "object") {
      if (after === null || typeof after !== "object") {
        changed.push(path);
        return;
      }
      for (const [key, value] of Object.entries(before)) {
        walk(value, (after as Record<string, unknown>)[key], `${path}.${key}`);
      }
    } else if (before !== after) {
      changed.push(path);
    }
  };
  walk(legacyState, parsed, "estado");
  assert.deepEqual(changed, []);
});
