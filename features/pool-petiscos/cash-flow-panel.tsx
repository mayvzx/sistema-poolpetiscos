"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarRange,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  ReceiptText,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  buildCashFlowEntries,
  buildCashFlowReport,
  createCashFlowRange,
  formatCashFlowDateTime,
  type CashFlowPeriodMode,
} from "./cash-flow";
import {
  downloadCashFlowPdf,
  downloadCashFlowWorkbook,
} from "./cash-flow-export";
import { currency, formatDateKey } from "./domain";
import type { CashMovement, Expense, Sale, Toast } from "./types";

type CashFlowPanelProps = {
  sales: Sale[];
  expenses: Expense[];
  cashMovements: CashMovement[];
  now: number;
  onMessage: (message: string, tone?: Toast["tone"]) => void;
};

const PERIOD_OPTIONS: Array<{
  id: CashFlowPeriodMode;
  label: string;
}> = [
  { id: "today", label: "Hoje" },
  { id: "month", label: "Este mês" },
  { id: "custom", label: "Escolher período" },
];

export function CashFlowPanel({
  sales,
  expenses,
  cashMovements,
  now,
  onMessage,
}: CashFlowPanelProps) {
  const todayKey = formatDateKey(now);
  const [periodMode, setPeriodMode] = useState<CashFlowPeriodMode>("month");
  const [customFrom, setCustomFrom] = useState(`${todayKey.slice(0, 7)}-01`);
  const [customTo, setCustomTo] = useState(todayKey);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);
  const entries = useMemo(
    () => buildCashFlowEntries({ sales, expenses, cashMovements }),
    [cashMovements, expenses, sales],
  );
  const reportResult = useMemo(() => {
    try {
      const range = createCashFlowRange(
        periodMode,
        now,
        customFrom,
        customTo,
      );
      return { report: buildCashFlowReport(entries, range), error: "" };
    } catch (error) {
      return {
        report: null,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível montar este período.",
      };
    }
  }, [customFrom, customTo, entries, now, periodMode]);
  const report = reportResult.report;

  async function exportReport(format: "xlsx" | "pdf") {
    if (!report) {
      onMessage(reportResult.error, "warning");
      return;
    }
    setExporting(format);
    try {
      if (format === "xlsx") {
        await downloadCashFlowWorkbook(report);
      } else {
        await downloadCashFlowPdf(report);
      }
      onMessage(
        format === "xlsx"
          ? "Planilha do fluxo de caixa baixada."
          : "Relatório em PDF baixado.",
        "info",
      );
    } catch {
      onMessage(
        `Não foi possível gerar ${format === "xlsx" ? "a planilha" : "o PDF"}.`,
        "warning",
      );
    } finally {
      setExporting(null);
    }
  }

  return (
    <section className="mt-4 overflow-hidden rounded-[24px] border border-[#e5deda] bg-white shadow-sm">
      <div className="cash-flow-report-hero border-b border-[#e9e2de] p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.12em] text-[#b41622]">
              <CalendarRange size={17} />
              Relatório conferível
            </span>
            <h2 className="mt-2 text-2xl font-black tracking-[-.035em] text-[#302b29] sm:text-3xl">
              Fluxo de caixa
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#6d6561]">
              Veja entradas e saídas como na planilha usada pela Pool. Escolha
              o período e baixe o relatório em Excel ou PDF.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void exportReport("xlsx")}
              disabled={Boolean(exporting) || !report}
              className="flex min-h-12 items-center gap-2 rounded-xl bg-[#23734f] px-4 text-sm font-extrabold text-white shadow-[0_9px_20px_rgba(35,115,79,.18)] transition hover:bg-[#195c3e] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {exporting === "xlsx" ? (
                <LoaderCircle size={18} className="animate-spin" />
              ) : (
                <FileSpreadsheet size={18} />
              )}
              {exporting === "xlsx" ? "Gerando Excel..." : "Baixar Excel"}
            </button>
            <button
              type="button"
              onClick={() => void exportReport("pdf")}
              disabled={Boolean(exporting) || !report}
              className="flex min-h-12 items-center gap-2 rounded-xl bg-[#302b29] px-4 text-sm font-extrabold text-white transition hover:bg-[#171514] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {exporting === "pdf" ? (
                <LoaderCircle size={18} className="animate-spin" />
              ) : (
                <FileText size={18} />
              )}
              {exporting === "pdf" ? "Gerando PDF..." : "Baixar PDF"}
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-[#e6dfdb] bg-white/85 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Período do fluxo de caixa">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setPeriodMode(option.id)}
                aria-pressed={periodMode === option.id}
                className={`min-h-10 rounded-xl px-4 text-sm font-extrabold transition ${
                  periodMode === option.id
                    ? "bg-[#d9202c] text-white shadow-sm"
                    : "border border-[#ded7d2] bg-white text-[#5f5753] hover:border-[#d9202c]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {periodMode === "custom" && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="flex items-center gap-2 text-sm font-bold text-[#5f5753]">
                De
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || todayKey}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className="h-10 rounded-xl border border-[#d9d2ce] bg-white px-3 outline-none focus:border-[#d9202c]"
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-bold text-[#5f5753]">
                Até
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={todayKey}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className="h-10 rounded-xl border border-[#d9d2ce] bg-white px-3 outline-none focus:border-[#d9202c]"
                />
              </label>
            </div>
          )}
          {periodMode !== "custom" && report && (
            <span className="text-sm font-bold text-[#776f6b]">
              Período: {report.range.label}
            </span>
          )}
        </div>
        {reportResult.error && (
          <p role="alert" className="mt-3 text-sm font-bold text-[#b41622]">
            {reportResult.error}
          </p>
        )}
      </div>

      {report && (
        <>
          <div className="grid gap-px bg-[#e7dfdb] sm:grid-cols-3">
            {[
              {
                label: "Entradas",
                value: report.incoming,
                helper: "Vendas e suprimentos",
                icon: ArrowUpRight,
                color: "bg-[#e5f6ed] text-[#23734f]",
              },
              {
                label: "Saídas",
                value: report.outgoing,
                helper: "Despesas e sangrias",
                icon: ArrowDownRight,
                color: "bg-[#fff0f1] text-[#b41622]",
              },
              {
                label: "Saldo do período",
                value: report.balance,
                helper: "Entradas menos saídas",
                icon: ReceiptText,
                color: "bg-[#fff8de] text-[#8d6100]",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.label} className="bg-white p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-xs font-extrabold uppercase tracking-[.08em] text-[#776f6b]">
                        {item.label}
                      </span>
                      <strong className="mt-2 block text-2xl font-black tracking-[-.04em] text-[#302b29] sm:text-3xl">
                        {currency.format(item.value)}
                      </strong>
                      <span className="mt-1 block text-xs font-semibold text-[#9c928d]">
                        {item.helper}
                      </span>
                    </div>
                    <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${item.color}`}>
                      <Icon size={21} />
                    </span>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="max-h-[520px] overflow-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-[#e66e22] text-xs font-extrabold uppercase tracking-[.08em] text-white shadow-sm">
                <tr>
                  <th className="px-5 py-4">Data</th>
                  <th className="px-4 py-4">Movimentação</th>
                  <th className="px-4 py-4">Descrição</th>
                  <th className="px-4 py-4 text-right">Valor</th>
                  <th className="px-5 py-4">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e7dfdb]">
                {report.entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className={
                      entry.movement === "Entrada"
                        ? "bg-[#edf9f2]"
                        : "bg-[#fff3f5]"
                    }
                  >
                    <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold text-[#5f5753]">
                      {formatCashFlowDateTime(entry.timestamp)}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1.5 text-xs font-extrabold ${
                          entry.movement === "Entrada"
                            ? "bg-[#d7f0e3] text-[#23734f]"
                            : "bg-[#f9dce1] text-[#b41622]"
                        }`}
                      >
                        {entry.movement}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm font-bold text-[#302b29]">
                      {entry.description}
                    </td>
                    <td className="px-4 py-4 text-right text-sm font-black text-[#302b29]">
                      {currency.format(entry.amount)}
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-[#6d6561]">
                      {entry.observation}
                    </td>
                  </tr>
                ))}
                {!report.entries.length && (
                  <tr>
                    <td colSpan={5} className="px-6 py-14 text-center">
                      <ReceiptText size={30} className="mx-auto text-[#c7beba]" />
                      <strong className="mt-3 block text-base">
                        Nenhuma movimentação neste período
                      </strong>
                      <span className="mt-1 block text-sm text-[#776f6b]">
                        O relatório será preenchido conforme as vendas e saídas forem registradas.
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
