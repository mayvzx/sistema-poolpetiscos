import { roundMoney } from "./domain";
import { buildOperatorSalesSummary } from "./operators";
import { REPORT_PAYMENT_METHODS } from "./payment-methods";
import { countedSales, isSaleCancelled } from "./sale-cancellation";
import { sumSalesByPaymentMethod } from "./sale-payments";
import type {
  CashClosure,
  CashMovement,
  Expense,
  PaymentMethod,
  Sale,
} from "./types";

export type CashSessionOperatorSummary = {
  operatorId: Sale["operatorId"];
  operatorName: string;
  salesCount: number;
  salesTotal: number;
};

export type CashSessionSummary = {
  closure: CashClosure;
  sales: Sale[];
  expenses: Expense[];
  movements: CashMovement[];
  salesCount: number;
  salesTotal: number;
  cancelledCount: number;
  cancelledTotal: number;
  paymentTotals: Record<PaymentMethod, number>;
  expenseTotal: number;
  cashExpenseTotal: number;
  suppliesTotal: number;
  withdrawalsTotal: number;
  result: number;
  operatorSummaries: CashSessionOperatorSummary[];
};

export function shortCashSessionId(sessionId: string) {
  const normalized = sessionId.replace(/[^A-Za-z0-9-]/g, "");
  return normalized.length > 18 ? normalized.slice(-18) : normalized;
}

export function buildCashSessionSummary({
  closure,
  sales,
  expenses,
  cashMovements,
}: {
  closure: CashClosure;
  sales: Sale[];
  expenses: Expense[];
  cashMovements: CashMovement[];
}): CashSessionSummary {
  const allSessionSales = sales.filter(
    (sale) => sale.cashSessionId === closure.sessionId,
  );
  const sessionSales = countedSales(allSessionSales);
  const cancelledSales = allSessionSales.filter(isSaleCancelled);
  const sessionExpenses = expenses.filter(
    (expense) => expense.cashSessionId === closure.sessionId,
  );
  const sessionMovements = cashMovements.filter(
    (movement) => movement.cashSessionId === closure.sessionId,
  );
  const paymentTotals = sumSalesByPaymentMethod(
    sessionSales,
    REPORT_PAYMENT_METHODS,
  );
  const salesTotal = roundMoney(
    sessionSales.reduce((total, sale) => total + sale.total, 0),
  );
  const expenseTotal = roundMoney(
    sessionExpenses.reduce((total, expense) => total + expense.amount, 0),
  );
  return {
    closure,
    sales: sessionSales,
    expenses: sessionExpenses,
    movements: sessionMovements,
    salesCount: sessionSales.length,
    salesTotal,
    cancelledCount: cancelledSales.length,
    cancelledTotal: roundMoney(
      cancelledSales.reduce((total, sale) => total + sale.total, 0),
    ),
    paymentTotals,
    expenseTotal,
    cashExpenseTotal: roundMoney(
      sessionExpenses
        .filter((expense) => expense.payment === "Dinheiro")
        .reduce((total, expense) => total + expense.amount, 0),
    ),
    suppliesTotal: roundMoney(
      sessionMovements
        .filter((movement) => movement.kind === "suprimento")
        .reduce((total, movement) => total + movement.amount, 0),
    ),
    withdrawalsTotal: roundMoney(
      sessionMovements
        .filter((movement) => movement.kind === "sangria")
        .reduce((total, movement) => total + movement.amount, 0),
    ),
    result: roundMoney(salesTotal - expenseTotal),
    operatorSummaries: buildOperatorSalesSummary(sessionSales)
      .filter((summary) => summary.count > 0)
      .map((summary) => ({
        operatorId: summary.id,
        operatorName: summary.name,
        salesCount: summary.count,
        salesTotal: summary.total,
      }))
      .sort((left, right) => right.salesTotal - left.salesTotal),
  };
}
