import {
  clampPlaybackTime,
  formatPlaybackTime,
  playbackProgressPercent,
} from "./music-player";

type MusicProgressProps = {
  currentTime: number;
  duration: number;
  hasTrack: boolean;
  onSeek: (seconds: number) => void;
};

export function MusicProgress({
  currentTime,
  duration,
  hasTrack,
  onSeek,
}: MusicProgressProps) {
  const safeCurrentTime = clampPlaybackTime(currentTime, duration);
  const ready = hasTrack && duration > 0;
  const progress = playbackProgressPercent(safeCurrentTime, duration);
  const currentLabel = formatPlaybackTime(safeCurrentTime);
  const durationLabel = formatPlaybackTime(duration);

  return (
    <div className="mt-5 rounded-2xl border border-white/8 bg-black/15 px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label
          htmlFor="pool-music-progress"
          className="text-[8px] font-extrabold uppercase tracking-[.12em] text-white/45"
        >
          Progresso da música
        </label>
        <output className="shrink-0 font-mono text-[9px] tabular-nums text-white/60">
          {currentLabel} / {durationLabel}
        </output>
      </div>
      <input
        id="pool-music-progress"
        type="range"
        min="0"
        max={ready ? duration : 1}
        step="0.1"
        value={ready ? safeCurrentTime : 0}
        disabled={!ready}
        onChange={(event) => onSeek(Number(event.target.value))}
        aria-label="Posição da música"
        aria-valuetext={`${currentLabel} de ${durationLabel}`}
        className="audio-range music-progress-range w-full"
        style={{
          background: ready
            ? `linear-gradient(to right, #d9202c 0%, #d9202c ${progress}%, rgba(255, 255, 255, 0.16) ${progress}%, rgba(255, 255, 255, 0.16) 100%)`
            : "rgba(255, 255, 255, 0.08)",
        }}
      />
      <p className="mt-2 text-[8px] leading-4 text-white/35">
        {hasTrack
          ? ready
            ? "Arraste para avançar ou voltar na faixa."
            : "Carregando a duração da faixa…"
          : "Selecione uma faixa para controlar a reprodução."}
      </p>
    </div>
  );
}
