import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCashFlowEntries,
  buildCashFlowReport,
  createCashFlowRange,
} from "../features/pool-petiscos/cash-flow";
import { buildCashSessionSummary } from "../features/pool-petiscos/cash-session-summary";
import { DEFAULT_CASH_FUND, parseAmount } from "../features/pool-petiscos/domain";
import { parsePoolState } from "../features/pool-petiscos/persistence";
import {
  calculateSplitSalePricing,
  formatSalePayments,
  PaymentSplitError,
  resolveSplitDraft,
  saleAmountForMethod,
  salePayments,
  singlePaymentPricing,
} from "../features/pool-petiscos/sale-payments";
import type {
  CashClosure,
  PersistedPoolState,
  Sale,
} from "../features/pool-petiscos/types";

const timestamp = Date.parse("2026-10-17T20:00:00-03:00");

// 2 coxinhas (R$ 6) + 2 pastéis (R$ 9) = R$ 30.
const items: Sale["items"] = [
  { productId: "coxinha", name: "Coxinha", price: 6, quantity: 2 },
  { productId: "pastel", name: "Pastel", price: 9, quantity: 2 },
];

function saleFrom(
  id: string,
  pricing: ReturnType<typeof calculateSplitSalePricing>,
): Sale {
  return {
    id,
    cashSessionId: "CX-1",
    timestamp,
    subtotal: pricing.subtotal,
    surchargeRate: pricing.surchargeRate,
    surchargeAmount: pricing.surchargeAmount,
    total: pricing.total,
    payment: pricing.payment,
    payments: pricing.payments,
    operatorId: "elaine",
    operatorName: "Elaine",
    items,
    customerName: "Cliente",
    serviceMode: "venda-direta",
    orderStatus: "entregue",
    statusUpdatedAt: timestamp,
  };
}

function legacySale(id: string, total: number, payment: Sale["payment"]): Sale {
  return {
    id,
    cashSessionId: "CX-1",
    timestamp,
    total,
    payment,
    operatorId: "poolblay",
    operatorName: "Poolblay",
    items: [{ productId: "x", name: "X-burguer", price: total, quantity: 1 }],
    customerName: "Antigo",
    orderStatus: "entregue",
    statusUpdatedAt: timestamp,
  };
}

