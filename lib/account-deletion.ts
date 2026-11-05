// Account deletion rules that need no database: the cooling-off period, the confirmation phrase,
// the reasons an account can't be deleted yet, and which files must be kept.
// The database and storage side is lib/services/account-deletion.ts.

export const COOLING_OFF_DAYS = 14;
export const CONFIRM_PHRASE = "DELETE MY ACCOUNT";
const DAY = 86_400_000;

export const deletionDueAt = (now: Date) => new Date(now.getTime() + COOLING_OFF_DAYS * DAY);

/** The person must type the phrase (any letter case, extra spaces ignored) before we schedule anything. */
export const confirmPhraseOk = (typed: unknown) =>
  typeof typed === "string" && typed.trim().replace(/\s+/g, " ").toUpperCase() === CONFIRM_PHRASE;

export type BlockerKind =
  | "staff" | "payment_dispute" | "refund_owed" | "payout_hold" | "organizer_events" | "club_roster"
  | "live_entries" | "open_invoices" | "challenge_posted" | "challenge_entry" | "prize_dispute" | "giveaway_prize" | "giveaway_hosted";

export type Blocker = { kind: BlockerKind; count: number; message: string };

/** One plain sentence per reason. `count` is how many things are in the way. */
export function blockerMessage(kind: BlockerKind, count: number): string {
  const s = count === 1 ? "" : "s";
  switch (kind) {
    case "staff": return "You are on the BattleKrypt staff. Ask a super admin to remove your staff access first.";
    case "payment_dispute": return `You have ${count} open payment dispute${s}. Resolve ${count === 1 ? "it" : "them"} first.`;
    case "refund_owed": return `A refund ordered in ${count} dispute${s} hasn't been settled yet.`;
    case "payout_hold": return `Your organization has ${count} payout hold${s} (an unpaid prize, refund or dispute). Clear ${count === 1 ? "it" : "them"} first.`;
    case "organizer_events": return `You have ${count} live event${s} as an organizer. Finish or cancel ${count === 1 ? "it" : "them"} first.`;
    case "club_roster": return `Your club still has ${count} player${s} on its roster. Remove them or disband the club first.`;
    case "live_entries": return `You are entered in ${count} live tournament${s}. Withdraw or wait for ${count === 1 ? "it" : "them"} to finish.`;
    case "open_invoices": return `You have ${count} unpaid invoice${s}, pending plan request${s} or donation${s} waiting for review. Settle or cancel ${count === 1 ? "it" : "them"} first.`;
    case "challenge_posted": return `You have ${count} challenge${s} still open or in progress. Finish or cancel ${count === 1 ? "it" : "them"} first.`;
    case "challenge_entry": return `You are in the middle of ${count} challenge${s}. Finish ${count === 1 ? "it" : "them"} first.`;
    case "giveaway_prize": return `You won ${count} giveaway prize${s} that ${count === 1 ? "isn't" : "aren't"} finished yet. Send your details or confirm you received ${count === 1 ? "it" : "them"} first.`;
    case "giveaway_hosted": return `Your organization has ${count} giveaway${s} still running or with a prize to deliver. Finish or cancel ${count === 1 ? "it" : "them"} first.`;
    case "prize_dispute": return `A prize payout you're part of is in dispute (${count}). Wait for the decision first.`;
  }
}

export const makeBlocker = (kind: BlockerKind, count: number): Blocker | null => (count > 0 ? { kind, count, message: blockerMessage(kind, count) } : null);

/** What a person sees for their request. */
export type DeletionState =
  | { state: "none" }
  | { state: "scheduled"; dueAt: Date; daysLeft: number }
  | { state: "erased" };

export function deletionState(u: { deletionRequestedAt: Date | null; deletionDueAt: Date | null; deletedAt: Date | null }, now: Date): DeletionState {
  if (u.deletedAt) return { state: "erased" };
  if (u.deletionRequestedAt && u.deletionDueAt) {
    return { state: "scheduled", dueAt: u.deletionDueAt, daysLeft: Math.max(0, Math.ceil((u.deletionDueAt.getTime() - now.getTime()) / DAY)) };
  }
  return { state: "none" };
}

/**
 * Files that must NOT be removed with the account, because the record they back is kept (an
 * invoice, an approved plan payment): financial records are kept for the legal retention period.
 * Everything else in the person's folder goes.
 */
export function splitFiles(all: string[], keep: Set<string>): { remove: string[]; kept: string[] } {
  const remove: string[] = [];
  const kept: string[] = [];
  for (const f of all) (keep.has(f) ? kept : remove).push(f);
  return { remove, kept };
}

/** Drop the files in `ownerFolder` from a list of stored paths (dispute evidence, challenge proofs). */
export const withoutOwnFiles = (paths: string[], ownerId: string) => paths.filter((p) => !p.startsWith(`${ownerId}/`));
