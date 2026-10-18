import type { PaymentMethod } from "./types";

/**
 * Lista única das formas de pagamento. "Cartão" é a forma antiga, anterior à
 * separação entre débito e crédito: continua válida nos registros, mas não é
 * oferecida em vendas novas.
 */
export const CHECKOUT_PAYMENT_METHODS: readonly PaymentMethod[] = [
  "Pix",
  "Dinheiro",
  "Débito",
  "Crédito",
];

export const ALL_PAYMENT_METHODS: readonly PaymentMethod[] = [
  ...CHECKOUT_PAYMENT_METHODS,
  "Cartão",
];

/** Ordem usada em relatórios e no fechamento: dinheiro primeiro. */
export const REPORT_PAYMENT_METHODS: readonly PaymentMethod[] = [
  "Dinheiro",
  "Pix",
  "Débito",
  "Crédito",
  "Cartão",
];

export const LEGACY_PAYMENT_METHOD_LABEL: Partial<Record<PaymentMethod, string>> = {
  Cartão: "Cartão (antigo)",
};

export function paymentMethodLabel(method: PaymentMethod) {
  return LEGACY_PAYMENT_METHOD_LABEL[method] ?? method;
}
