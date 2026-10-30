// Admin-side organization management: add an organization directly for an
// existing account (no application or payment screenshot), and assign any
// organizer plan for a chosen period. Assigned plans are complimentary: they
// create no payment record and no security deposit.
import { prisma } from "@/lib/prisma";
import { FREE_PLAN_CODE } from "@/lib/plans";
import { isOrgNameAvailable } from "@/lib/services/org-applications";
import { notify } from "@/lib/services/notifications";
import { computeAssignedExpiry, parsePlanDuration } from "@/lib/plan-duration";
import type { Prisma } from "@prisma/client";
import { cursorArgs, toPage, type Page, type PageQuery } from "@/lib/admin-paging";
import { getTrustConfig } from "@/lib/services/organizer-trust";
import { createInvoice } from "@/lib/services/invoices";
import { identityCryptoReady, sealIdentityDetails } from "@/lib/identity-crypto";
import { hashDocNumber } from "@/lib/identity-hash";
import { addMonths, DOC_TYPES, isOwnUpload, isPlausibleDocNumber, purgeAfterFor, type DocType } from "@/lib/identity";

export type UserHit = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  organization: string | null;
};

// Accounts for the "add organization" picker. An empty search lists everyone,
// newest first; scrolling asks for the next page with the returned cursor.
export async function searchUsersPage({ q, cursor, limit }: PageQuery): Promise<Page<UserHit>> {
  const contains = (field: string) => ({ [field]: { contains: q, mode: "insensitive" as const } });
  const where: Prisma.UserWhereInput = q
    ? { OR: [contains("email"), contains("displayName"), contains("phone"), { playerProfile: { username: { contains: q.toLowerCase() } } }] }
    : {};
  const rows = await prisma.user.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: limit + 1,
    ...cursorArgs(cursor),
    select: { id: true, displayName: true, email: true, phone: true, avatarUrl: true, organizerProfile: { select: { orgName: true } } },
  });
  const page = toPage(rows, limit);
  return {
    nextCursor: page.nextCursor,
    items: page.items.map((u) => ({
      id: u.id,
      name: u.displayName,
      email: u.email ?? "",
      phone: u.phone,
      avatarUrl: u.avatarUrl,
      organization: u.organizerProfile?.orgName ?? null,
    })),
  };
}

// Everything known about one account, to fill the form and to let the admin
// check the person (KYC) before making them an organizer.
export async function getUserForOrganizer(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      displayName: true,
      email: true,
      phone: true,
      avatarUrl: true,
      kycStatus: true,
      createdAt: true,
      playerProfile: {
        select: {
          firstName: true,
          lastName: true,
          username: true,
          mobileNumber: true,
          country: true,
          region: true,
          city: true,
          age: true,
          birthDate: true,
          gender: true,
        },
      },
      organizerProfile: { select: { id: true, orgName: true } },
      orgApplication: {
        select: {
          orgName: true,
          orgType: true,
          description: true,
          registrationNumber: true,
          website: true,
          country: true,
          city: true,
          address: true,
          contactEmail: true,
          contactPhone: true,
          status: true,
        },
      },
      bans: { where: { liftedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }, select: { reason: true, endsAt: true } },
    },
  });
  if (!u) return null;
  return {
    id: u.id,
    name: u.displayName,
    email: u.email ?? "",
    phone: u.phone,
    avatarUrl: u.avatarUrl,
    kycStatus: u.kycStatus,
    joinedAt: u.createdAt.toISOString(),
    profile: u.playerProfile
      ? { ...u.playerProfile, birthDate: u.playerProfile.birthDate?.toISOString().slice(0, 10) ?? null }
      : null,
    organization: u.organizerProfile,
    application: u.orgApplication,
    activeBan: u.bans[0] ? { reason: u.bans[0].reason, endsAt: u.bans[0].endsAt?.toISOString() ?? null } : null,
  };
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

export const INSTITUTE_KINDS = ["school", "college", "university", "academy", "other"] as const;

