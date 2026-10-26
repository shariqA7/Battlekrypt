// Tournament lock + admin change requests.
//
// LOCK: a tournament, scrim or league is "staked" when it has a paid entry or
// a prize pool. Once a staked event has an active (pending/approved)
// registration, the organizer can't change the prize pool, cancel it, or
// change its entry conditions or rules themselves. They file a request; an
// admin approves (the change is applied and registered players are told) or
// denies it. Free events with no prize are never locked.
import { prisma } from "@/lib/prisma";
import { parsePrizeTiers, replacePrizeTiers, type PrizeTierInput } from "@/lib/services/prize-tiers";
import { replacePrizeAwards } from "@/lib/services/prize-awards";
import { parsePrizeAwards, checkPrizeBreakdown, tiersTotal, awardsCash, type AwardInput } from "@/lib/prize-awards";
import { getTrustConfig } from "@/lib/services/organizer-trust";
import { asFields, parseConditionLines, type RegistrationField } from "@/lib/entry-conditions";
import { notify, notifyMany } from "@/lib/services/notifications";
import { getFeatureFlags } from "@/lib/services/feature-flags";

const DAY_MS = 86_400_000;

export type ChangeKindT = "prize_pool" | "cancel" | "conditions" | "other";
export const KIND_LABEL: Record<ChangeKindT, string> = {
  prize_pool: "Change the prize pool, places or awards",
  cancel: "Cancel the event",
  conditions: "Change the entry conditions",
  other: "Something else",
};

export const LOCK_NOTICE =
  "Players have already registered for this paid or prized event, so this can't be changed directly. Ask an admin from the tournament page.";

export async function getLockState(tournamentId: string) {
  const [t, flags] = await Promise.all([
    prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { entryType: true, prizePoolAmount: true, lockEnforced: true },
    }),
    getFeatureFlags(),
  ]);
  if (!t) return null;
  const activeCount = await prisma.registration.count({ where: { tournamentId, status: { in: ["pending", "approved"] } } });
  const staked = t.entryType === "paid" || (t.prizePoolAmount != null && Number(t.prizePoolAmount.toString()) > 0);
  // The switch decides whether NEW events lock; an event that was already
  // locked stays locked even if the switch is later turned off.
  const locked = staked && activeCount > 0 && (flags.tournamentLock || t.lockEnforced);
  if (locked && !t.lockEnforced) {
    await prisma.tournament.update({ where: { id: tournamentId }, data: { lockEnforced: true } }).catch(() => {});
  }
  return { staked, activeCount, locked };
}

async function registeredUserIds(tournamentId: string): Promise<string[]> {
  const regs = await prisma.registration.findMany({
    where: { tournamentId, status: { in: ["pending", "approved"] } },
    select: {
      player: { select: { userId: true } },
      teamEntry: { select: { members: { select: { player: { select: { userId: true } } } } } },
    },
  });
  return Array.from(
    new Set(regs.flatMap((r) => [...(r.player ? [r.player.userId] : []), ...(r.teamEntry?.members.map((m) => m.player.userId) ?? [])]))
  );
}

// ---------- organizer side ----------

