import { currency, roundMoney } from "./domain";
import { surchargeRateForPayment } from "./payment-surcharge";
import { countedSales } from "./sale-cancellation";
import type {
  PaymentMethod,
  Sale,
  SalePaymentLabel,
  SalePaymentPart,
} from "./types";

export const MIXED_PAYMENT_LABEL = "Misto" satisfies SalePaymentLabel;
export const MAX_PAYMENT_PARTS = 4;

export type PaymentPartInput = {
  method: PaymentMethod;
  /** Parte do subtotal dos itens paga nesta forma, antes do acréscimo. */
  baseAmount: number;
};

export type SplitSalePricing = {
  subtotal: number;
  surchargeRate: number;
  surchargeAmount: number;
  total: number;
  payment: SalePaymentLabel;
  payments: SalePaymentPart[];
};

export class PaymentSplitError extends Error {}

export function createPaymentPart(
  method: PaymentMethod,
  baseAmount: number,
): SalePaymentPart {
  const normalizedBase = roundMoney(Math.max(0, baseAmount));
  const surchargeRate = surchargeRateForPayment(method);
  const surchargeAmount = roundMoney(normalizedBase * surchargeRate);
  return {
    method,
    baseAmount: normalizedBase,
    surchargeRate,
    surchargeAmount,
    amount: roundMoney(normalizedBase + surchargeAmount),
  };
}

/**
 * Divide o subtotal dos itens entre uma ou mais formas de pagamento.
 *
 * Cada parte informa quanto do pedido (antes do acréscimo) será pago naquela
 * forma; o acréscimo de débito/crédito incide somente sobre a parte do cartão.
 * A soma das partes precisa fechar exatamente o subtotal, sem sobra.
 */
export function calculateSplitSalePricing(
  subtotal: number,
  inputs: PaymentPartInput[],
): SplitSalePricing {
  const normalizedSubtotal = roundMoney(Math.max(0, subtotal));
  if (!inputs.length) {
    throw new PaymentSplitError("Escolha pelo menos uma forma de pagamento.");
  }
  if (inputs.length > MAX_PAYMENT_PARTS) {
    throw new PaymentSplitError(
      `Use no máximo ${MAX_PAYMENT_PARTS} formas de pagamento.`,
    );
  }
  const methods = new Set(inputs.map((input) => input.method));
  if (methods.size !== inputs.length) {
    throw new PaymentSplitError(
      "Cada forma de pagamento só pode aparecer uma vez.",
    );
  }
  const payments = inputs.map((input) => {
    if (!Number.isFinite(input.baseAmount) || input.baseAmount <= 0) {
      throw new PaymentSplitError(
        `Informe um valor maior que zero para ${input.method}.`,
      );
    }
    return createPaymentPart(input.method, input.baseAmount);
  });
  const paidBase = roundMoney(
    payments.reduce((total, part) => total + part.baseAmount, 0),
  );
  if (Math.abs(paidBase - normalizedSubtotal) > 0.005) {
    const difference = roundMoney(normalizedSubtotal - paidBase);
    throw new PaymentSplitError(
      difference > 0
        ? `Ainda faltam ${currency.format(difference)} para fechar o pedido.`
        : `As partes passam do pedido em ${currency.format(-difference)}.`,
    );
  }
  const surchargeAmount = roundMoney(
    payments.reduce((total, part) => total + part.surchargeAmount, 0),
  );
  return {
    subtotal: normalizedSubtotal,
    surchargeRate:
      payments.length === 1
        ? payments[0].surchargeRate
        : effectiveSurchargeRate(normalizedSubtotal, surchargeAmount),
    surchargeAmount,
    total: roundMoney(normalizedSubtotal + surchargeAmount),
    payment: payments.length === 1 ? payments[0].method : MIXED_PAYMENT_LABEL,
    payments,
  };
}

function effectiveSurchargeRate(subtotal: number, surchargeAmount: number) {
  if (subtotal <= 0 || surchargeAmount <= 0) return 0;
  return Math.round((surchargeAmount / subtotal) * 10_000) / 10_000;
}

/**
 * Partes de pagamento de qualquer venda. Vendas gravadas antes do pagamento
 * dividido não têm `payments`; elas são lidas como uma única parte com os
 * valores originais, sem reescrever o histórico.
 */
