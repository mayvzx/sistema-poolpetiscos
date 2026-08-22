"use client";

import { AlertTriangle, Check, WalletCards } from "lucide-react";
import type { FormEventHandler } from "react";
import {
  calculateCashClosing,
  currency,
  parseAmount,
} from "./domain";

type CashClosingFormProps = {
  expectedBalance: number;
  cashSalesTotal: number;
  cashFund: number;
  countedValue: string;
  onCountedValueChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
};

export function CashClosingForm({
  expectedBalance,
  cashSalesTotal,
  cashFund,
  countedValue,
  onCountedValueChange,
  onSubmit,
}: CashClosingFormProps) {
  const countedBalance = parseAmount(countedValue);
  const validCount = Number.isFinite(countedBalance) && countedBalance >= 0;
  const closing = validCount
    ? calculateCashClosing({ expectedBalance, countedBalance, cashFund })
    : null;
  const balanced = closing && Math.abs(closing.difference) < 0.005;

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-[#f7f5f2] p-3">
          <span className="block text-[8px] text-[#776f6b]">
            Esperado antes da retirada
          </span>
          <strong className="mt-1 block text-lg">
            {currency.format(expectedBalance)}
          </strong>
        </div>
        <div className="rounded-xl bg-[#f7f5f2] p-3">
          <span className="block text-[8px] text-[#776f6b]">
            Vendas em dinheiro
          </span>
          <strong className="mt-1 block text-lg">
            {currency.format(cashSalesTotal)}
          </strong>
        </div>
      </div>

      <div className="rounded-xl border border-[#eadfce] bg-[#fffaf1] p-3 text-[9px] leading-4 text-[#76551c]">
        Conte todo o dinheiro antes de retirar o movimento do dia. O sistema
        calculará a retirada e deixará o fundo de troco configurado.
      </div>

      <label className="block" htmlFor="cash-closing-counted">
        <span className="mb-1.5 block text-[9px] font-extrabold text-[#776f6b]">
          Total contado antes da retirada
        </span>
        <input
          id="cash-closing-counted"
          required
          autoFocus
          inputMode="decimal"
          value={countedValue}
          onChange={(event) => onCountedValueChange(event.target.value)}
          placeholder="R$ 0,00"
          aria-describedby="cash-closing-help"
          className="h-11 w-full rounded-xl border border-[#ebe5e1] px-3 text-xs outline-none focus:border-[#d9202c]"
        />
      </label>

      {closing && (
        <div id="cash-closing-help" className="space-y-2" aria-live="polite">
          <div
            className={`rounded-xl p-3 text-[9px] font-bold ${
              balanced
                ? "bg-[#eaf8f1] text-[#23734f]"
                : "bg-[#fff9e9] text-[#8d6100]"
            }`}
          >
            Diferença antes da retirada: {currency.format(closing.difference)}
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#dfd8d4] bg-[#302b29] text-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-white/10 p-3">
              <span className="grid size-9 place-items-center rounded-xl bg-[#27865d]">
                <WalletCards size={18} />
              </span>
              <div>
                <span className="block text-[8px] font-bold uppercase tracking-[.12em] text-white/55">
                  Fechamento preparado
                </span>
                <strong className="text-sm">O que fazer com o dinheiro</strong>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-px bg-white/10">
              <div className="bg-[#302b29] p-3">
                <dt className="text-[8px] text-white/55">Retirar agora</dt>
                <dd className="mt-1 text-base font-black text-[#ffb45e]">
                  {currency.format(closing.withdrawalAmount)}
                </dd>
              </div>
              <div className="bg-[#302b29] p-3">
                <dt className="text-[8px] text-white/55">Deixar para troco</dt>
                <dd className="mt-1 text-base font-black text-[#72d4a5]">
                  {currency.format(closing.remainingBalance)}
                </dd>
              </div>
            </dl>
          </div>

          {closing.fundShortfall > 0 && (
            <div
              role="alert"
              className="flex gap-2 rounded-xl bg-[#fff0f1] p-3 text-[9px] font-bold leading-4 text-[#b41622]"
            >
              <AlertTriangle size={16} className="shrink-0" />
              O valor contado não completa o fundo de {currency.format(cashFund)}.
              Faltarão {currency.format(closing.fundShortfall)} para a próxima
              abertura.
            </div>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={!validCount}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#302b29] text-xs font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Check size={18} />
        Fechar e registrar retirada
      </button>
    </form>
  );
}
