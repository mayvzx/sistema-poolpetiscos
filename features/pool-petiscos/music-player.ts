export function normalizePlaybackTime(seconds: number) {
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

export function clampPlaybackTime(seconds: number, duration: number) {
  const safeDuration = normalizePlaybackTime(duration);
  if (safeDuration === 0) return 0;
  return Math.min(normalizePlaybackTime(seconds), safeDuration);
}

export function playbackProgressPercent(currentTime: number, duration: number) {
  const safeDuration = normalizePlaybackTime(duration);
  if (safeDuration === 0) return 0;
  return Math.min(
    100,
    Math.max(0, (clampPlaybackTime(currentTime, safeDuration) / safeDuration) * 100),
  );
}

export function formatPlaybackTime(seconds: number) {
  const totalSeconds = Math.floor(normalizePlaybackTime(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  const minuteLabel = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const secondLabel = String(remainingSeconds).padStart(2, "0");

  return hours > 0
    ? `${hours}:${minuteLabel}:${secondLabel}`
    : `${minuteLabel}:${secondLabel}`;
}
