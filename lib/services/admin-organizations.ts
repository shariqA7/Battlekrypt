// Admin-side organization management: add an organization directly for an
// existing account (no application or payment screenshot), and assign any
// organizer plan for a chosen period. Assigned plans are complimentary: they
// create no payment record and no security deposit.
import { prisma } from "@/lib/prisma";
import { FREE_PLAN_CODE } from "@/lib/plans";
import { isOrgNameAvailable } from "@/lib/services/org-applications";
import { notify } from "@/lib/services/notifications";
import { computeAssignedExpiry, parsePlanDuration } from "@/lib/plan-duration";

export async function searchUsersForOrganizer(query: string) {
  const q = query.trim();
  if (q.length < 2) return [];
  const users = await prisma.user.findMany({
    where: { OR: [{ email: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }] },
    select: { id: true, displayName: true, email: true, organizerProfile: { select: { orgName: true } } },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  return users.map((u) => ({ id: u.id, name: u.displayName, email: u.email ?? "", organization: u.organizerProfile?.orgName ?? null }));
}

function describe(planName: string, expiresAt: Date | null) {
  return expiresAt ? `${planName} until ${expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}` : `${planName} with no expiry`;
}

export async function adminAssignOrganizerPlan(input: {
  adminId: string;
  organizerId: string;
  planCode: string;
  duration?: unknown;
  extend?: boolean;
  note?: string;
}) {
  const [org, plan] = await Promise.all([
    prisma.organizerProfile.findUnique({ where: { id: input.organizerId } }),
    prisma.plan.findUnique({ where: { code: input.planCode } }),
  ]);
  if (!org) return { error: "not_found" as const };
  if (!plan || plan.audience !== "organizer") return { error: "validation_error" as const, message: "Choose an organizer plan." };

  const isFree = plan.code === FREE_PLAN_CODE.organizer || !plan.isPaid;
  let expiresAt: Date | null = null;
  if (!isFree) {
    const parsed = parsePlanDuration(input.duration);
    if (!parsed.ok) return { error: "validation_error" as const, message: parsed.message };
    expiresAt = computeAssignedExpiry(org, plan.code, parsed.value, Boolean(input.extend));
  }

  await prisma.$transaction([
    prisma.organizerProfile.update({ where: { id: org.id }, data: { planCode: plan.code, planExpiresAt: expiresAt } }),
    prisma.adminActionLog.create({
      data: {
        adminId: input.adminId,
        action: "assigned_organizer_plan",
        targetType: "OrganizerProfile",
        targetId: org.id,
        notes: `${describe(plan.name, expiresAt)}${input.note?.trim() ? ` — ${input.note.trim()}` : ""}`,
      },
    }),
  ]);
  await notify(org.userId, {
    type: "plan",
    title: isFree ? "Your plan was changed to Free" : "An admin gave you a plan",
    body: isFree ? "Your organization is now on the Free plan." : `Your organization is now on ${describe(plan.name, expiresAt)}.`,
    href: "/plans",
  });
  return { data: { planCode: plan.code, planName: plan.name, expiresAt } };
}

export async function adminCreateOrganization(input: {
  adminId: string;
  userId: string;
  orgName: string;
  country?: string;
  bio?: string;
  planCode?: string;
  duration?: unknown;
  liftLimits?: boolean;
}) {
  const orgName = input.orgName.trim();
  if (orgName.length < 2 || orgName.length > 60) {
    return { error: "validation_error" as const, message: "The organization name must be 2–60 characters." };
  }
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, organizerProfile: { select: { id: true } } } });
  if (!user) return { error: "not_found" as const };
  if (user.organizerProfile) return { error: "already_organizer" as const };
  if (!(await isOrgNameAvailable(orgName, input.userId, input.planCode ?? FREE_PLAN_CODE.organizer))) {
    return { error: "name_taken" as const };
  }

  // Validate the plan choice before creating anything.
  let planToAssign: { code: string } | null = null;
  if (input.planCode && input.planCode !== FREE_PLAN_CODE.organizer) {
    const plan = await prisma.plan.findUnique({ where: { code: input.planCode } });
    if (!plan || plan.audience !== "organizer") return { error: "validation_error" as const, message: "Choose an organizer plan." };
    if (plan.isPaid) {
      const parsed = parsePlanDuration(input.duration);
      if (!parsed.ok) return { error: "validation_error" as const, message: parsed.message };
    }
    planToAssign = plan;
  }

  const [org] = await prisma.$transaction([
    prisma.organizerProfile.create({
      data: {
        userId: input.userId,
        orgName,
        bio: input.bio?.trim() || null,
        country: input.country?.trim() || null,
        planCode: FREE_PLAN_CODE.organizer,
        limitsLifted: Boolean(input.liftLimits),
      },
    }),
    // kycStatus gates publishing tournaments; an admin adding the organization vouches for it.
    prisma.user.update({ where: { id: input.userId }, data: { kycStatus: "approved" } }),
    // A pending application from the same person is now moot.
    prisma.organizationApplication.updateMany({
      where: { userId: input.userId, status: "pending" },
      data: { status: "approved", reviewedAt: new Date(), reviewedById: input.adminId },
    }),
    prisma.adminActionLog.create({
      data: { adminId: input.adminId, action: "created_organization", targetType: "User", targetId: input.userId, notes: orgName },
    }),
  ]);

  let plan: { planName: string; expiresAt: Date | null } | null = null;
  if (planToAssign) {
    const r = await adminAssignOrganizerPlan({ adminId: input.adminId, organizerId: org.id, planCode: planToAssign.code, duration: input.duration });
    if ("data" in r && r.data) plan = { planName: r.data.planName, expiresAt: r.data.expiresAt };
  } else {
    await notify(input.userId, {
      type: "organization",
      title: "Your organization was created",
      body: `An admin set up "${orgName}" for you. You can create tournaments from your organizer dashboard.`,
      href: "/organizer/dashboard",
    });
  }
  return { data: { organizerId: org.id, plan } };
}
