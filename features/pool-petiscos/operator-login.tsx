"use client";

import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LogIn,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import { type FormEvent, useMemo, useState } from "react";
import {
  createOperatorCredential,
  sanitizePin,
  validateOperatorPin,
  verifyOperatorPin,
} from "./operator-security";
import { OPERATOR_PROFILES } from "./operators";
import { PinGuidance } from "./pin-guidance";
import type {
  OperatorCredential,
  OperatorCredentials,
  OperatorId,
} from "./types";

type OperatorLoginProps = {
  credentials: OperatorCredentials;
  onCredentialChange: (
    operatorId: OperatorId,
    credential: OperatorCredential,
  ) => void;
  onLogin: (operatorId: OperatorId) => void;
};

export function OperatorLogin({
  credentials,
  onCredentialChange,
  onLogin,
}: OperatorLoginProps) {
  const [selectedOperator, setSelectedOperator] =
    useState<OperatorId>("elaine");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = OPERATOR_PROFILES.find(
    (operator) => operator.id === selectedOperator,
  )!;
  const credential = credentials[selectedOperator];
  const isFirstAccess = !credential;
  const pinPolicyError = useMemo(
    () => (isFirstAccess && pin.length === 6 ? validateOperatorPin(pin) : null),
    [isFirstAccess, pin],
  );

  function selectOperator(operatorId: OperatorId) {
    setSelectedOperator(operatorId);
    setPin("");
    setConfirmPin("");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (credential) {
        const valid = await verifyOperatorPin(pin, credential);
        if (!valid) {
          setError("PIN incorreto. Confira os 6 números e tente novamente.");
          return;
        }
      } else {
        const validationError = validateOperatorPin(pin);
        if (validationError) {
          setError(validationError);
          return;
        }
        if (pin !== confirmPin) {
          setError("Os dois PINs estão diferentes.");
          return;
        }
        onCredentialChange(
          selectedOperator,
          await createOperatorCredential(pin),
        );
      }
      onLogin(selectedOperator);
    } catch {
      setError("Não foi possível proteger o acesso agora. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pool-login-enter pool-login-root relative min-h-screen overflow-hidden bg-[#211e1d] px-4 py-7 text-[#24201f] sm:px-8 sm:py-10">
      <div className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full border-[64px] border-[#d9202c]/15" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 size-[34rem] rounded-full bg-[#d9202c]/10 blur-3xl" />

      <section className="pool-login-surface relative mx-auto grid min-h-[calc(100vh-3.5rem)] w-full max-w-[1180px] overflow-hidden rounded-[32px] bg-[#f7f5f2] shadow-[0_28px_90px_rgba(0,0,0,.38)] lg:grid-cols-[.78fr_1.22fr]">
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
              Acesso protegido
            </span>
            <h1 className="mt-5 max-w-sm text-4xl font-black leading-[1.05] tracking-[-.045em]">
              Cada venda no perfil certo.
            </h1>
            <p className="mt-4 max-w-sm text-base leading-7 text-white/75">
              Elaine e Pool entram com seus próprios PINs para acompanhar
              separadamente o que cada um vendeu.
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-center p-5 sm:p-9 lg:p-12">
          <Image
            src="/pool-logo-banner.jpg"
            alt="Pool Petiscos & Lanches"
            width={230}
            height={38}
            unoptimized
            className="mb-7 w-[230px] rounded-xl object-cover shadow-md lg:hidden"
          />
          <span className="text-sm font-extrabold uppercase tracking-[.12em] text-[#d9202c]">
            Acesso ao caixa
          </span>
          <h2 className="mt-2 text-3xl font-black tracking-[-.04em] sm:text-4xl">
            Quem está no caixa?
          </h2>
          <p className="mt-3 max-w-xl text-base leading-7 text-[#6d6561]">
            Escolha seu nome e informe o PIN. As próximas vendas ficarão no seu
            perfil.
          </p>

          <div
            className="mt-6 grid gap-3 sm:grid-cols-2"
            role="radiogroup"
            aria-label="Escolher operador"
          >
            {OPERATOR_PROFILES.map((operator) => {
              const active = operator.id === selectedOperator;
              return (
                <button
                  key={operator.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => selectOperator(operator.id)}
                  className={`relative min-h-32 rounded-2xl border-2 p-4 text-left transition ${
                    active
                      ? "border-[#d9202c] bg-white shadow-[0_14px_34px_rgba(217,32,44,.13)]"
                      : "border-[#e2dad5] bg-[#fcfaf8] hover:border-[#c8bbb4] hover:bg-white"
                  }`}
                >
                  <span
                    className="grid size-12 place-items-center rounded-xl text-xl font-black"
                    style={{
                      backgroundColor: operator.softAccent,
                      color: operator.accent,
                    }}
                  >
                    {operator.initials}
                  </span>
                  <strong className="mt-3 block text-lg font-black">
                    {operator.name}
                  </strong>
                  <span className="mt-0.5 block text-sm font-semibold text-[#776f6b]">
                    {operator.id === "poolblay"
                      ? `${operator.role} • Pool`
                      : operator.role}
                  </span>
                  {active && (
                    <span className="absolute right-3 top-3 grid size-7 place-items-center rounded-full bg-[#d9202c] text-white">
                      <Check size={16} strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="operator-pin"
                  className="text-sm font-extrabold text-[#5f5753]"
                >
                  {isFirstAccess ? "Crie seu PIN de 6 números" : "Seu PIN"}
                </label>
                <button
                  type="button"
                  onClick={() => setShowPin((current) => !current)}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-bold text-[#6d6561]"
                >
                  {showPin ? <EyeOff size={17} /> : <Eye size={17} />}
                  {showPin ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              <div className="relative mt-2">
                <KeyRound
                  size={21}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[#d9202c]"
                />
                <input
                  id="operator-pin"
                  required
                  autoFocus
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  autoComplete={isFirstAccess ? "new-password" : "current-password"}
                  value={pin}
                  onChange={(event) => setPin(sanitizePin(event.target.value))}
                  placeholder="••••••"
                  className="h-14 w-full rounded-2xl border border-[#ded7d2] bg-white pl-12 pr-4 text-center text-2xl font-black tracking-[.45em] outline-none transition focus:border-[#d9202c] focus:ring-4 focus:ring-[#d9202c]/10"
                />
              </div>
            </div>

            {isFirstAccess && (
              <div>
                <label
                  htmlFor="operator-pin-confirm"
                  className="text-sm font-extrabold text-[#5f5753]"
                >
                  Repita o novo PIN
                </label>
                <input
                  id="operator-pin-confirm"
                  required
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  autoComplete="new-password"
                  value={confirmPin}
                  onChange={(event) =>
                    setConfirmPin(sanitizePin(event.target.value))
                  }
                  placeholder="••••••"
                  className="mt-2 h-14 w-full rounded-2xl border border-[#ded7d2] bg-white px-4 text-center text-2xl font-black tracking-[.45em] outline-none transition focus:border-[#d9202c] focus:ring-4 focus:ring-[#d9202c]/10"
                />
              </div>
            )}

            {(error || pinPolicyError) && (
              <p
                role="alert"
                className="rounded-xl bg-[#fff0f1] px-4 py-3 text-sm font-bold text-[#b41622]"
              >
                {error || pinPolicyError}
              </p>
            )}

            {isFirstAccess && <PinGuidance compact />}

            <button
              type="submit"
              disabled={busy}
              className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#d9202c] px-6 text-base font-extrabold text-white shadow-[0_14px_30px_rgba(217,32,44,.25)] transition hover:bg-[#b41622] disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? (
                <LoaderCircle size={21} className="animate-spin" />
              ) : (
                <LogIn size={21} />
              )}
              {isFirstAccess
                ? `Criar PIN e entrar como ${selected.familiarName}`
                : `Entrar como ${selected.familiarName}`}
            </button>
          </form>

          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#e6dfdb] bg-white p-4 text-sm leading-6 text-[#6d6561]">
            <UserRound size={20} className="mt-0.5 shrink-0 text-[#d9202c]" />
            Você poderá alterar seu PIN em Configurações depois de entrar.
          </div>
        </div>
      </section>
    </main>
  );
}
