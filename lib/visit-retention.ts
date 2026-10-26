// How long a visit record keeps its identifying detail (IP address, city,
// browser string, account link). After this, only anonymous figures remain.
// Keep it longer than the longest look-back that needs the detail:
// challenge-integrity checks (SESSION_LOOKBACK_DAYS = 60) and the admin
// traffic page (up to 90 days). The privacy policy states this number.
export const VISIT_DETAIL_RETENTION_DAYS = 90;

export function visitDetailCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - VISIT_DETAIL_RETENTION_DAYS * 86_400_000);
}
