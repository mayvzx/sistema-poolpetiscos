import assert from "node:assert/strict";
import test from "node:test";
import { buildCashSessionSummary } from "../features/pool-petiscos/cash-session-summary";
import { createCashSessionSummaryPdf } from "../features/pool-petiscos/cash-session-summary-export";
import type {
  CashClosure,
  CashMovement,
  Expense,
  Sale,
} from "../features/pool-petiscos/types";

const closure: CashClosure = {
  id: "FC-1",
  sessionId: "CX-1",
  openedAt: 100,
  closedAt: 200,
  openedByOperatorId: "elaine",
  openedByOperatorName: "Elaine",
  closedByOperatorId: "poolblay",
  closedByOperatorName: "Poolblay",
  openingBalance: 130,
  expectedBalance: 155,
  countedBalance: 155,
  difference: 0,
  cashFund: 130,
  withdrawalAmount: 25,
  remainingBalance: 130,
};

function sale(id: string, sessionId: string, total: number, payment: Sale["payment"]): Sale {
  return {
    id,
    cashSessionId: sessionId,
    timestamp: 150,
    total,
    payment,
    operatorId: "elaine",
    operatorName: "Elaine",
    items: [{ productId: "p", name: "Pastel", price: total, quantity: 1 }],
    customerName: "Cliente",
    orderStatus: "entregue",
    statusUpdatedAt: 150,
  };
}

test("resume somente os registros da sessão fechada", () => {
  const sales: Sale[] = [
    sale("PV-1", "CX-1", 20, "Dinheiro"),
    sale("PV-2", "CX-1", 30, "Pix"),
    sale("PV-3", "CX-OUTRA", 999, "Dinheiro"),
  ];
  const expenses: Expense[] = [
    {
      id: "DS-1",
      cashSessionId: "CX-1",
      timestamp: 160,
      description: "Gás",
      category: "Operacional",
      amount: 5,
      payment: "Dinheiro",
    },
  ];
  const cashMovements: CashMovement[] = [
    {
      id: "MC-1",
      cashSessionId: "CX-1",
      timestamp: 170,
      description: "Retirada",
      amount: 25,
      kind: "sangria",
    },
  ];

  const summary = buildCashSessionSummary({
    closure,
    sales,
    expenses,
    cashMovements,
  });

  assert.equal(summary.salesCount, 2);
  assert.equal(summary.salesTotal, 50);
  assert.equal(summary.paymentTotals.Dinheiro, 20);
  assert.equal(summary.paymentTotals.Pix, 30);
  assert.equal(summary.expenseTotal, 5);
  assert.equal(summary.withdrawalsTotal, 25);
  assert.equal(summary.result, 45);
  assert.deepEqual(summary.operatorSummaries, [
    {
      operatorId: "elaine",
      operatorName: "Elaine",
      salesCount: 2,
      salesTotal: 50,
    },
  ]);
});

test("gera um PDF real para o resumo do fechamento", async () => {
  const summary = buildCashSessionSummary({
    closure,
    sales: [sale("PV-1", "CX-1", 20, "Dinheiro")],
    expenses: [],
    cashMovements: [],
  });

  const pdf = await createCashSessionSummaryPdf(summary);

  assert.equal(new TextDecoder().decode(pdf.slice(0, 5)), "%PDF-");
  assert.ok(pdf.byteLength > 5_000);
});
