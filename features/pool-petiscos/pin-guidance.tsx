import { CheckCircle2, ShieldCheck } from "lucide-react";

export function PinGuidance({ compact = false }: { compact?: boolean }) {
  return (
    <div className="pool-soft-panel rounded-2xl border border-[#e6dfdb] bg-[#faf8f6] p-4">
      <div className="flex items-center gap-2 text-sm font-black text-[#302b29]">
        <ShieldCheck size={20} className="text-[#d9202c]" />
        Crie um PIN seguro e fácil de lembrar
      </div>
      <ul
        className={`mt-3 grid gap-2 text-sm leading-6 text-[#6d6561] ${
          compact ? "" : "sm:grid-cols-2"
        }`}
      >
        {[
          "Use 6 números que não formem datas nem repitam o telefone.",
          "Evite sequências e repetições, como 123456 ou 121212.",
          "Elaine e Pool devem usar PINs diferentes.",
          "Não compartilhe o PIN nem o deixe anotado perto do caixa.",
        ].map((tip) => (
          <li key={tip} className="flex items-start gap-2">
            <CheckCircle2
              size={17}
              className="mt-1 shrink-0 text-[#27865d]"
            />
            {tip}
          </li>
        ))}
      </ul>
    </div>
  );
}