function stateWith(sales: Sale[]): PersistedPoolState {
  return {
    products: [],
    // Sem sessão de caixa, para testar só a validação das vendas.
    sales: sales.map((sale) => {
      const copy = { ...sale };
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
    cashClosures: [],
    ordersEnabled: true,
    operatorCredentials: {},
  };
}

test("divide o pedido entre dinheiro e Pix sem acréscimo", () => {
  const pricing = calculateSplitSalePricing(30, [
    { method: "Dinheiro", baseAmount: 20 },
    { method: "Pix", baseAmount: 10 },
  ]);
  assert.equal(pricing.payment, "Misto");
  assert.equal(pricing.total, 30);
  assert.equal(pricing.surchargeAmount, 0);
  assert.deepEqual(
    pricing.payments.map((part) => [part.method, part.amount]),
    [
      ["Dinheiro", 20],
      ["Pix", 10],
    ],
  );
});

test("aplica o acréscimo do cartão somente na parte paga no cartão", () => {
  const pricing = calculateSplitSalePricing(30, [
    { method: "Dinheiro", baseAmount: 10 },
    { method: "Crédito", baseAmount: 20 },
  ]);
  assert.equal(pricing.surchargeAmount, 1.2);
  assert.equal(pricing.total, 31.2);
  assert.equal(pricing.payments[1].amount, 21.2);
  assert.equal(pricing.surchargeRate, 0.04);
});

test("uma forma só mantém o mesmo resultado da regra anterior", () => {
  const pricing = singlePaymentPricing(9.99, "Crédito");
  assert.equal(pricing.payment, "Crédito");
  assert.equal(pricing.surchargeRate, 0.06);
  assert.equal(pricing.surchargeAmount, 0.6);
  assert.equal(pricing.total, 10.59);
  assert.deepEqual(singlePaymentPricing(0, "Pix").payments, []);
});

test("recusa partes que não fecham o pedido ou repetem a forma", () => {
  assert.throws(
    () =>
      calculateSplitSalePricing(30, [
        { method: "Dinheiro", baseAmount: 20 },
        { method: "Pix", baseAmount: 5 },
      ]),
    PaymentSplitError,
  );
  assert.throws(
    () =>
      calculateSplitSalePricing(30, [
        { method: "Pix", baseAmount: 15 },
        { method: "Pix", baseAmount: 15 },
      ]),
    /só pode aparecer uma vez/,
  );
});

test("a última forma recebe o restante digitado na tela", () => {
  const draft = resolveSplitDraft(
    30,
    [
      { method: "Dinheiro", amount: "20,00" },
      { method: "Pix", amount: "" },
    ],
    parseAmount,
  );
  assert.equal(draft.error, null);
  assert.equal(draft.remaining, 10);
  assert.equal(draft.pricing?.total, 30);

  const empty = resolveSplitDraft(
    30,
    [
      { method: "Dinheiro", amount: "" },
      { method: "Pix", amount: "" },
    ],
    parseAmount,
  );
  assert.match(empty.error ?? "", /Dinheiro/);

  const exceeded = resolveSplitDraft(
    30,
    [
      { method: "Dinheiro", amount: "30" },
      { method: "Pix", amount: "" },
    ],
    parseAmount,
  );
  assert.match(exceeded.error ?? "", /já cobrem o pedido/);
});

test("vendas antigas continuam válidas e viram uma única parte", () => {
  const legacy = legacySale("PV-ANTIGA", 25, "Dinheiro");
  const parsed = parsePoolState(stateWith([legacy]));
  assert.ok(parsed);
  assert.equal(parsed.sales[0].payments, undefined);
  assert.equal(parsed.sales[0].total, 25);
  assert.deepEqual(salePayments(parsed.sales[0]), [
    {
      method: "Dinheiro",
      baseAmount: 25,
      surchargeRate: 0,
      surchargeAmount: 0,
      amount: 25,
    },
  ]);
});

test("grava e relê uma venda mista e recusa partes adulteradas", () => {
  const mixed = saleFrom(
    "PV-MISTA",
    calculateSplitSalePricing(30, [
      { method: "Dinheiro", baseAmount: 10 },
      { method: "Crédito", baseAmount: 20 },
    ]),
  );
  const state = stateWith([mixed]);
  assert.deepEqual(parsePoolState(structuredClone(state)), state);

  const wrongSum = structuredClone(state);
  wrongSum.sales[0].payments![0].baseAmount = 5;
  wrongSum.sales[0].payments![0].amount = 5;
  assert.equal(parsePoolState(wrongSum), null);

  const pixWithSurcharge = structuredClone(state);
  pixWithSurcharge.sales[0].payments![0] = {
    method: "Pix",
    baseAmount: 10,
    surchargeRate: 0.06,
    surchargeAmount: 0.6,
    amount: 10.6,
  };
  assert.equal(parsePoolState(pixWithSurcharge), null);

  const mixedWithoutParts = structuredClone(state);
  delete mixedWithoutParts.sales[0].payments;
  assert.equal(parsePoolState(mixedWithoutParts), null);
});

test("caixa e relatórios contam cada parte na sua forma", () => {
  const mixed = saleFrom(
    "PV-MISTA",
    calculateSplitSalePricing(30, [
      { method: "Dinheiro", baseAmount: 20 },
      { method: "Pix", baseAmount: 10 },
    ]),
  );
  const legacy = legacySale("PV-ANTIGA", 15, "Dinheiro");
  assert.equal(saleAmountForMethod(mixed, "Dinheiro"), 20);
  assert.equal(
    formatSalePayments(mixed),
    "Dinheiro R$ 20,00 + Pix R$ 10,00",
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
    expectedBalance: 165,
    countedBalance: 165,
    difference: 0,
    cashFund: 130,
    withdrawalAmount: 35,
    remainingBalance: 130,
  };
  const summary = buildCashSessionSummary({
    closure,
    sales: [mixed, legacy],
    expenses: [],
    cashMovements: [],
  });
  assert.equal(summary.paymentTotals.Dinheiro, 35);
  assert.equal(summary.paymentTotals.Pix, 10);
  assert.equal(summary.salesTotal, 45);

  const report = buildCashFlowReport(
    buildCashFlowEntries({
      sales: [mixed, legacy],
      expenses: [],
      cashMovements: [],
    }),
    createCashFlowRange("today", timestamp),
  );
  assert.equal(report.paymentTotals.Dinheiro, 35);
  assert.equal(report.paymentTotals.Pix, 10);
  assert.equal(report.incoming, 45);
});
