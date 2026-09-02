/**
 * Produz um alerta curto e discreto para novos pedidos online.
 *
 * O navegador só permite áudio depois de uma interação do operador. Por isso
 * a criação/desbloqueio do AudioContext acontece no app e esta função recebe
 * o contexto já liberado. Se o equipamento não suportar Web Audio, o alerta
 * visual continua funcionando normalmente.
 */
export function playOnlineOrderAlert(context: AudioContext): boolean {
  if (context.state === "closed") return false;

  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, now);
  oscillator.frequency.setValueAtTime(660, now + 0.13);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.3);
  return true;
}

export function pendingOrderIds(
  orders: ReadonlyArray<{ id: string; status: string }>,
) {
  return new Set(
    orders
      .filter((order) => order.status === "pending")
      .map((order) => order.id),
  );
}

export function findNewPendingOrderCount(
  previous: ReadonlySet<string> | null,
  next: ReadonlySet<string>,
) {
  if (!previous) return 0;
  let count = 0;
  next.forEach((id) => {
    if (!previous.has(id)) count += 1;
  });
  return count;
}
