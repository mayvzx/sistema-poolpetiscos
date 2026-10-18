import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCashFlowEntries,
  buildCashFlowReport,
  createCashFlowRange,
} from "../features/pool-petiscos/cash-flow";
import { buildCashSessionSummary } from "../features/pool-petiscos/cash-session-summary";
import { buildDailyRevenue, DEFAULT_CASH_FUND } from "../features/pool-petiscos/domain";
import { buildOperatorSalesSummary } from "../features/pool-petiscos/operators";
import { parsePoolState } from "../features/pool-petiscos/persistence";
import {
  cancelSale,
  countedSales,
  saleCancelEligibility,
} from "../features/pool-petiscos/sale-cancellation";
import { sumSalesByPaymentMethod } from "../features/pool-petiscos/sale-payments";
import type {
  CashClosure,
  PersistedPoolState,
  Product,
  Sale,
} from "../features/pool-petiscos/types";

const timestamp = Date.parse("2026-10-18T20:00:00-03:00");

const products: Product[] = [
  { id: "coxinha", name: "Coxinha", category: "Salgados", price: 6, stock: 8, minimum: 0, emoji: "" },
  { id: "pastel", name: "Pastel", category: "Salgados", price: 9, stock: 3, minimum: 0, emoji: "" },
];

function sale(id: string, total: number, payment: Sale["payment"], extra: Partial<Sale> = {}): Sale {
  return {
    id,
    cashSessionId: "CX-1",
    timestamp,
    total,
    payment,
    operatorId: "elaine",
    operatorName: "Elaine",
    items: [{ productId: "coxinha", name: "Coxinha", price: total, quantity: 1 }],
    customerName: id,
    orderStatus: "entregue",
    statusUpdatedAt: timestamp,
    ...extra,
  };
}

const twoItems = sale("PV-DOIS", 30, "Dinheiro", {
  items: [
    { productId: "coxinha", name: "Coxinha", price: 6, quantity: 2 },
    { productId: "pastel", name: "Pastel", price: 9, quantity: 2 },
  ],
});

test("cancela com motivo e devolve os itens ao estoque", () => {
  const result = cancelSale({
    sale: twoItems,
    products,
    operatorId: "poolblay",
    operatorName: "Poolblay",
    reason: "  Lançado errado ",
    restock: true,
    now: timestamp + 60_000,
  });
  assert.equal(result.sale.cancellation?.reason, "Lançado errado");
  assert.equal(result.sale.cancellation?.restocked, true);
  assert.equal(result.sale.total, 30, "o valor original fica no histórico");
  assert.deepEqual(
    result.products.map((product) => product.stock),
    [10, 5],
  );
});

test("pode cancelar sem devolver ao estoque e exige motivo", () => {
  const result = cancelSale({
    sale: twoItems,
    products,
    operatorId: "elaine",
    operatorName: "Elaine",
    reason: "Cliente desistiu",
    restock: false,
    now: timestamp,
  });
  assert.equal(result.products, products);
  assert.throws(() =>
    cancelSale({
      sale: twoItems,
      products,
      operatorId: "elaine",
      operatorName: "Elaine",
      reason: "   ",
      restock: true,
      now: timestamp,
    }),
  );
});

test("só cancela vendas do caixa aberto e fora do cardápio online", () => {
  assert.equal(saleCancelEligibility(twoItems, "CX-1").allowed, true);
  assert.equal(saleCancelEligibility(twoItems, "CX-2").allowed, false);
  assert.equal(saleCancelEligibility(twoItems, null).allowed, false);
  const online = { ...twoItems, source: "cardapio-online" as const, externalOrderId: "o-1" };
  assert.equal(saleCancelEligibility(online, "CX-1").allowed, false);
  const cancelled = cancelSale({
    sale: twoItems,
    products,
    operatorId: "elaine",
    operatorName: "Elaine",
    reason: "Teste",
    restock: false,
    now: timestamp,
  }).sale;
  assert.equal(saleCancelEligibility(cancelled, "CX-1").allowed, false);
  assert.throws(
    () =>
      cancelSale({
        sale: cancelled,
        products,
        operatorId: "elaine",
        operatorName: "Elaine",
        reason: "De novo",
        restock: true,
        now: timestamp,
      }),
    /já foi cancelada/,
    "cancelar de novo não pode devolver os itens em dobro",
  );
});

