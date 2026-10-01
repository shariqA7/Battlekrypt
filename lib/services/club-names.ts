// Club/organization name protection. A name can be held by only one club, and
// clubs and organizations share the same protected namespace — except that a
// PAID organization may also run a club with its own name ("Falcon" the
// organization and "Falcon" the team).
import { prisma } from "@/lib/prisma";
import { orgNameKey } from "@/lib/org-name";
import { resolvePlan } from "@/lib/plans";

// Paid organization plans let an organization also run a club with its own
// name. Read from the plan's limits (admin-editable) and respects expiry:
// a lapsed paid plan loses the perk.
export async function planCodeAllowsSameNameClub(planCode: string) {
  const plan = await resolvePlan("organizer", { planCode, planExpiresAt: null });
  return plan.limits.allowSameNameClub;
}

export async function orgAllowsSameNameClub(org: { planCode: string; planExpiresAt: Date | null }) {
  const plan = await resolvePlan("organizer", org);
  return plan.limits.allowSameNameClub;
}

export type NameCheck =
  | { ok: true }
  | {
      ok: false;
      reason: "taken_club" | "taken_org" | "reserved" | "needs_paid_plan";
      message: string;
      // True when the holder is a club the person could file a claim against.
      canClaim: boolean;
    };

// The live (not disbanded) club currently holding a name, if any. Clubs made
// before nameKey existed have it null, so they are compared by name.
export async function findClubHolding(key: string) {
  const byKey = await prisma.clubProfile.findUnique({ where: { nameKey: key } });
  if (byKey && byKey.status !== "disbanded") return byKey;

  const legacy = await prisma.clubProfile.findMany({
    where: { nameKey: null, status: { not: "disbanded" } },
  });
  return legacy.find((c) => orgNameKey(c.clubName) === key) ?? null;
}

// Name reserved for someone whose claim was upheld but who hasn't used it yet.
export async function findReservationFor(key: string) {
  return prisma.clubNameClaim.findFirst({
    where: { nameKey: key, status: "upheld", fulfilledAt: null },
  });
}

// Marks the claimant's upheld claim as used once they create the club or
// organization with the name.
export async function fulfillClaim(userId: string, key: string) {
  await prisma.clubNameClaim.updateMany({
    where: { claimantId: userId, nameKey: key, status: "upheld", fulfilledAt: null },
    data: { fulfilledAt: new Date() },
  });
}

export async function checkClubName(name: string, userId: string): Promise<NameCheck> {
  const key = orgNameKey(name);
  if (!key) {
    return { ok: false, reason: "taken_club", message: "Enter a valid club name.", canClaim: false };
  }

  const reservation = await findReservationFor(key);
  if (reservation && reservation.claimantId !== userId) {
    return {
      ok: false,
      reason: "reserved",
      message: "That name is reserved for its rightful owner.",
      canClaim: false,
    };
  }
  // The claimant may take their reserved name.
  if (reservation && reservation.claimantId === userId) return { ok: true };

  const club = await findClubHolding(key);
  if (club && club.userId !== userId) {
    return {
      ok: false,
      reason: "taken_club",
      message: "A club with that name already exists. Club names can't be reused.",
      canClaim: true,
    };
  }

  const [organizers, applications] = await Promise.all([
    prisma.organizerProfile.findMany({
      select: { orgName: true, userId: true, planCode: true, planExpiresAt: true },
    }),
    prisma.organizationApplication.findUnique({ where: { orgNameKey: key } }),
  ]);
  const org = organizers.find((o) => orgNameKey(o.orgName) === key);

  if (org) {
    if (org.userId !== userId) {
      return {
        ok: false,
        reason: "taken_org",
        message: "That name belongs to an organization.",
        canClaim: false,
      };
    }
    // Their own organization: only paid plans may share the name.
    if (!(await orgAllowsSameNameClub(org))) {
      return {
        ok: false,
        reason: "needs_paid_plan",
        message: "Only organizations on a paid plan can also run a club with the same name.",
        canClaim: false,
      };
    }
    return { ok: true };
  }

  if (applications) {
    return {
      ok: false,
      reason: "taken_org",
      message:
        applications.userId === userId
          ? "Your organization isn't approved yet. A same-name club is available to approved, paid organizations."
          : "That name belongs to an organization.",
      canClaim: false,
    };
  }

  return { ok: true };
}
