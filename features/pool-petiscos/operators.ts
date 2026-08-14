import type { OperatorId, Sale, SaleOperatorId } from "./types";

export type OperatorProfile = {
  id: OperatorId;
  name: string;
  familiarName: string;
  role: string;
  initials: string;
  accent: string;
  softAccent: string;
};

export type OperatorSalesSummary = {
  id: SaleOperatorId;
  name: string;
  count: number;
  total: number;
};

export const OPERATOR_SESSION_KEY = "pool-petiscos-operador-v1";

export const OPERATOR_PROFILES = [
  {
    id: "elaine",
    name: "Elaine",
    familiarName: "Elaine",
    role: "Proprietária",
    initials: "E",
    accent: "#d9202c",
    softAccent: "#fff0f1",
  },
  {
    id: "poolblay",
    name: "Poolblay",
    familiarName: "Pool",
    role: "Proprietário",
    initials: "P",
    accent: "#302b29",
    softAccent: "#f1eeeb",
  },
] as const satisfies readonly OperatorProfile[];

export function isOperatorId(value: unknown): value is OperatorId {
  return OPERATOR_PROFILES.some((operator) => operator.id === value);
}

export function getOperatorProfile(operatorId: OperatorId) {
  return OPERATOR_PROFILES.find((operator) => operator.id === operatorId)!;
}

export function operatorNameForSale(operatorId: SaleOperatorId) {
  if (operatorId === "nao-identificado") return "Não identificado";
  return getOperatorProfile(operatorId).name;
}

export function buildOperatorSalesSummary(
  sales: Sale[],
): OperatorSalesSummary[] {
  const summaries = new Map<SaleOperatorId, OperatorSalesSummary>();

  for (const profile of OPERATOR_PROFILES) {
    summaries.set(profile.id, {
      id: profile.id,
      name: profile.name,
      count: 0,
      total: 0,
    });
  }

  for (const sale of sales) {
    const current = summaries.get(sale.operatorId) ?? {
      id: sale.operatorId,
      name: operatorNameForSale(sale.operatorId),
      count: 0,
      total: 0,
    };
    current.count += 1;
    current.total += sale.total;
    summaries.set(sale.operatorId, current);
  }

  return Array.from(summaries.values()).filter(
    (summary) => summary.id !== "nao-identificado" || summary.count > 0,
  );
}