export type AdminKycInput = {
  docType: string;
  fullName: string;
  documentNumber: string;
  address: string;
  frontPath: unknown;
  backPath: unknown;
  selfiePath: unknown;
  // The admin ticks this after checking the documents and that the person is 18 or older.
  checked: boolean;
};

export type AdminCreateOrganizationInput = {
  adminId: string;
  userId: string;
  type: "organization" | "institute";
  orgName: string;
  country?: string;
  bio?: string;
  orgType?: string;
  registrationNumber?: string;
  website?: string;
  city?: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
  institute?: { kind?: string; verified?: boolean; proofPath?: unknown };
  kyc?: AdminKycInput | null;
  planCode?: string;
  duration?: unknown;
  liftLimits?: boolean;
  // Bill the organization instead of giving the plan for free: the plan is granted when an
  // admin marks the invoice paid. When set, `planCode`/`duration` above are not used.
  invoice?: {
    planCode?: string | null;
    planAmount?: number | null;
    currency?: string;
    includeSecurityFee?: boolean;
    securityFeeAmount?: number | null;
    discountType?: "amount" | "percent" | null;
    discountValue?: number | null;
    discountReason?: string | null;
    dueDate?: unknown;
    taxRate?: number | null;
    note?: string | null;
  } | null;
};

type CreateError =
  | { error: "not_found" | "already_organizer" | "name_taken" | "banned" | "not_configured" | "duplicate_banned_id" }
  | { error: "validation_error"; message: string };

const clean = (v: string | undefined, max: number) => (v?.trim() ? v.trim().slice(0, max) : null);