export function salePayments(sale: Sale): SalePaymentPart[] {
  if (sale.payments?.length) return sale.payments;
  const method: PaymentMethod =
    sale.payment === MIXED_PAYMENT_LABEL ? "Dinheiro" : sale.payment;
  const surchargeAmount = roundMoney(sale.surchargeAmount ?? 0);
  const total = roundMoney(sale.total);
  return [
    {
      method,
      baseAmount: roundMoney(sale.subtotal ?? total - surchargeAmount),
      surchargeRate: sale.surchargeRate ?? 0,
      surchargeAmount,
      amount: total,
    },
  ];
}

/** Valor efetivamente recebido em uma forma de pagamento nesta venda. */
export function saleAmountForMethod(sale: Sale, method: PaymentMethod) {
  return roundMoney(
    salePayments(sale)
      .filter((part) => part.method === method)
      .reduce((total, part) => total + part.amount, 0),
  );
}

export function sumSalesByPaymentMethod<M extends PaymentMethod>(
  sales: Sale[],
  methods: readonly M[],
): Record<M, number> {
  const totals = Object.fromEntries(methods.map((method) => [method, 0])) as Record<
    M,
    number
  >;
  countedSales(sales).forEach((sale) => {
    salePayments(sale).forEach((part) => {
      if (part.method in totals) {
        const method = part.method as M;
        totals[method] = roundMoney(totals[method] + part.amount);
      }
    });
  });
  return totals;
}

/** Ex.: "Pix" ou "Dinheiro R$ 20,00 + Crédito R$ 10,60". */
export function formatSalePayments(sale: Sale) {
  const parts = salePayments(sale);
  if (parts.length === 1) return parts[0].method;
  return parts
    .map((part) => `${part.method} ${currency.format(part.amount)}`)
    .join(" + ");
}

/** Preço de uma venda paga numa forma só; aceita carrinho vazio. */
export function singlePaymentPricing(
  subtotal: number,
  method: PaymentMethod,
): SplitSalePricing {
  const normalizedSubtotal = roundMoney(Math.max(0, subtotal));
  const part = createPaymentPart(method, normalizedSubtotal);
  return {
    subtotal: normalizedSubtotal,
    surchargeRate: part.surchargeRate,
    surchargeAmount: part.surchargeAmount,
    total: part.amount,
    payment: method,
    payments: normalizedSubtotal > 0 ? [part] : [],
  };
}

export type PaymentDraftRow = {
  method: PaymentMethod;
  /** Valor digitado; ignorado na última linha, que recebe o restante. */
  amount: string;
};

export type SplitDraftResult =
  | { pricing: SplitSalePricing; remaining: number; error: null }
  | { pricing: null; remaining: number; error: string };

/**
 * Converte as linhas da tela de venda em partes de pagamento. O operador
 * digita quanto do pedido cada forma cobre; a última forma sempre recebe o
 * restante, então a soma fecha o pedido sem conta de cabeça.
 */
export function resolveSplitDraft(
  subtotal: number,
  rows: PaymentDraftRow[],
  parse: (value: string) => number,
): SplitDraftResult {
  const normalizedSubtotal = roundMoney(Math.max(0, subtotal));
  let typed = 0;
  for (const row of rows.slice(0, -1)) {
    const value = parse(row.amount);
    if (!Number.isFinite(value) || value <= 0) {
      return {
        pricing: null,
        remaining: roundMoney(normalizedSubtotal - typed),
        error: `Informe quanto será pago em ${row.method}.`,
      };
    }
    typed = roundMoney(typed + value);
  }
  const remaining = roundMoney(normalizedSubtotal - typed);
  const last = rows.at(-1);
  if (!last) {
    return { pricing: null, remaining, error: "Escolha as formas de pagamento." };
  }
  if (remaining <= 0) {
    return {
      pricing: null,
      remaining,
      error: `Os valores já cobrem o pedido. Diminua um valor ou remova ${last.method}.`,
    };
  }
  try {
    const pricing = calculateSplitSalePricing(normalizedSubtotal, [
      ...rows
        .slice(0, -1)
        .map((row) => ({ method: row.method, baseAmount: parse(row.amount) })),
      { method: last.method, baseAmount: remaining },
    ]);
    return { pricing, remaining, error: null };
  } catch (error) {
    return {
      pricing: null,
      remaining,
      error:
        error instanceof PaymentSplitError
          ? error.message
          : "Revise as formas de pagamento.",
    };
  }
}