export async function createChangeRequest(input: {
  organizerId: string;
  userId: string;
  tournamentId: string;
  kind: ChangeKindT;
  details: string;
  prizeStructure?: { amount: unknown; tiers: unknown; awards: unknown };
  conditionsText?: string;
}) {
  const details = input.details.trim();
  if (details.length < 10 || details.length > 1500) {
    return { error: "validation_error" as const, message: "Explain why in 10–1500 characters." };
  }
  const t = await prisma.tournament.findUnique({ where: { id: input.tournamentId } });
  if (!t) return { error: "not_found" as const };
  if (t.organizerId !== input.organizerId) return { error: "forbidden" as const };
  if (t.status === "completed" || t.status === "cancelled") {
    return { error: "validation_error" as const, message: "This event is already finished or cancelled." };
  }
  const lock = (await getLockState(t.id))!;

  let payload: Record<string, unknown> | undefined;
  if (input.kind === "prize_pool") {
    // The organizer sends the WHOLE new prize structure (pool, places, awards);
    // an admin approving it replaces the old one.
    if (!lock.locked) {
      return { error: "validation_error" as const, message: "The prize pool isn't locked for this event, so you can change it directly by editing the tournament." };
    }
    const ps = input.prizeStructure;
    const amount = Number(ps?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { error: "validation_error" as const, message: "Enter the new prize pool." };
    const tiers = parsePrizeTiers(ps?.tiers);
    if (!tiers.ok) return { error: "validation_error" as const, message: tiers.message };
    const awards = parsePrizeAwards(ps?.awards);
    if (!awards.ok) return { error: "validation_error" as const, message: awards.message };
    const flags = await getFeatureFlags();
    const breakdown = flags.prizeBreakdown
      ? checkPrizeBreakdown({ pool: amount, tiers: tiers.tiers, awards: awards.awards })
      : tiersTotal(tiers.tiers) + awardsCash(awards.awards) > amount + 0.005
        ? "Places and cash awards add up to more than the prize pool."
        : null;
    if (breakdown) return { error: "validation_error" as const, message: breakdown };
    payload = { amount, tiers: tiers.tiers, awards: awards.awards };
  } else if (input.kind === "conditions") {
    const hasConditions = asFields(t.customFields).some((f) => f.type === "condition");
    if (!(await getFeatureFlags()).entryConditions && !hasConditions) {
      return { error: "validation_error" as const, message: "Entry conditions are switched off on this site." };
    }
    const parsed = parseConditionLines(input.conditionsText ?? "");
    if (!parsed.ok) return { error: "validation_error" as const, message: parsed.message };
    payload = { conditions: parsed.fields };
    // No active registrations: nobody is affected, so apply it directly.
    if (lock.activeCount === 0) {
      await applyConditions(t.id, parsed.fields);
      return { applied: true as const };
    }
  } else if (input.kind === "cancel" && !lock.locked) {
    return { error: "validation_error" as const, message: "Nothing is locked yet — you can cancel this event directly." };
  }

  const dup = await prisma.tournamentChangeRequest.findFirst({ where: { tournamentId: t.id, kind: input.kind, status: "pending" } });
  if (dup) return { error: "already_pending" as const };

  const data = await prisma.tournamentChangeRequest.create({
    data: { tournamentId: t.id, requestedById: input.userId, kind: input.kind, details, payload: (payload ?? undefined) as object | undefined },
  });
  return { data };
}

export async function listChangeRequestsFor(tournamentId: string) {
  return prisma.tournamentChangeRequest.findMany({ where: { tournamentId }, orderBy: { createdAt: "desc" }, take: 20 });
}

// The organizer says they refunded every paid player of a cancelled event.
export async function confirmRefunds(organizerId: string, tournamentId: string) {
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!t) return { error: "not_found" as const };
  if (t.organizerId !== organizerId) return { error: "forbidden" as const };
  if (t.status !== "cancelled" || !t.cancelRefundsDueAt) return { error: "nothing_to_confirm" as const };
  if (t.refundsConfirmedAt) return { data: t };
  const data = await prisma.tournament.update({ where: { id: tournamentId }, data: { refundsConfirmedAt: new Date() } });
  return { data };
}

// ---------- admin side ----------

export async function countPendingChangeRequests() {
  return prisma.tournamentChangeRequest.count({ where: { status: "pending" } });
}

export async function listChangeRequestsForAdmin() {
  const rows = await prisma.tournamentChangeRequest.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 60,
    include: {
      tournament: {
        select: {
          id: true, name: true, status: true, entryType: true, prizePoolAmount: true, prizePoolCurrency: true,
          organizer: { select: { orgName: true, user: { select: { email: true } } } },
        },
      },
    },
  });
  const out = [];
  for (const r of rows) {
    const registered = await prisma.registration.count({ where: { tournamentId: r.tournamentId, status: { in: ["pending", "approved"] } } });
    out.push({ ...r, registered });
  }
  return out;
}

