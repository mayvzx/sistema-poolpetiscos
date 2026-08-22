"use client";

import {
  Check,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Minus,
  Monitor,
  Moon,
  RotateCcw,
  ShieldCheck,
  Sun,
  Type,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { BackupSettings } from "./backup-settings";
import { downloadRecoveryKeyFile } from "./browser-download";
import { CashFundSettings } from "./cash-fund-settings";
import {
  FONT_SCALE_STEP,
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
  type DisplayPreferences,
  type ResolvedTheme,
  type ThemeMode,
} from "./display-preferences";
import {
  createOperatorCredential,
  createPinRecoveryCredential,
  sanitizePin,
  validateOperatorPin,
  verifyOperatorPin,
} from "./operator-security";
import { getOperatorProfile } from "./operators";
import { PinGuidance } from "./pin-guidance";
import type {
  OperatorCredential,
  OperatorCredentials,
  OperatorId,
} from "./types";

type SettingsPanelProps = {
  activeOperatorId: OperatorId;
  credentials: OperatorCredentials;
  recoveryCredential?: OperatorCredential;
  displayPreferences: DisplayPreferences;
  resolvedTheme: ResolvedTheme;
  cashFund: number;
  onCredentialChange: (
    operatorId: OperatorId,
    credential: OperatorCredential,
  ) => void;
  onRecoveryCredentialChange: (credential: OperatorCredential) => void;
  onDisplayPreferencesChange: (preferences: DisplayPreferences) => void;
  onCashFundChange: (cashFund: number) => void;
  onMessage: (
    message: string,
    tone?: "success" | "warning" | "info",
  ) => void;
};

const THEME_OPTIONS: Array<{
  id: ThemeMode;
  label: string;
  description: string;
  icon: typeof Monitor;
}> = [
  {
    id: "system",
    label: "Automático",
    description: "Acompanha o tema claro ou escuro do Windows.",
    icon: Monitor,
  },
  {
    id: "light",
    label: "Claro",
    description: "Mantém a interface clara o tempo todo.",
    icon: Sun,
  },
  {
    id: "dark",
    label: "Escuro",
    description: "Reduz o brilho da interface em ambientes escuros.",
    icon: Moon,
  },
];

export function SettingsPanel({
  activeOperatorId,
  credentials,
  recoveryCredential,
  displayPreferences,
  resolvedTheme,
  cashFund,
  onCredentialChange,
  onRecoveryCredentialChange,
  onDisplayPreferencesChange,
  onCashFundChange,
  onMessage,
}: SettingsPanelProps) {
  const operator = getOperatorProfile(activeOperatorId);
  const credential = credentials[activeOperatorId];
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPins, setShowPins] = useState(false);
  const [savingPin, setSavingPin] = useState(false);
  const [recoveryCurrentPin, setRecoveryCurrentPin] = useState("");
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState("");
  const [savingRecoveryKey, setSavingRecoveryKey] = useState(false);
  const pinError = useMemo(
    () => (newPin.length === 6 ? validateOperatorPin(newPin) : null),
    [newPin],
  );

  function updateFontScale(nextScale: number) {
    const fontScale = Math.min(
      MAX_FONT_SCALE,
      Math.max(MIN_FONT_SCALE, nextScale),
    );
    onDisplayPreferencesChange({ ...displayPreferences, fontScale });
  }

  async function submitPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (credential && !(await verifyOperatorPin(currentPin, credential))) {
      onMessage("O PIN atual não confere.", "warning");
      return;
    }
    const validationError = validateOperatorPin(newPin);
    if (validationError) {
      onMessage(validationError, "warning");
      return;
    }
    if (newPin !== confirmPin) {
      onMessage("A confirmação do novo PIN está diferente.", "warning");
      return;
    }
    setSavingPin(true);
    try {
      const nextCredential = await createOperatorCredential(newPin);
      onCredentialChange(activeOperatorId, nextCredential);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      onMessage(`PIN de ${operator.familiarName} alterado com segurança.`);
    } catch {
      onMessage("Não foi possível alterar o PIN agora.", "warning");
    } finally {
      setSavingPin(false);
    }
  }

  async function regenerateRecoveryKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!credential || !(await verifyOperatorPin(recoveryCurrentPin, credential))) {
      onMessage("Confirme o PIN atual para gerar uma nova chave.", "warning");
      return;
    }
    setSavingRecoveryKey(true);
    try {
      const recovery = await createPinRecoveryCredential();
      onRecoveryCredentialChange(recovery.credential);
      setGeneratedRecoveryKey(recovery.key);
      setRecoveryCurrentPin("");
      onMessage(
        recoveryCredential
          ? "Nova chave criada. A chave anterior deixou de funcionar."
          : "Chave de recuperação criada com segurança.",
      );
    } catch {
      onMessage("Não foi possível criar a chave de recuperação.", "warning");
    } finally {
      setSavingRecoveryKey(false);
    }
  }

  function downloadRecoveryKey() {
    if (!generatedRecoveryKey) return;
    downloadRecoveryKeyFile(generatedRecoveryKey);
  }

  return (
    <div className="pool-view-enter mx-auto w-full max-w-[1180px] space-y-5 p-4 sm:p-6 lg:p-9">
      <section className="pool-settings-hero overflow-hidden rounded-[26px] bg-gradient-to-br from-[#302b29] to-[#171514] p-6 text-white shadow-xl sm:p-8">
        <span className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-[.12em] text-white/65">
          <ShieldCheck size={19} />
          Preferências do caixa
        </span>
        <h1 className="mt-2 text-3xl font-black tracking-[-.04em] sm:text-4xl">
          Configurações
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-white/70">
          Ajuste a leitura da tela e proteja o perfil de {operator.familiarName}{" "}
          sem interromper o atendimento.
        </p>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="pool-settings-card rounded-[24px] border border-[#ebe5e1] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#fff0f1] text-[#d9202c]">
              <Type size={24} />
            </span>
            <div>
              <h2 className="text-xl font-black">Tamanho das letras</h2>
              <p className="mt-1 text-sm leading-6 text-[#6d6561]">
                A mudança aparece na mesma hora em todas as telas deste
                computador.
              </p>
            </div>
          </div>

          <div className="pool-soft-panel mt-6 rounded-2xl border border-[#e6dfdb] bg-[#faf8f6] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-extrabold text-[#5f5753]">
                Tamanho atual
              </span>
              <strong className="text-3xl font-black text-[#d9202c]">
                {displayPreferences.fontScale}%
              </strong>
            </div>
            <input
              type="range"
              min={MIN_FONT_SCALE}
              max={MAX_FONT_SCALE}
              step={FONT_SCALE_STEP}
              value={displayPreferences.fontScale}
              onChange={(event) => updateFontScale(Number(event.target.value))}
              aria-label="Tamanho das letras"
              className="pool-font-range mt-5 w-full accent-[#d9202c]"
            />
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() =>
                  updateFontScale(
                    displayPreferences.fontScale - FONT_SCALE_STEP,
                  )
                }
                disabled={displayPreferences.fontScale === MIN_FONT_SCALE}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#ded7d2] bg-white font-black disabled:opacity-40"
              >
                <Minus size={18} /> A
              </button>
              <button
                type="button"
                onClick={() => updateFontScale(100)}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#ded7d2] bg-white text-sm font-extrabold"
              >
                <RotateCcw size={17} /> 100%
              </button>
              <button
                type="button"
                onClick={() =>
                  updateFontScale(
                    displayPreferences.fontScale + FONT_SCALE_STEP,
                  )
                }
                disabled={displayPreferences.fontScale === MAX_FONT_SCALE}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#d9202c] font-black text-white disabled:opacity-40"
              >
                A+ 
              </button>
            </div>
          </div>

          <div className="pool-preview mt-5 rounded-2xl border border-dashed border-[#d9d2ce] p-5">
            <span className="text-sm font-bold text-[#776f6b]">
              Exemplo de leitura
            </span>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div>
                <strong className="block text-lg font-black">Troco</strong>
                <span className="text-sm text-[#6d6561]">Valor para o cliente</span>
              </div>
              <strong className="text-3xl font-black text-[#27865d]">
                R$ 12,50
              </strong>
            </div>
          </div>
        </section>

        <section className="pool-settings-card rounded-[24px] border border-[#ebe5e1] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#f1eeeb] text-[#302b29]">
              {resolvedTheme === "dark" ? <Moon size={24} /> : <Sun size={24} />}
            </span>
            <div>
              <h2 className="text-xl font-black">Aparência</h2>
              <p className="mt-1 text-sm leading-6 text-[#6d6561]">
                No modo automático, o sistema acompanha o tema do Windows.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            {THEME_OPTIONS.map((option) => {
              const active = displayPreferences.themeMode === option.id;
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() =>
                    onDisplayPreferencesChange({
                      ...displayPreferences,
                      themeMode: option.id,
                    })
                  }
                  aria-pressed={active}
                  className={`flex min-h-20 items-center gap-4 rounded-2xl border-2 p-4 text-left ${
                    active
                      ? "border-[#d9202c] bg-[#fff7f7]"
                      : "border-[#e6dfdb] bg-[#faf8f6]"
                  }`}
                >
                  <span
                    className={`grid size-11 shrink-0 place-items-center rounded-xl ${
                      active
                        ? "bg-[#d9202c] text-white"
                        : "bg-white text-[#5f5753]"
                    }`}
                  >
                    <Icon size={21} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-base font-black">
                      {option.label}
                    </strong>
                    <span className="mt-0.5 block text-sm leading-5 text-[#6d6561]">
                      {option.description}
                    </span>
                  </span>
                  {active && (
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#d9202c] text-white">
                      <Check size={16} strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <p className="mt-4 rounded-xl bg-[#f7f5f2] px-4 py-3 text-sm font-semibold text-[#6d6561]">
            Tema em uso agora: {resolvedTheme === "dark" ? "escuro" : "claro"}.
          </p>
        </section>
      </div>

      <CashFundSettings
        key={cashFund}
        cashFund={cashFund}
        onCashFundChange={onCashFundChange}
        onMessage={onMessage}
      />

      <section className="pool-settings-card rounded-[24px] border border-[#ebe5e1] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#fff0f1] text-[#d9202c]">
            <KeyRound size={24} />
          </span>
          <div>
            <h2 className="text-xl font-black">PIN de {operator.familiarName}</h2>
            <p className="mt-1 text-sm leading-6 text-[#6d6561]">
              Apenas o PIN deste perfil será alterado. O PIN não fica gravado
              de forma legível.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_.9fr]">
          <form onSubmit={submitPin} className="space-y-4">
            {credential && (
              <PinField
                label="PIN atual"
                value={currentPin}
                onChange={setCurrentPin}
                visible={showPins}
                autoComplete="current-password"
              />
            )}
            <PinField
              label="Novo PIN"
              value={newPin}
              onChange={setNewPin}
              visible={showPins}
              autoComplete="new-password"
            />
            <PinField
              label="Repita o novo PIN"
              value={confirmPin}
              onChange={setConfirmPin}
              visible={showPins}
              autoComplete="new-password"
            />
            {pinError && (
              <p role="alert" className="text-sm font-bold text-[#b41622]">
                {pinError}
              </p>
            )}
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setShowPins((current) => !current)}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#ded7d2] px-4 font-extrabold"
              >
                {showPins ? <EyeOff size={19} /> : <Eye size={19} />}
                {showPins ? "Ocultar números" : "Mostrar números"}
              </button>
              <button
                type="submit"
                disabled={savingPin}
                className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#d9202c] px-5 font-extrabold text-white disabled:opacity-55"
              >
                <KeyRound size={19} />
                {savingPin ? "Protegendo PIN..." : "Salvar novo PIN"}
              </button>
            </div>
          </form>
          <PinGuidance />
        </div>
      </section>

      <section className="pool-settings-card rounded-[24px] border border-[#ebe5e1] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#f1eefc] text-[#7458b4]">
            <ShieldCheck size={24} />
          </span>
          <div>
            <h2 className="text-xl font-black">Chave de recuperação</h2>
            <p className="mt-1 text-sm leading-6 text-[#6d6561]">
              Redefine o PIN de qualquer perfil em caso de esquecimento. O
              sistema guarda somente o verificador protegido da chave.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_.9fr]">
          <form onSubmit={regenerateRecoveryKey} className="space-y-4">
            <PinField
              label={`PIN atual de ${operator.familiarName}`}
              value={recoveryCurrentPin}
              onChange={setRecoveryCurrentPin}
              visible={showPins}
              autoComplete="current-password"
            />
            <button
              type="submit"
              disabled={savingRecoveryKey}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#302b29] px-5 font-extrabold text-white disabled:opacity-55"
            >
              <ShieldCheck size={19} />
              {savingRecoveryKey
                ? "Gerando chave..."
                : recoveryCredential
                  ? "Gerar nova chave"
                  : "Criar chave de recuperação"}
            </button>
          </form>
          <div className="pool-soft-panel rounded-2xl border border-[#e6dfdb] bg-[#faf8f6] p-5">
            {generatedRecoveryKey ? (
              <>
                <p className="text-sm font-black text-[#302b29]">
                  Guarde agora. A chave não será exibida novamente.
                </p>
                <code className="mt-4 block rounded-xl bg-[#211e1d] px-3 py-4 text-center text-base font-black tracking-[.08em] text-white sm:text-lg">
                  {generatedRecoveryKey}
                </code>
                <button
                  type="button"
                  onClick={downloadRecoveryKey}
                  className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#d9cfca] bg-white font-extrabold"
                >
                  <Download size={18} /> Baixar chave
                </button>
              </>
            ) : (
              <p className="text-sm font-semibold leading-6 text-[#6d6561]">
                {recoveryCredential
                  ? "Existe uma chave ativa. Gere outra apenas se a atual foi perdida; isso invalidará a anterior."
                  : "Ainda não existe uma chave de recuperação neste caixa."}
              </p>
            )}
          </div>
        </div>
      </section>

      <BackupSettings onMessage={onMessage} />
    </div>
  );
}

function PinField({
  label,
  value,
  onChange,
  visible,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  autoComplete: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-extrabold text-[#5f5753]">
        {label}
      </span>
      <input
        required
        type={visible ? "text" : "password"}
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={6}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(sanitizePin(event.target.value))}
        placeholder="••••••"
        className="h-14 w-full rounded-xl border border-[#ded7d2] bg-white px-4 text-center text-2xl font-black tracking-[.45em] outline-none transition focus:border-[#d9202c] focus:ring-4 focus:ring-[#d9202c]/10"
      />
    </label>
  );
}