// Adds an organization (or an institute, which is an organization that also runs one) for an
// existing account, with no application and no payment proof. Optional: the organizer's
// identity check done by the admin, an institute's registration document, and a plan.
export async function adminCreateOrganization(input: AdminCreateOrganizationInput): Promise<CreateError | { data: { organizerId: string; plan: { planName: string; expiresAt: Date | null } | null; invoice: { id: string; number: string } | null; invoiceError: string | null } }> {
  const orgName = input.orgName.trim();
  if (orgName.length < 2 || orgName.length > 60) {
    return { error: "validation_error", message: "The organization name must be 2–60 characters." };
  }
  const isInstitute = input.type === "institute";

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, displayName: true, organizerProfile: { select: { id: true } } },
  });
  if (!user) return { error: "not_found" };
  if (user.organizerProfile) return { error: "already_organizer" };
  const now = new Date();
  if ((await prisma.accountBan.count({ where: { userId: user.id, liftedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: now } }] } })) > 0) {
    return { error: "banned" };
  }
  if (!(await isOrgNameAvailable(orgName, input.userId, input.planCode ?? FREE_PLAN_CODE.organizer))) {
    return { error: "name_taken" };
  }

  // ---- institute: a stricter check ----
  const address = clean(input.address, 250);
  const registrationNumber = clean(input.registrationNumber, 80);
  let instituteData: { name: string; kind: string; proofPath: string; verified: boolean } | null = null;
  if (isInstitute) {
    const kind = (INSTITUTE_KINDS as readonly string[]).includes(input.institute?.kind ?? "") ? (input.institute!.kind as string) : null;
    if (!kind) return { error: "validation_error", message: "Choose the kind of institute." };
    if (!registrationNumber) return { error: "validation_error", message: "Enter the institute's registration or affiliation number." };
    if (!address || address.length < 8) return { error: "validation_error", message: "Enter the institute's address." };
    if (!isOwnUpload(input.userId, input.institute?.proofPath)) {
      return { error: "validation_error", message: "Upload a photo of the institute's registration or affiliation document." };
    }
    if (!input.kyc) return { error: "validation_error", message: "An institute needs the identity check of the person who runs it." };
    const clash = await prisma.institution.findFirst({ where: { name: { equals: orgName, mode: "insensitive" } }, select: { id: true } });
    if (clash) return { error: "name_taken" };
    instituteData = { name: orgName, kind, proofPath: input.institute!.proofPath as string, verified: input.institute?.verified === true };
  }

  // ---- identity check done by the admin ----
  let identity: Prisma.IdentityVerificationCreateWithoutOrganizerInput | null = null;
  let duplicateNote = "";
  if (input.kyc) {
    const k = input.kyc;
    const docType = DOC_TYPES.find((t) => t === k.docType) as DocType | undefined;
    const fullName = k.fullName.trim();
    const kycAddress = k.address.trim();
    if (!docType || fullName.length < 3 || fullName.length > 120 || !isPlausibleDocNumber(k.documentNumber)) {
      return { error: "validation_error", message: "Enter the full name and document number exactly as on the document." };
    }
    if (kycAddress.length < 8 || kycAddress.length > 250) return { error: "validation_error", message: "Enter the person's full home address." };
    const back = docType === "nic" ? k.backPath : null;
    if (!isOwnUpload(input.userId, k.frontPath) || !isOwnUpload(input.userId, k.selfiePath) || (docType === "nic" && !isOwnUpload(input.userId, back))) {
      return { error: "validation_error", message: "Upload the document photos and the selfie." };
    }
    if (!k.checked) return { error: "validation_error", message: "Confirm that you checked the documents and that the person is 18 or older." };
    const secret = process.env.IDENTITY_HASH_SECRET;
    if (!secret || !identityCryptoReady()) return { error: "not_configured" };

    const idNumberHash = hashDocNumber(k.documentNumber, secret);
    const others = await prisma.identityVerification.findMany({
      where: { idNumberHash },
      select: { organizer: { select: { orgName: true, userId: true } } },
    });
    for (const o of others) {
      const banned = await prisma.accountBan.count({ where: { userId: o.organizer.userId, liftedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: now } }] } });
      if (banned > 0) return { error: "duplicate_banned_id" };
    }
    if (others.length > 0) duplicateNote = ` Same ID number as: ${others.map((o) => o.organizer.orgName).join(", ")}.`;

    const cfg = await getTrustConfig();
    identity = {
      status: "approved",
      docType,
      fullName,
      detailsEnc: sealIdentityDetails({ documentNumber: k.documentNumber.trim(), address: kycAddress }),
      frontPath: k.frontPath as string,
      backPath: (back as string | null) ?? null,
      selfiePath: k.selfiePath as string,
      idNumberHash,
      over18Confirmed: true,
      submittedAt: now,
      reviewedAt: now,
      reviewedById: input.adminId,
      validUntil: addMonths(now, cfg.idValidityMonths),
      purgeAfter: purgeAfterFor("approve", cfg, now),
    };
  }

  // Validate the plan choice before creating anything.
  let planToAssign: { code: string } | null = null;
  if (input.invoice) {
    // Billing: the plan is not given now, so check the invoice has something to bill.
    if (!input.invoice.planCode && !input.invoice.includeSecurityFee) {
      return { error: "validation_error", message: "An invoice needs a plan, a security fee, or both." };
    }
  } else if (input.planCode && input.planCode !== FREE_PLAN_CODE.organizer) {
    const plan = await prisma.plan.findUnique({ where: { code: input.planCode } });
    if (!plan || plan.audience !== "organizer") return { error: "validation_error", message: "Choose an organizer plan." };
    if (plan.isPaid) {
      const parsed = parsePlanDuration(input.duration);
      if (!parsed.ok) return { error: "validation_error", message: parsed.message };
    }
    planToAssign = plan;
  }

  const [org] = await prisma.$transaction([
    prisma.organizerProfile.create({
      data: {
        userId: input.userId,
        orgName,
        bio: clean(input.bio, 1000),
        country: clean(input.country, 80),
        orgType: clean(input.orgType, 60) ?? (isInstitute ? "Institute" : null),
        registrationNumber,
        website: clean(input.website, 200),
        city: clean(input.city, 80),
        address,
        contactEmail: clean(input.contactEmail, 120),
        contactPhone: clean(input.contactPhone, 40),
        createdByAdminId: input.adminId,
        planCode: FREE_PLAN_CODE.organizer,
        limitsLifted: Boolean(input.liftLimits),
        ...(identity ? { identity: { create: identity } } : {}),
        ...(instituteData
          ? {
              institution: {
                create: {
                  name: instituteData.name,
                  kind: instituteData.kind,
                  proofPath: instituteData.proofPath,
                  verified: instituteData.verified,
                  verifiedAt: instituteData.verified ? now : null,
                  verifiedById: instituteData.verified ? input.adminId : null,
                },
              },
            }
          : {}),
      },
    }),
    // kycStatus gates publishing tournaments; an admin adding the organization vouches for it.
    prisma.user.update({ where: { id: input.userId }, data: { kycStatus: "approved" } }),
    // A pending application from the same person is now moot.
    prisma.organizationApplication.updateMany({
      where: { userId: input.userId, status: "pending" },
      data: { status: "approved", reviewedAt: now, reviewedById: input.adminId },
    }),
    prisma.adminActionLog.create({
      data: {
        adminId: input.adminId,
        action: isInstitute ? "created_institute" : "created_organization",
        targetType: "User",
        targetId: input.userId,
        notes: `${orgName}${identity ? " · identity checked by admin" : " · no identity check"}${input.liftLimits ? " · starter limits lifted" : ""}${duplicateNote}`,
      },
    }),
  ]);

  let plan: { planName: string; expiresAt: Date | null } | null = null;
  let invoice: { id: string; number: string } | null = null;
  let invoiceError: string | null = null;
  if (input.invoice) {
    const r = await createInvoice({
      organizerId: org.id,
      source: "admin_added",
      createdById: input.adminId,
      currency: input.invoice.currency,
      planCode: input.invoice.planCode || null,
      planAmount: input.invoice.planAmount ?? null,
      includeSecurityFee: input.invoice.includeSecurityFee === true,
      securityFeeAmount: input.invoice.securityFeeAmount ?? null,
      discountType: input.invoice.discountType ?? null,
      discountValue: input.invoice.discountValue ?? null,
      discountReason: input.invoice.discountReason ?? null,
      dueDate: input.invoice.dueDate,
      taxRate: input.invoice.taxRate ?? null,
      note: input.invoice.note ?? null,
    });
    if ("data" in r) invoice = { id: r.data.id, number: r.data.number };
    // The organization already exists at this point, so a bad invoice is reported, not fatal.
    else invoiceError = r.message ?? "The invoice could not be created.";
  }
  if (planToAssign) {
    const r = await adminAssignOrganizerPlan({ adminId: input.adminId, organizerId: org.id, planCode: planToAssign.code, duration: input.duration });
    if ("data" in r && r.data) plan = { planName: r.data.planName, expiresAt: r.data.expiresAt };
  } else {
    await notify(input.userId, {
      type: "organization",
      title: isInstitute ? "Your institute was created" : "Your organization was created",
      body: `An admin set up "${orgName}" for you. You can create tournaments from your organizer dashboard.`,
      href: "/organizer/dashboard",
    });
  }
  return { data: { organizerId: org.id, plan, invoice, invoiceError } };
}

