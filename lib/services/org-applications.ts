import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { orgNameKey } from "@/lib/org-name";
import { cooldownMs } from "@/lib/org-resubmit";
import { planCodeAllowsSameNameClub } from "@/lib/services/club-names";
import { findClubHolding, findReservationFor, fulfillClaim } from "@/lib/services/club-names";
import {
  validateOrgApplication,
  type FieldErrors,
  type OrgApplicationInput,
} from "@/lib/validation/org-application";

// True if no other application, organizer or CLUB already uses this name
// (ignoring case, spaces and punctuation). `excludeUserId` lets an applicant
// keep their own name when editing and resubmitting. A club owned by the same
// person only shares the name if they chose a paid plan.
export async function isOrgNameAvailable(
  name: string,
  excludeUserId?: string,
  plan?: string
) {
  const key = orgNameKey(name);
  if (!key) return false;

  // Reserved for someone whose name claim was upheld.
  const reservation = await findReservationFor(key);
  if (reservation && reservation.claimantId !== excludeUserId) return false;
  const holdsReservation = !!reservation && reservation.claimantId === excludeUserId;

  const [application, organizers, club] = await Promise.all([
    prisma.organizationApplication.findUnique({ where: { orgNameKey: key } }),
    // Organizers created before applications existed have no key stored, so
    // compare their names the same way.
    prisma.organizerProfile.findMany({ select: { orgName: true, userId: true } }),
    findClubHolding(key),
  ]);

  if (application && application.userId !== excludeUserId) return false;
  const clash = organizers.some(
    (o) => orgNameKey(o.orgName) === key && o.userId !== excludeUserId
  );
  if (clash) return false;

  if (club && !holdsReservation) {
    const ownClub = club.userId === excludeUserId;
    if (!ownClub) return false;
    if (!plan || !(await planCodeAllowsSameNameClub(plan))) return false;
  }
  return true;
}

export async function getApplicationForUser(userId: string) {
  return prisma.organizationApplication.findUnique({ where: { userId } });
}

// The plan an applicant picks must be a real, on-sale organizer plan.
async function isValidOrgPlan(code: string) {
  const plan = await prisma.plan.findUnique({ where: { code } });
  return !!plan && plan.audience === "organizer" && plan.isActive;
}

type Result<T> = { data: T } | { error: string; errors?: FieldErrors };

export async function createApplication(
  userId: string,
  input: OrgApplicationInput
): Promise<Result<{ id: string }>> {
  const [existingApp, existingOrg] = await Promise.all([
    prisma.organizationApplication.findUnique({ where: { userId } }),
    prisma.organizerProfile.findUnique({ where: { userId } }),
  ]);
  if (existingOrg) return { error: "already_organizer" };
  if (existingApp) return { error: "already_applied" };

  if (!(await isValidOrgPlan(input.plan))) {
    return { error: "invalid", errors: { plan: "Choose one of the available plans." } };
  }
  if (!(await isOrgNameAvailable(input.orgName, userId, input.plan))) {
    return { error: "name_taken", errors: { orgName: "That organization name is already taken." } };
  }

  try {
    const app = await prisma.organizationApplication.create({
      data: { userId, ...input, orgNameKey: orgNameKey(input.orgName) },
    });
    await fulfillClaim(userId, orgNameKey(input.orgName));
    return { data: { id: app.id } };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "name_taken", errors: { orgName: "That organization name is already taken." } };
    }
    throw e;
  }
}

// A rejected applicant fixes their details and sends the SAME application
// back. Blocked until the cooldown from the last rejection has passed.
export async function resubmitApplication(
  userId: string,
  input: OrgApplicationInput
): Promise<Result<{ id: string }> & { retryAt?: Date }> {
  const app = await prisma.organizationApplication.findUnique({ where: { userId } });
  if (!app) return { error: "not_found" };
  if (app.status !== "rejected") return { error: "not_rejected" };

  if (app.nextResubmitAt && app.nextResubmitAt.getTime() > Date.now()) {
    return { error: "too_soon", retryAt: app.nextResubmitAt };
  }

  if (!(await isValidOrgPlan(input.plan))) {
    return { error: "invalid", errors: { plan: "Choose one of the available plans." } };
  }
  if (!(await isOrgNameAvailable(input.orgName, userId, input.plan))) {
    return { error: "name_taken", errors: { orgName: "That organization name is already taken." } };
  }

  try {
    const updated = await prisma.organizationApplication.update({
      where: { id: app.id },
      data: {
        ...input,
        orgNameKey: orgNameKey(input.orgName),
        status: "pending",
        attemptCount: { increment: 1 },
        submittedAt: new Date(),
        // Feedback is cleared once addressed; the admin action log keeps the
        // history of what was said.
        rejectionNote: null,
        fieldFeedback: Prisma.JsonNull,
        nextResubmitAt: null,
        reviewedAt: null,
        reviewedById: null,
      },
    });
    await fulfillClaim(userId, orgNameKey(input.orgName));
    return { data: { id: updated.id } };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "name_taken", errors: { orgName: "That organization name is already taken." } };
    }
    throw e;
  }
}

