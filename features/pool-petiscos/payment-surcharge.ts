import { roundMoney } from "./domain";
import type { PaymentMethod, Sale } from "./types";

export const PAYMENT_SURCHARGE_RATES: Readonly<
  Partial<Record<PaymentMethod, number>>
> = {
  Débito: 0.03,
  Crédito: 0.06,
};

export type SalePricing = {
  subtotal: number;
  surchargeRate: number;
  surchargeAmount: number;
  total: number;
};

export function surchargeRateForPayment(payment: PaymentMethod) {
  return PAYMENT_SURCHARGE_RATES[payment] ?? 0;
}

export function calculateSalePricing(
  subtotal: number,
  payment: PaymentMethod,
): SalePricing {
  const normalizedSubtotal = roundMoney(Math.max(0, subtotal));
  const surchargeRate = surchargeRateForPayment(payment);
  const surchargeAmount = roundMoney(normalizedSubtotal * surchargeRate);
  return {
    subtotal: normalizedSubtotal,
    surchargeRate,
    surchargeAmount,
    total: roundMoney(normalizedSubtotal + surchargeAmount),
  };
}

export function salePricing(sale: Sale): SalePricing {
  const subtotal = roundMoney(sale.subtotal ?? sale.total);
  const surchargeRate = sale.surchargeRate ?? 0;
  const surchargeAmount = roundMoney(sale.surchargeAmount ?? 0);
  return {
    subtotal,
    surchargeRate,
    surchargeAmount,
    total: roundMoney(sale.total),
  };
}

export function formatSurchargePercent(rate: number) {
  return `${Math.round(rate * 100)}%`;
}