// ---------- the organizations list ----------

export type OrgRow = {
  id: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  ownerAvatar: string | null;
  type: "organization" | "institute";
  instituteVerified: boolean | null;
  planCode: string;
  planName: string;
  planState: "free" | "active" | "no_expiry" | "expired";
  planStartedAt: string | null;
  planEndsAt: string | null;
  tournaments: number;
  paused: boolean;
  joinedAt: string;
};

// When the current plan began: the latest of an approved plan payment and an admin
// giving a plan. The profile only stores the END date, and a plan can be given for any
// length, so the start is read from those two records. Free plans start when the
// organization joined.
async function planStartDates(orgs: { id: string; userId: string; planCode: string; createdAt: Date }[]) {
  const paid = orgs.filter((o) => o.planCode !== FREE_PLAN_CODE.organizer);
  const start = new Map<string, Date>();
  if (paid.length > 0) {
    const [requests, logs] = await Promise.all([
      prisma.planRequest.findMany({
        where: { status: "approved", audience: "organizer", reviewedAt: { not: null }, userId: { in: paid.map((o) => o.userId) } },
        select: { userId: true, reviewedAt: true },
        orderBy: { reviewedAt: "desc" },
      }),
      prisma.adminActionLog.findMany({
        where: { action: "assigned_organizer_plan", targetType: "OrganizerProfile", targetId: { in: paid.map((o) => o.id) } },
        select: { targetId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const byUser = new Map<string, Date>();
    for (const r of requests) if (r.reviewedAt && !byUser.has(r.userId)) byUser.set(r.userId, r.reviewedAt);
    const byOrg = new Map<string, Date>();
    for (const l of logs) if (!byOrg.has(l.targetId)) byOrg.set(l.targetId, l.createdAt);
    for (const o of paid) {
      const a = byUser.get(o.userId);
      const b = byOrg.get(o.id);
      const latest = a && b ? (a > b ? a : b) : (a ?? b);
      if (latest) start.set(o.id, latest);
    }
  }
  return (o: { id: string; planCode: string; createdAt: Date }) =>
    o.planCode === FREE_PLAN_CODE.organizer ? o.createdAt : (start.get(o.id) ?? null);
}

export function planStateOf(planCode: string, expiresAt: Date | null, now = new Date()): OrgRow["planState"] {
  if (planCode === FREE_PLAN_CODE.organizer) return "free";
  if (!expiresAt) return "no_expiry";
  return expiresAt <= now ? "expired" : "active";
}

export async function listOrganizationsPage({
  q,
  cursor,
  limit,
  type,
}: PageQuery & { type?: "organization" | "institute" | null }): Promise<Page<OrgRow>> {
  const search: Prisma.OrganizerProfileWhereInput[] = q
    ? [
        { orgName: { contains: q, mode: "insensitive" } },
        { user: { email: { contains: q, mode: "insensitive" } } },
        { user: { displayName: { contains: q, mode: "insensitive" } } },
        { institution: { name: { contains: q, mode: "insensitive" } } },
      ]
    : [];
  const where: Prisma.OrganizerProfileWhereInput = {
    ...(search.length ? { OR: search } : {}),
    ...(type === "institute" ? { institution: { isNot: null } } : type === "organization" ? { institution: { is: null } } : {}),
  };
  const [rows, plans] = await Promise.all([
    prisma.organizerProfile.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: limit + 1,
      ...cursorArgs(cursor),
      include: {
        user: { select: { displayName: true, email: true, avatarUrl: true } },
        institution: { select: { verified: true } },
        _count: { select: { tournaments: true } },
      },
    }),
    prisma.plan.findMany({ where: { audience: "organizer" }, select: { code: true, name: true } }),
  ]);
  const page = toPage(rows, limit);
  const startOf = await planStartDates(page.items);
  const names = new Map(plans.map((p) => [p.code, p.name]));
  return {
    nextCursor: page.nextCursor,
    items: page.items.map((o) => ({
      id: o.id,
      name: o.orgName,
      ownerName: o.user.displayName,
      ownerEmail: o.user.email ?? "",
      ownerAvatar: o.user.avatarUrl,
      type: o.institution ? "institute" : "organization",
      instituteVerified: o.institution ? o.institution.verified : null,
      planCode: o.planCode,
      planName: names.get(o.planCode) ?? o.planCode.replace("organizer_", ""),
      planState: planStateOf(o.planCode, o.planExpiresAt),
      planStartedAt: startOf(o)?.toISOString() ?? null,
      planEndsAt: o.planCode === FREE_PLAN_CODE.organizer ? null : (o.planExpiresAt?.toISOString() ?? null),
      tournaments: o._count.tournaments,
      paused: Boolean(o.reportsPausedAt),
      joinedAt: o.createdAt.toISOString(),
    })),
  };
}
