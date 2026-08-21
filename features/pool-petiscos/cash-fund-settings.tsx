"use client";

import { Check, WalletCards } from "lucide-react";
import { type FormEvent, useState } from "react";
import { currency, parseAmount, roundMoney } from "./domain";

type CashFundSettingsProps = {
  cashFund: number;
  onCashFundChange: (cashFund: number) => void;
  onMessage: (
    message: string,
    tone?: "success" | "warning" | "info",
  ) => void;
};

function amountInputValue(value: number) {
  return value.toFixed(2).replace(".", ",");
}

export function CashFundSettings({
  cashFund,
  onCashFundChange,
  onMessage,
}: CashFundSettingsProps) {
  const [value, setValue] = useState(() => amountInputValue(cashFund));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseAmount(value);
    if (!Number.isFinite(amount) || amount < 0) {
      onMessage("Informe um fundo de troco válido.", "warning");
      return;
    }
    const normalized = roundMoney(amount);
    onCashFundChange(normalized);
    setValue(amountInputValue(normalized));
    onMessage(`Fundo de troco definido em ${currency.format(normalized)}.`);
  }

  return (
    <section className="pool-settings-card overflow-hidden rounded-[24px] border border-[#dfd8d4] bg-[#302b29] text-white shadow-lg">
      <div className="grid lg:grid-cols-[1fr_.8fr]">
        <div className="p-5 sm:p-7">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#27865d] text-white">
              <WalletCards size={24} />
            </span>
            <div>
              <span className="text-xs font-extrabold uppercase tracking-[.12em] text-[#72d4a5]">
                Rotina do caixa
              </span>
              <h2 className="mt-1 text-xl font-black">Fundo fixo para troco</h2>
              <p className="mt-2 text-sm leading-6 text-white/65">
                Esse valor será sugerido na abertura e deixado na gaveta após
                a retirada automática do fechamento.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
            <span className="text-xs font-bold text-white/55">Valor atual</span>
            <strong className="mt-1 block text-3xl font-black text-[#72d4a5]">
              {currency.format(cashFund)}
            </strong>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="border-t border-white/10 bg-[#211e1d] p-5 sm:p-7 lg:border-l lg:border-t-0"
        >
          <label htmlFor="cash-fund-value" className="block">
            <span className="mb-2 block text-sm font-extrabold">
              Quanto deve ficar na gaveta?
            </span>
            <input
              id="cash-fund-value"
              required
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="h-12 w-full rounded-xl border border-white/15 bg-white px-4 font-black text-[#302b29] outline-none focus:border-[#72d4a5]"
              aria-describedby="cash-fund-description"
            />
          </label>
          <p
            id="cash-fund-description"
            className="mt-3 text-xs leading-5 text-white/55"
          >
            Se o valor contado for maior, a diferença será registrada como
            retirada do movimento do dia.
          </p>
          <button
            type="submit"
            className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#27865d] px-5 font-extrabold text-white"
          >
            <Check size={19} /> Salvar fundo de troco
          </button>
        </form>
      </div>
    </section>
  );
}