// Sign-up with "Confirm email" on has no session yet, so the application is
// carried in the auth user's metadata and created here, once the person has
// confirmed and signed in. Safe to call on every login: it does nothing if an
// application or organizer profile already exists.
export async function createApplicationFromMetadata(user: SupabaseUser) {
  const raw = user.user_metadata?.org_application;
  if (!raw) return null;

  const [existingApp, existingOrg] = await Promise.all([
    prisma.organizationApplication.findUnique({ where: { userId: user.id } }),
    prisma.organizerProfile.findUnique({ where: { userId: user.id } }),
  ]);
  if (existingApp || existingOrg) return null;

  const parsed = validateOrgApplication(raw);
  if ("errors" in parsed) return null;
  const result = await createApplication(user.id, parsed.data);
  return "data" in result ? result.data : null;
}

export async function listPendingApplications() {
  return prisma.organizationApplication.findMany({
    where: { status: "pending" },
    orderBy: { submittedAt: "asc" },
    include: { user: { select: { email: true } } },
  });
}

export async function approveApplication(id: string, adminId: string) {
  const app = await prisma.organizationApplication.findUnique({ where: { id } });
  if (!app) return { error: "not_found" as const };
  if (app.status !== "pending") return { error: "not_pending" as const };

  const existingOrg = await prisma.organizerProfile.findUnique({
    where: { userId: app.userId },
  });
  if (existingOrg) return { error: "already_organizer" as const };

  await prisma.$transaction([
    prisma.organizerProfile.create({
      data: {
        userId: app.userId,
        orgName: app.orgName,
        bio: app.description,
        // Lets country-specific tier settings (Phase 6) apply to this organizer.
        country: app.country,
        // Always starts on the free plan; a paid plan the applicant picked is
        // bought on /plans (screenshot proof -> admin approval).
        planCode: "organizer_free",
        socialLinks: app.website ? { website: app.website } : undefined,
      },
    }),
    // kycStatus is what gates publishing tournaments elsewhere in the app.
    prisma.user.update({ where: { id: app.userId }, data: { kycStatus: "approved" } }),
    prisma.organizationApplication.update({
      where: { id },
      data: {
        status: "approved",
        reviewedAt: new Date(),
        reviewedById: adminId,
        rejectionNote: null,
        fieldFeedback: Prisma.JsonNull,
        nextResubmitAt: null,
      },
    }),
    prisma.adminActionLog.create({
      data: { adminId, action: "approved_org_application", targetType: "OrganizationApplication", targetId: id },
    }),
  ]);
  return { data: { id } };
}

export async function rejectApplication(
  id: string,
  adminId: string,
  feedback: { note?: string; fields?: Record<string, string> }
) {
  const app = await prisma.organizationApplication.findUnique({ where: { id } });
  if (!app) return { error: "not_found" as const };
  if (app.status !== "pending") return { error: "not_pending" as const };

  const note = feedback.note?.trim() || null;
  const fields = Object.fromEntries(
    Object.entries(feedback.fields ?? {})
      .map(([k, v]) => [k, String(v).trim()] as const)
      .filter(([, v]) => v)
  );
  if (!note && Object.keys(fields).length === 0) {
    return { error: "feedback_required" as const };
  }

  const rejectionCount = app.rejectionCount + 1;
  const now = new Date();

  await prisma.$transaction([
    prisma.organizationApplication.update({
      where: { id },
      data: {
        status: "rejected",
        rejectionCount,
        rejectionNote: note,
        fieldFeedback: Object.keys(fields).length ? fields : Prisma.JsonNull,
        nextResubmitAt: new Date(now.getTime() + cooldownMs(rejectionCount)),
        reviewedAt: now,
        reviewedById: adminId,
      },
    }),
    prisma.adminActionLog.create({
      data: {
        adminId,
        action: "rejected_org_application",
        targetType: "OrganizationApplication",
        targetId: id,
        notes: JSON.stringify({ note, fields }),
      },
    }),
  ]);
  return { data: { id } };
}
