"use client";

import { Check, LogIn, ShieldCheck, UserRound } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { OPERATOR_PROFILES } from "./operators";
import type { OperatorId } from "./types";

type OperatorLoginProps = {
  onLogin: (operatorId: OperatorId) => void;
};

export function OperatorLogin({ onLogin }: OperatorLoginProps) {
  const [selectedOperator, setSelectedOperator] =
    useState<OperatorId>("elaine");
  const selected = OPERATOR_PROFILES.find(
    (operator) => operator.id === selectedOperator,
  )!;

  return (
    <main className="pool-login-enter relative min-h-screen overflow-hidden bg-[#211e1d] px-4 py-7 text-[#24201f] sm:px-8 sm:py-10">
      <div className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full border-[64px] border-[#d9202c]/15" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 size-[34rem] rounded-full bg-[#d9202c]/10 blur-3xl" />

      <section className="relative mx-auto grid min-h-[calc(100vh-3.5rem)] w-full max-w-[1120px] overflow-hidden rounded-[32px] bg-[#f7f5f2] shadow-[0_28px_90px_rgba(0,0,0,.38)] lg:grid-cols-[.82fr_1.18fr]">
        <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#d9202c] to-[#9d101a] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-24 top-28 size-64 rounded-full border-[42px] border-white/10" />
          <Image
            src="/pool-logo-banner.jpg"
            alt="Pool Petiscos & Lanches"
            width={260}
            height={44}
            unoptimized
            className="relative w-[260px] rounded-xl object-cover shadow-xl"
          />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-sm font-extrabold">
              <ShieldCheck size={18} />
              Venda identificada
            </span>
            <h1 className="mt-5 max-w-sm text-4xl font-black leading-[1.05] tracking-[-.045em]">
              Cada venda no perfil certo.
            </h1>
            <p className="mt-4 max-w-sm text-base leading-7 text-white/75">
              Assim Elaine e Pool conseguem acompanhar separadamente o que cada
              um vendeu no dia.
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-center p-5 sm:p-10 lg:p-14">
          <Image
            src="/pool-logo-banner.jpg"
            alt="Pool Petiscos & Lanches"
            width={230}
            height={38}
            unoptimized
            className="mb-8 w-[230px] rounded-xl object-cover shadow-md lg:hidden"
          />
          <span className="text-sm font-extrabold uppercase tracking-[.12em] text-[#d9202c]">
            Acesso ao caixa
          </span>
          <h2 className="mt-2 text-3xl font-black tracking-[-.04em] sm:text-4xl">
            Quem está no caixa?
          </h2>
          <p className="mt-3 max-w-xl text-base leading-7 text-[#6d6561]">
            Escolha o seu nome antes de começar. As próximas vendas serão
            registradas no seu perfil.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2" role="radiogroup" aria-label="Escolher operador">
            {OPERATOR_PROFILES.map((operator) => {
              const active = operator.id === selectedOperator;
              return (
                <button
                  key={operator.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelectedOperator(operator.id)}
                  className={`relative min-h-40 rounded-3xl border-2 p-5 text-left transition ${
                    active
                      ? "border-[#d9202c] bg-white shadow-[0_14px_34px_rgba(217,32,44,.13)]"
                      : "border-[#e2dad5] bg-[#fcfaf8] hover:border-[#c8bbb4] hover:bg-white"
                  }`}
                >
                  <span
                    className="grid size-14 place-items-center rounded-2xl text-2xl font-black"
                    style={{
                      backgroundColor: operator.softAccent,
                      color: operator.accent,
                    }}
                  >
                    {operator.initials}
                  </span>
                  <strong className="mt-4 block text-xl font-black">
                    {operator.name}
                  </strong>
                  <span className="mt-1 block text-sm font-semibold text-[#776f6b]">
                    {operator.id === "poolblay"
                      ? `${operator.role} • Pool`
                      : operator.role}
                  </span>
                  {active && (
                    <span className="absolute right-4 top-4 grid size-8 place-items-center rounded-full bg-[#d9202c] text-white">
                      <Check size={18} strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => onLogin(selectedOperator)}
            className="mt-6 flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#d9202c] px-6 text-base font-extrabold text-white shadow-[0_14px_30px_rgba(217,32,44,.25)] transition hover:bg-[#b41622]"
          >
            <LogIn size={21} />
            Entrar como {selected.familiarName}
          </button>

          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#e6dfdb] bg-white p-4 text-sm leading-6 text-[#6d6561]">
            <UserRound size={20} className="mt-0.5 shrink-0 text-[#d9202c]" />
            É possível trocar de operador pelo menu, sem misturar os totais de
            vendas.
          </div>
        </div>
      </section>
    </main>
  );
}
