import { roundMoney } from "./domain";
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
  paymentTotals: Record<PaymentMethod, number>;
  expenseTotal: number;
  cashExpenseTotal: number;
  suppliesTotal: number;
  withdrawalsTotal: number;
  result: number;
  operatorSummaries: CashSessionOperatorSummary[];
};

const PAYMENT_METHODS: PaymentMethod[] = [
  "Dinheiro",
  "Pix",
  "Débito",
  "Crédito",
  "Cartão",
];

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
  const sessionSales = sales.filter(
    (sale) => sale.cashSessionId === closure.sessionId,
  );
  const sessionExpenses = expenses.filter(
    (expense) => expense.cashSessionId === closure.sessionId,
  );
  const sessionMovements = cashMovements.filter(
    (movement) => movement.cashSessionId === closure.sessionId,
  );
  const paymentTotals = Object.fromEntries(
    PAYMENT_METHODS.map((payment) => [
      payment,
      roundMoney(
        sessionSales
          .filter((sale) => sale.payment === payment)
          .reduce((total, sale) => total + sale.total, 0),
      ),
    ]),
  ) as Record<PaymentMethod, number>;
  const operatorMap = new Map<string, CashSessionOperatorSummary>();
  sessionSales.forEach((sale) => {
    const current = operatorMap.get(sale.operatorId) ?? {
      operatorId: sale.operatorId,
      operatorName: sale.operatorName,
      salesCount: 0,
      salesTotal: 0,
    };
    current.salesCount += 1;
    current.salesTotal = roundMoney(current.salesTotal + sale.total);
    operatorMap.set(sale.operatorId, current);
  });
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
    operatorSummaries: [...operatorMap.values()].sort(
      (left, right) => right.salesTotal - left.salesTotal,
    ),
  };
}