async function applyConditions(tournamentId: string, conditions: RegistrationField[]) {
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { customFields: true } });
  const keep = asFields(t?.customFields).filter((f) => f.type !== "condition");
  await prisma.tournament.update({ where: { id: tournamentId }, data: { customFields: [...keep, ...conditions] as object } });
}

export async function decideChangeRequest(input: { adminId: string; requestId: string; approve: boolean; note: string }) {
  const note = input.note.trim();
  if (!note) return { error: "validation_error" as const, message: "Add a note explaining the decision." };
  const req = await prisma.tournamentChangeRequest.findUnique({
    where: { id: input.requestId },
    include: { tournament: { select: { id: true, name: true, entryType: true, organizer: { select: { userId: true } } } } },
  });
  if (!req) return { error: "not_found" as const };
  if (req.status !== "pending") return { error: "validation_error" as const, message: "Already decided." };
  const t = req.tournament;
  const payload = (req.payload ?? {}) as { amount?: number; tiers?: PrizeTierInput[]; awards?: AwardInput[]; conditions?: RegistrationField[] };
  const players = await registeredUserIds(t.id);

  if (input.approve) {
    if (req.kind === "prize_pool" && payload.amount) {
      await prisma.$transaction([
        prisma.tournament.update({ where: { id: t.id }, data: { prizePoolAmount: payload.amount } }),
        ...replacePrizeTiers(t.id, payload.tiers ?? []),
        ...replacePrizeAwards(t.id, payload.awards ?? []),
      ]);
    } else if (req.kind === "conditions" && payload.conditions) {
      await applyConditions(t.id, payload.conditions);
    } else if (req.kind === "cancel") {
      const cfg = await getTrustConfig();
      await prisma.tournament.update({
        where: { id: t.id },
        data: {
          status: "cancelled",
          // Paid players are owed refunds the organizer must send directly.
          ...(t.entryType === "paid" && players.length > 0
            ? { cancelRefundsDueAt: new Date(Date.now() + cfg.payoutGraceDays * DAY_MS), refundsConfirmedAt: null }
            : {}),
        },
      });
    }
  }

  await prisma.$transaction([
    prisma.tournamentChangeRequest.update({
      where: { id: req.id },
      data: { status: input.approve ? "approved" : "denied", adminNote: note, reviewedById: input.adminId, reviewedAt: new Date() },
    }),
    prisma.adminActionLog.create({
      data: { adminId: input.adminId, action: input.approve ? "approved_change_request" : "denied_change_request", targetType: "TournamentChangeRequest", targetId: req.id, notes: `${req.kind}: ${note}` },
    }),
  ]);

  await notify(t.organizer.userId, {
    type: "change_request",
    title: input.approve ? "Your change request was approved" : "Your change request was denied",
    body: `${KIND_LABEL[req.kind as ChangeKindT]} for "${t.name}": ${note}`,
    href: `/organizer/dashboard/tournaments/${t.id}`,
  });

  if (input.approve && players.length > 0 && req.kind !== "other") {
    const what =
      req.kind === "prize_pool"
        ? `The prize pool for "${t.name}" was changed by the organizer with admin approval.`
        : req.kind === "conditions"
          ? `The entry conditions for "${t.name}" were changed by the organizer with admin approval.`
          : t.entryType === "paid"
            ? `"${t.name}" was cancelled with admin approval. The organizer must refund your entry fee directly — contact them or an admin if you don't receive it.`
            : `"${t.name}" was cancelled.`;
    await notifyMany(players, { type: "tournament_changed", title: "An event you joined has changed", body: what, href: "/dashboard" });
  }
  return { data: { id: req.id } };
}
