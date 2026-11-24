// What one entry actually paid. A booking with a discount paid less than the list price for each of its
// sessions, so a refund (or a dispute) for that session is for THAT amount. No discount: the entry fee.
type Money = { toString(): string } | number | null | undefined;

export function entryAmount(reg: { paidAmount?: Money }, tournament: { entryFeeAmount?: Money }): number | null {
  const v = reg.paidAmount ?? tournament.entryFeeAmount;
  return v === null || v === undefined ? null : Number(v.toString());
}