test("venda cancelada sai de todos os totais, mas é contada à parte", () => {
  const kept = sale("PV-PIX", 12, "Pix");
  const cancelled = cancelSale({
    sale: sale("PV-DINHEIRO", 20, "Dinheiro"),
    products,
    operatorId: "elaine",
    operatorName: "Elaine",
    reason: "Lançado errado",
    restock: false,
    now: timestamp,
  }).sale;
  const sales = [kept, cancelled];
  assert.deepEqual(countedSales(sales), [kept]);
  assert.equal(sumSalesByPaymentMethod(sales, ["Dinheiro", "Pix"]).Dinheiro, 0);
  assert.equal(buildOperatorSalesSummary(sales)[0].total, 12);
  assert.equal(
    buildDailyRevenue(sales, timestamp, 1)[0].total,
    12,
  );

  const closure: CashClosure = {
    id: "FC-1",
    sessionId: "CX-1",
    openedAt: timestamp - 1,
    closedAt: timestamp + 1,
    openedByOperatorId: "elaine",
    openedByOperatorName: "Elaine",
    closedByOperatorId: "elaine",
    closedByOperatorName: "Elaine",
    openingBalance: 130,
    expectedBalance: 130,
    countedBalance: 130,
    difference: 0,
    cashFund: 130,
    withdrawalAmount: 0,
    remainingBalance: 130,
  };
  const summary = buildCashSessionSummary({ closure, sales, expenses: [], cashMovements: [] });
  assert.equal(summary.salesTotal, 12);
  assert.equal(summary.salesCount, 1);
  assert.equal(summary.cancelledCount, 1);
  assert.equal(summary.cancelledTotal, 20);
  assert.equal(summary.paymentTotals.Dinheiro, 0);
  assert.deepEqual(summary.operatorSummaries, [
    { operatorId: "elaine", operatorName: "Elaine", salesCount: 1, salesTotal: 12 },
  ]);

  const report = buildCashFlowReport(
    buildCashFlowEntries({ sales, expenses: [], cashMovements: [] }),
    createCashFlowRange("today", timestamp),
  );
  assert.equal(report.incoming, 12);
  assert.equal(report.salesCount, 1);
});

function stateWith(sales: Sale[], closures: CashClosure[] = []): PersistedPoolState {
  return {
    products,
    sales: sales.map((item) => {
      const copy = { ...item };
      delete copy.cashSessionId;
      return copy;
    }),
    expenses: [],
    cashOpen: false,
    openingBalance: 0,
    cashFund: DEFAULT_CASH_FUND,
    cashOpenedAt: timestamp,
    activeCashSession: null,
    cashMovements: [],
    cashClosures: closures,
    ordersEnabled: true,
    operatorCredentials: {},
  };
}

test("grava o cancelamento e recusa cancelamentos inconsistentes", () => {
  const cancelled = cancelSale({
    sale: sale("PV-C", 20, "Dinheiro"),
    products,
    operatorId: "poolblay",
    operatorName: "Poolblay",
    reason: "Cliente desistiu",
    restock: true,
    now: timestamp + 1_000,
  }).sale;
  const state = stateWith([cancelled]);
  assert.deepEqual(
    parsePoolState(structuredClone(state))?.sales[0].cancellation,
    cancelled.cancellation,
  );

  const beforeSale = structuredClone(state);
  beforeSale.sales[0].cancellation!.cancelledAt = timestamp - 1;
  assert.equal(parsePoolState(beforeSale), null);

  const noReason = structuredClone(state);
  noReason.sales[0].cancellation!.reason = " ";
  assert.equal(parsePoolState(noReason), null);
});

test("grava a conferência de Pix e cartão no fechamento", () => {
  const closure: CashClosure = {
    id: "FC-1",
    sessionId: "CX-1",
    openedAt: timestamp - 10_000,
    closedAt: timestamp - 5_000,
    openedByOperatorId: "elaine",
    openedByOperatorName: "Elaine",
    closedByOperatorId: "elaine",
    closedByOperatorName: "Elaine",
    openingBalance: 130,
    expectedBalance: 130,
    countedBalance: 130,
    difference: 0,
    cashFund: 130,
    withdrawalAmount: 0,
    remainingBalance: 130,
    methodChecks: [
      { method: "Pix", expected: 42, informed: 40, difference: -2 },
      { method: "Crédito", expected: 21.2, informed: 21.2, difference: 0 },
    ],
  };
  const state = stateWith([], [closure]);
  assert.deepEqual(parsePoolState(structuredClone(state))?.cashClosures, [closure]);

  const wrongDifference = structuredClone(state);
  wrongDifference.cashClosures[0].methodChecks![0].difference = 0;
  assert.equal(parsePoolState(wrongDifference), null);

  const cashChecked = structuredClone(state);
  cashChecked.cashClosures[0].methodChecks![0].method = "Dinheiro";
  assert.equal(parsePoolState(cashChecked), null);
});
