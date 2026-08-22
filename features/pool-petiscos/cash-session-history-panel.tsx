"use client";

import {
  CalendarClock,
  Download,
  History,
  LoaderCircle,
  LockKeyhole,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useMemo, useState } from "react";
import { downloadCashSessionSummaryPdf } from "./cash-session-summary-export";
import {
  buildCashSessionSummary,
  shortCashSessionId,
} from "./cash-session-summary";
import { currency } from "./domain";
import { formatCashFlowDateTime } from "./cash-flow";
import type {
  ActiveCashSession,
  CashClosure,
  CashMovement,
  Expense,
  Sale,
} from "./types";

type CashSessionHistoryPanelProps = {
  activeSession: ActiveCashSession | null;
  closures: CashClosure[];
  sales: Sale[];
  expenses: Expense[];
  cashMovements: CashMovement[];
  onMessage: (message: string, tone?: "success" | "warning" | "info") => void;
};

export function CashSessionHistoryPanel({
  activeSession,
  closures,
  sales,
  expenses,
  cashMovements,
  onMessage,
}: CashSessionHistoryPanelProps) {
  const [selectedSessionId, setSelectedSessionId] = useState(
    closures[0]?.sessionId ?? "",
  );
  const [exporting, setExporting] = useState(false);

  const selectedClosure =
    closures.find((closure) => closure.sessionId === selectedSessionId) ??
    closures[0];
  const summary = useMemo(
    () =>
      selectedClosure
        ? buildCashSessionSummary({
            closure: selectedClosure,
            sales,
            expenses,
            cashMovements,
          })
        : null,
    [cashMovements, expenses, sales, selectedClosure],
  );

  async function exportSummary() {
    if (!summary) return;
    setExporting(true);
    try {
      await downloadCashSessionSummaryPdf(summary);
      onMessage("Resumo do fechamento baixado em PDF.", "info");
    } catch {
      onMessage("Não foi possível gerar o resumo deste fechamento.", "warning");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="mt-4 rounded-[22px] border border-[#e5deda] bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div>
          <span className="text-xs font-extrabold uppercase tracking-[.12em] text-[#d9202c]">
            Sessões de caixa
          </span>
          <h2 className="mt-1 text-xl font-black tracking-[-.025em]">
            Aberturas e fechamentos identificados
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6d6561]">
            Cada venda, saída, sangria e suprimento fica ligado ao caixa em que
            foi registrado.
          </p>
        </div>
        {activeSession ? (
          <div className="rounded-2xl border border-[#a9d9c2] bg-[#eaf8f1] px-4 py-3 text-sm text-[#175c3e]">
            <strong className="flex items-center gap-2 font-black">
              <WalletCards size={17} /> Sessão aberta
            </strong>
            <span className="mt-1 block font-semibold">
              {shortCashSessionId(activeSession.id)} • {activeSession.openedByOperatorName}
            </span>
            <span className="mt-0.5 block text-xs">
              Desde {formatCashFlowDateTime(activeSession.openedAt)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-2xl bg-[#f1eeeb] px-4 py-3 text-sm font-bold text-[#6d6561]">
            <LockKeyhole size={17} /> Nenhuma sessão aberta
          </div>
        )}
      </div>

      {!summary ? (
        <div className="mt-5 rounded-2xl border border-dashed border-[#d9d2ce] bg-[#faf8f6] p-8 text-center">
          <History className="mx-auto text-[#b5aaa4]" size={28} />
          <strong className="mt-3 block">Nenhum fechamento registrado</strong>
          <p className="mt-1 text-sm text-[#776f6b]">
            O primeiro resumo aparecerá aqui depois que o caixa for fechado.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1">
              <span className="mb-2 block text-sm font-extrabold text-[#5f5753]">
                Fechamento para consultar
              </span>
              <select
                value={summary.closure.sessionId}
                onChange={(event) => setSelectedSessionId(event.target.value)}
                className="h-12 w-full rounded-xl border border-[#ded7d2] bg-white px-4 text-sm font-bold outline-none focus:border-[#d9202c]"
              >
                {closures.map((closure) => (
                  <option key={closure.sessionId} value={closure.sessionId}>
                    {formatCashFlowDateTime(closure.closedAt)} — {shortCashSessionId(closure.sessionId)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void exportSummary()}
              disabled={exporting}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#302b29] px-5 text-sm font-extrabold text-white transition hover:bg-[#171514] disabled:opacity-55"
            >
              {exporting ? <LoaderCircle className="animate-spin" size={18} /> : <Download size={18} />}
              {exporting ? "Gerando..." : "Baixar resumo em PDF"}
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Vendas", currency.format(summary.salesTotal), `${summary.salesCount} pedido(s)`],
              ["Saídas", currency.format(summary.expenseTotal), `${summary.expenses.length} lançamento(s)`],
              ["Retirada", currency.format(summary.closure.withdrawalAmount), "No fechamento"],
              ["Fundo deixado", currency.format(summary.closure.remainingBalance), "Para a próxima abertura"],
            ].map(([label, value, helper]) => (
              <article key={label} className="rounded-2xl border border-[#ebe5e1] bg-[#faf8f6] p-4">
                <span className="text-xs font-bold text-[#776f6b]">{label}</span>
                <strong className="mt-2 block text-xl font-black">{value}</strong>
                <small className="text-xs text-[#9c928d]">{helper}</small>
              </article>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {(["Dinheiro", "Pix", "Débito", "Crédito", "Cartão"] as const).map(
              (payment) => (
                <div
                  key={payment}
                  className="rounded-xl border border-[#eee8e4] bg-white px-3 py-3"
                >
                  <span className="block text-xs font-bold text-[#8d8581]">
                    {payment === "Cartão" ? "Cartão legado" : payment}
                  </span>
                  <strong className="mt-1 block text-sm font-black">
                    {currency.format(summary.paymentTotals[payment])}
                  </strong>
                </div>
              ),
            )}
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <article className="rounded-2xl border border-[#ebe5e1] p-4">
              <strong className="flex items-center gap-2 text-sm font-black">
                <CalendarClock size={17} className="text-[#d9202c]" /> Conferência do caixa
              </strong>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-[#776f6b]">Esperado em dinheiro</dt><dd className="text-right font-black">{currency.format(summary.closure.expectedBalance)}</dd>
                <dt className="text-[#776f6b]">Contado</dt><dd className="text-right font-black">{currency.format(summary.closure.countedBalance)}</dd>
                <dt className="text-[#776f6b]">Diferença</dt><dd className={`text-right font-black ${Math.abs(summary.closure.difference) >= 0.005 ? "text-[#b41622]" : "text-[#27865d]"}`}>{currency.format(summary.closure.difference)}</dd>
              </dl>
              {summary.operatorSummaries.length > 0 && (
                <div className="mt-3 border-t border-[#eee8e4] pt-3">
                  {summary.operatorSummaries.map((operator) => (
                    <div
                      key={operator.operatorId}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="font-bold text-[#776f6b]">
                        {operator.operatorName}: {operator.salesCount} venda(s)
                      </span>
                      <strong>{currency.format(operator.salesTotal)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </article>
            <article className="rounded-2xl border border-[#ebe5e1] p-4">
              <strong className="flex items-center gap-2 text-sm font-black">
                <UserRound size={17} className="text-[#d9202c]" /> Responsáveis
              </strong>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-[#776f6b]">Abriu</dt><dd className="font-black">{summary.closure.openedByOperatorName}</dd>
                <dt className="text-[#776f6b]">Fechou</dt><dd className="font-black">{summary.closure.closedByOperatorName}</dd>
              </dl>
            </article>
          </div>
        </>
      )}
    </section>
  );
}
