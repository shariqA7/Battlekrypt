// How long a rejected organization must wait before resubmitting:
// 1st rejection -> 2 hours, 2nd -> 24 hours, 3rd and every one after -> 7 days.
const COOLDOWN_HOURS = [2, 24, 24 * 7];

export function cooldownMs(rejectionCount: number): number {
  const i = Math.min(Math.max(rejectionCount, 1), COOLDOWN_HOURS.length) - 1;
  return COOLDOWN_HOURS[i] * 60 * 60 * 1000;
}

export function formatWait(ms: number): string {
  const totalMin = Math.max(1, Math.ceil(ms / 60000));
  if (totalMin < 60) return `${totalMin} minute${totalMin === 1 ? "" : "s"}`;
  const hours = Math.ceil(totalMin / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.ceil(hours / 24);
  return `${days} days`;
}
