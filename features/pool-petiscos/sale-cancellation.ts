import type { Product, Sale, SaleOperatorId } from "./types";

export const CANCELLATION_REASON_MAX_LENGTH = 180;
export const CANCELLATION_REASONS = [
  "Lançado errado",
  "Cliente desistiu",
  "Pagamento não aprovado",
  "Produto em falta",
] as const;

export function isSaleCancelled(sale: Sale) {
  return sale.cancellation !== undefined;
}

/** Vendas que contam em totais, caixa, relatórios e fila de comandas. */
export function countedSales(sales: Sale[]) {
  return sales.filter((sale) => !isSaleCancelled(sale));
}

export type CancelEligibility = { allowed: true } | { allowed: false; message: string };

/**
 * Só vendas do caixa aberto podem ser canceladas: um caixa já fechado foi
 * conferido e não pode mudar depois. Pedidos do cardápio online também ficam
 * de fora, porque a conclusão já foi confirmada na nuvem.
 */
export function saleCancelEligibility(
  sale: Sale,
  activeCashSessionId: string | null,
): CancelEligibility {
  if (isSaleCancelled(sale)) {
    return { allowed: false, message: "Esta venda já foi cancelada." };
  }
  if (sale.source === "cardapio-online") {
    return {
      allowed: false,
      message: "Pedidos do cardápio online não podem ser cancelados pelo caixa.",
    };
  }
  if (!activeCashSessionId || sale.cashSessionId !== activeCashSessionId) {
    return {
      allowed: false,
      message: "Só é possível cancelar vendas do caixa que está aberto.",
    };
  }
  return { allowed: true };
}

export function cancelSale({
  sale,
  products,
  operatorId,
  operatorName,
  reason,
  restock,
  now,
}: {
  sale: Sale;
  products: Product[];
  operatorId: SaleOperatorId;
  operatorName: string;
  reason: string;
  restock: boolean;
  now: number;
}): { sale: Sale; products: Product[] } {
  const normalizedReason = reason.trim().slice(0, CANCELLATION_REASON_MAX_LENGTH);
  if (!normalizedReason) {
    throw new Error("Informe o motivo do cancelamento.");
  }
  const cancelledSale: Sale = {
    ...sale,
    cancellation: {
      cancelledAt: Math.max(now, sale.timestamp),
      operatorId,
      operatorName,
      reason: normalizedReason,
      restocked: restock,
    },
  };
  if (!restock) return { sale: cancelledSale, products };
  const returned = new Map<string, number>();
  sale.items.forEach((item) => {
    returned.set(item.productId, (returned.get(item.productId) ?? 0) + item.quantity);
  });
  return {
    sale: cancelledSale,
    products: products.map((product) =>
      returned.has(product.id)
        ? { ...product, stock: product.stock + (returned.get(product.id) ?? 0) }
        : product,
    ),
  };
}
