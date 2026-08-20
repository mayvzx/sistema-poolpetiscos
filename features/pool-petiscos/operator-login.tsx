"use client";

import {
  Check,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LogIn,
  ShieldCheck,
  RotateCcw,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import { type FormEvent, useMemo, useState } from "react";
import {
  createOperatorCredential,
  createPinRecoveryCredential,
  normalizeRecoveryKey,
  sanitizePin,
  validateOperatorPin,
  verifyOperatorPin,
  verifyPinRecoveryKey,
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
  recoveryCredential?: OperatorCredential;
  onCredentialChange: (
    operatorId: OperatorId,
    credential: OperatorCredential,
  ) => void;
  onRecoveryCredentialChange: (credential: OperatorCredential) => void;
  onLogin: (operatorId: OperatorId) => void;
};

export function OperatorLogin({
  credentials,
  recoveryCredential,
  onCredentialChange,
  onRecoveryCredentialChange,
  onLogin,
}: OperatorLoginProps) {
  const [selectedOperator, setSelectedOperator] =
    useState<OperatorId>("elaine");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState("");
  const [pendingLogin, setPendingLogin] = useState<OperatorId | null>(null);
  const [recoveryAcknowledged, setRecoveryAcknowledged] = useState(false);
  const [failedRecoveryAttempts, setFailedRecoveryAttempts] = useState(0);
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
    setRecoveryMode(false);
    setRecoveryKey("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (credential && recoveryMode) {
        if (!recoveryCredential) {
          setError(
            "A chave de recuperação ainda não foi criada. Entre com o outro perfil ou procure o suporte.",
          );
          return;
        }
        if (failedRecoveryAttempts >= 5) {
          setError("Muitas tentativas incorretas. Reabra o sistema para tentar novamente.");
          return;
        }
        const validRecovery = await verifyPinRecoveryKey(
          recoveryKey,
          recoveryCredential,
        );
        if (!validRecovery) {
          setFailedRecoveryAttempts((attempts) => attempts + 1);
          setError("Chave de recuperação incorreta.");
          return;
        }
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
      } else if (credential) {
        const valid = await verifyOperatorPin(pin, credential);
        if (!valid) {
          setError("PIN incorreto. Confira os 6 números e tente novamente.");
          return;
        }
        if (!recoveryCredential) {
          const recovery = await createPinRecoveryCredential();
          onRecoveryCredentialChange(recovery.credential);
          setGeneratedRecoveryKey(recovery.key);
          setPendingLogin(selectedOperator);
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
        if (!recoveryCredential) {
          const recovery = await createPinRecoveryCredential();
          onRecoveryCredentialChange(recovery.credential);
          setGeneratedRecoveryKey(recovery.key);
          setPendingLogin(selectedOperator);
          return;
        }
      }
      onLogin(selectedOperator);
    } catch {
      setError("Não foi possível proteger o acesso agora. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  function downloadRecoveryKey() {
    if (!generatedRecoveryKey) return;
    const content = [
      "POOL PETISCOS - CHAVE DE RECUPERAÇÃO DO PIN",
      "",
      generatedRecoveryKey,
      "",
      "Guarde este arquivo em local seguro e fora do computador do caixa.",
      "Esta chave redefine o PIN de Elaine ou Pool. Não compartilhe.",
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "Pool-Petiscos-Chave-de-Recuperacao.txt";
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function finishRecoverySetup() {
    if (!pendingLogin || !recoveryAcknowledged) return;
    onLogin(pendingLogin);
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
            {credential && recoveryMode && (
              <div>
                <label
                  htmlFor="operator-recovery-key"
                  className="text-sm font-extrabold text-[#5f5753]"
                >
                  Chave de recuperação
                </label>
                <input
                  id="operator-recovery-key"
                  required
                  autoFocus
                  type="text"
                  autoComplete="off"
                  value={recoveryKey}
                  onChange={(event) =>
                    setRecoveryKey(normalizeRecoveryKey(event.target.value))
                  }
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  className="mt-2 h-14 w-full rounded-2xl border border-[#ded7d2] bg-white px-4 text-center text-base font-black uppercase tracking-[.12em] outline-none transition focus:border-[#d9202c] focus:ring-4 focus:ring-[#d9202c]/10"
                />
              </div>
            )}
            <div>
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="operator-pin"
                  className="text-sm font-extrabold text-[#5f5753]"
                >
                  {isFirstAccess || recoveryMode
                    ? "Crie seu novo PIN de 6 números"
                    : "Seu PIN"}
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
                  autoComplete={
                    isFirstAccess || recoveryMode
                      ? "new-password"
                      : "current-password"
                  }
                  value={pin}
                  onChange={(event) => setPin(sanitizePin(event.target.value))}
                  placeholder="••••••"
                  className="h-14 w-full rounded-2xl border border-[#ded7d2] bg-white pl-12 pr-4 text-center text-2xl font-black tracking-[.45em] outline-none transition focus:border-[#d9202c] focus:ring-4 focus:ring-[#d9202c]/10"
                />
              </div>
            </div>

            {(isFirstAccess || recoveryMode) && (
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

            {(isFirstAccess || recoveryMode) && <PinGuidance compact />}

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
                : recoveryMode
                  ? `Redefinir PIN de ${selected.familiarName}`
                : `Entrar como ${selected.familiarName}`}
            </button>
            {credential && (
              <button
                type="button"
                onClick={() => {
                  setRecoveryMode((current) => !current);
                  setPin("");
                  setConfirmPin("");
                  setRecoveryKey("");
                  setError("");
                }}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#ded7d2] px-4 text-sm font-extrabold text-[#5f5753]"
              >
                <RotateCcw size={18} />
                {recoveryMode ? "Voltar ao acesso normal" : "Esqueci meu PIN"}
              </button>
            )}
          </form>

          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#e6dfdb] bg-white p-4 text-sm leading-6 text-[#6d6561]">
            <UserRound size={20} className="mt-0.5 shrink-0 text-[#d9202c]" />
            Você poderá alterar seu PIN em Configurações depois de entrar.
          </div>
        </div>
      </section>
      {generatedRecoveryKey && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="recovery-key-title"
            className="w-full max-w-xl rounded-[28px] bg-white p-6 shadow-2xl sm:p-8"
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-[#fff0f1] text-[#d9202c]">
              <ShieldCheck size={24} />
            </span>
            <h2 id="recovery-key-title" className="mt-5 text-2xl font-black">
              Salve a chave de recuperação
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#6d6561]">
              Ela será necessária se Elaine ou Pool esquecerem o PIN. Por
              segurança, esta é a única vez que a chave atual aparece.
            </p>
            <code className="mt-5 block rounded-2xl bg-[#211e1d] px-4 py-5 text-center text-lg font-black tracking-[.12em] text-white sm:text-2xl">
              {generatedRecoveryKey}
            </code>
            <button
              type="button"
              onClick={downloadRecoveryKey}
              className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#ded7d2] font-extrabold"
            >
              <Download size={19} /> Baixar chave em arquivo
            </button>
            <label className="mt-4 flex items-start gap-3 rounded-xl bg-[#faf8f6] p-4 text-sm font-semibold leading-6 text-[#5f5753]">
              <input
                type="checkbox"
                checked={recoveryAcknowledged}
                onChange={(event) =>
                  setRecoveryAcknowledged(event.target.checked)
                }
                className="mt-1 size-4 accent-[#d9202c]"
              />
              Guardei a chave fora deste computador e entendo que ela não pode
              ser exibida novamente.
            </label>
            <button
              type="button"
              disabled={!recoveryAcknowledged}
              onClick={finishRecoverySetup}
              className="mt-4 min-h-12 w-full rounded-xl bg-[#d9202c] px-5 font-extrabold text-white disabled:opacity-45"
            >
              Continuar para o caixa
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
