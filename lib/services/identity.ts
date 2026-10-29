// Organizer identity verification (Level 2 of organizer trust). Design notes live
// on the IdentityVerification model in prisma/schema.prisma. In short: the ID
// images are private and every admin view is logged; an approved check keeps the
// verified name, number and address (number and address encrypted) so a scam can
// be reported to the authorities; the photos are deleted once the organizer has
// built a track record, or at the latest after a retention period.
import { prisma } from "@/lib/prisma";
import { countFullyConfirmedEvents, getPayoutHolds, getTrustConfig } from "@/lib/services/organizer-trust";
import { identityCryptoReady, openIdentityDetails, sealIdentityDetails } from "@/lib/identity-crypto";
import { notify } from "@/lib/services/notifications";
import { hashDocNumber } from "@/lib/identity-hash";
import {
  addMonths,
  identityState,
  isOwnUpload,
  isPlausibleDocNumber,
  normalizeDocNumber,
  purgeAfterFor,
  DOC_TYPES,
  type DocType,
  type FileKind,
} from "@/lib/identity";

// ---------- organizer side ----------

export async function getIdentityForOrganizer(organizerId: string) {
  const row = await prisma.identityVerification.findUnique({ where: { organizerId } });
  if (!row) return null;
  return {
    id: row.id,
    state: identityState(row),
    docType: row.docType,
    submittedAt: row.submittedAt,
    reviewedAt: row.reviewedAt,
    validUntil: row.validUntil,
    rejectionNote: row.rejectionNote,
    attemptCount: row.attemptCount,
  };
}

export type SubmitIdentityInput = {
  docType: string;
  fullName: string;
  documentNumber: string;
  address: string;
  frontPath: unknown;
  backPath: unknown;
  selfiePath: unknown;
  consent: boolean;
};

export type SubmitIdentityError =
  | "not_approved"
  | "already_pending"
  | "already_verified"
  | "invalid"
  | "no_consent"
  | "bad_files"
  | "not_configured";

export async function submitIdentity(
  organizer: { id: string; userId: string },
  input: SubmitIdentityInput
): Promise<{ ok: true } | { error: SubmitIdentityError; message?: string }> {
  const user = await prisma.user.findUnique({ where: { id: organizer.userId }, select: { kycStatus: true } });
  if (user?.kycStatus !== "approved") return { error: "not_approved" };
  if (!input.consent) return { error: "no_consent" };

  const docType = DOC_TYPES.find((t) => t === input.docType) as DocType | undefined;
  const fullName = input.fullName.trim();
  const address = input.address.trim();
  if (!docType || fullName.length < 3 || fullName.length > 120 || !isPlausibleDocNumber(input.documentNumber)) {
    return { error: "invalid", message: "Enter the full name and document number exactly as on the document." };
  }
  if (address.length < 8 || address.length > 250) {
    return { error: "invalid", message: "Enter your full home address (street, area, city)." };
  }

  const front = input.frontPath;
  const selfie = input.selfiePath;
  const back = docType === "nic" ? input.backPath : null;
  if (!isOwnUpload(organizer.userId, front) || !isOwnUpload(organizer.userId, selfie)) return { error: "bad_files" };
  if (docType === "nic" && !isOwnUpload(organizer.userId, back)) return { error: "bad_files" };

  const secret = process.env.IDENTITY_HASH_SECRET;
  if (!secret || !identityCryptoReady()) return { error: "not_configured" };

  const existing = await prisma.identityVerification.findUnique({ where: { organizerId: organizer.id } });
  if (existing?.status === "pending") return { error: "already_pending" };
  if (existing && identityState(existing) === "approved") return { error: "already_verified" };

  const data = {
    status: "pending" as const,
    docType,
    fullName,
    documentNumber: null, // legacy column: the number now lives encrypted in detailsEnc
    detailsEnc: sealIdentityDetails({ documentNumber: input.documentNumber.trim(), address }),
    frontPath: front as string,
    backPath: (back as string | null) ?? null,
    selfiePath: selfie as string,
    idNumberHash: hashDocNumber(input.documentNumber, secret),
    over18Confirmed: false,
    rejectionNote: null,
    retentionHold: false,
    purgeAfter: null,
    purgedAt: null,
    submittedAt: new Date(),
    reviewedAt: null,
    reviewedById: null,
    validUntil: null,
  };

  if (existing) {
    await prisma.identityVerification.update({ where: { id: existing.id }, data: { ...data, attemptCount: existing.attemptCount + 1 } });
  } else {
    await prisma.identityVerification.create({ data: { ...data, organizerId: organizer.id } });
  }
  return { ok: true };
}

// ---------- admin side ----------

const WITH_ORG = {
  organizer: { select: { orgName: true, user: { select: { email: true, id: true } } } },
} as const;

// The typed number and address, for the reviewer. Rows from before encryption
// existed still hold the number in plain text (and no address).
function readDetails(row: { detailsEnc: string | null; documentNumber: string | null }) {
  const d = openIdentityDetails(row.detailsEnc);
  return { documentNumber: d?.documentNumber ?? row.documentNumber ?? null, address: d?.address ?? null };
}

// Another organizer account that used the same document number. Strongest when
// that account has an active ban (someone coming back under a new name).
async function findDuplicates(row: { id: string; idNumberHash: string | null }) {
  if (!row.idNumberHash) return [];
  const others = await prisma.identityVerification.findMany({
    where: { idNumberHash: row.idNumberHash, id: { not: row.id } },
    select: { status: true, organizer: { select: { orgName: true, user: { select: { id: true, email: true } } } } },
  });
  const now = new Date();
  return Promise.all(
    others.map(async (o) => ({
      orgName: o.organizer.orgName,
      email: o.organizer.user.email,
      status: o.status,
      banned:
        (await prisma.accountBan.count({
          where: { userId: o.organizer.user.id, liftedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        })) > 0,
    }))
  );
}

export async function listPendingIdentity() {
  const rows = await prisma.identityVerification.findMany({
    where: { status: "pending" },
    orderBy: { submittedAt: "asc" },
    include: WITH_ORG,
  });
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      orgName: r.organizer.orgName,
      email: r.organizer.user.email,
      docType: r.docType,
      fullName: r.fullName,
      ...readDetails(r),
      hasBack: Boolean(r.backPath),
      attemptCount: r.attemptCount,
      submittedAt: r.submittedAt.toISOString(),
      duplicates: await findDuplicates(r),
    }))
  );
}

// Decided records whose images are still stored: shows the deletion date and
// lets an admin keep them longer.
export async function listStoredIdentityImages() {
  const rows = await prisma.identityVerification.findMany({
    where: { status: { not: "pending" }, purgedAt: null, purgeAfter: { not: null } },
    orderBy: { purgeAfter: "asc" },
    include: WITH_ORG,
  });
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    orgName: r.organizer.orgName,
    email: r.organizer.user.email,
    status: r.status,
    purgeAfter: r.purgeAfter!.toISOString(),
    overdue: !r.retentionHold && r.purgeAfter!.getTime() < now - 86_400_000,
    retentionHold: r.retentionHold,
  }));
}

// Logs WHO opened WHICH image, then hands back the storage path. The browser
// signs it with the admin's own login, so this app never holds a key that can
// read every ID.
export async function requestIdentityFileView(
  id: string,
  kind: FileKind,
  adminId: string
): Promise<{ data: { path: string } } | { error: "not_found" | "no_file" }> {
  const r = await prisma.identityVerification.findUnique({
    where: { id },
    select: { frontPath: true, backPath: true, selfiePath: true },
  });
  if (!r) return { error: "not_found" };
  const path = kind === "front" ? r.frontPath : kind === "back" ? r.backPath : r.selfiePath;
  if (!path) return { error: "no_file" };
  await prisma.adminActionLog.create({
    data: { adminId, action: "identity_document_viewed", targetType: "IdentityVerification", targetId: id, notes: kind },
  });
  return { data: { path } };
}

export async function decideIdentity(
  id: string,
  adminId: string,
  input: { action: "approve" | "reject"; note?: string; over18?: boolean }
): Promise<{ ok: true } | { error: "not_found" | "not_pending" | "need_over18" | "need_note" }> {
  const row = await prisma.identityVerification.findUnique({ where: { id }, include: WITH_ORG });
  if (!row) return { error: "not_found" };
  if (row.status !== "pending") return { error: "not_pending" };
  const note = input.note?.trim() || null;
  if (input.action === "approve" && !input.over18) return { error: "need_over18" };
  if (input.action === "reject" && !note) return { error: "need_note" };

  const cfg = await getTrustConfig();
  const now = new Date();
  const approved = input.action === "approve";

  await prisma.$transaction([
    prisma.identityVerification.update({
      where: { id },
      data: {
        status: approved ? "approved" : "rejected",
        rejectionNote: approved ? null : note,
        over18Confirmed: approved,
        reviewedAt: now,
        reviewedById: adminId,
        validUntil: approved ? addMonths(now, cfg.idValidityMonths) : null,
        purgeAfter: purgeAfterFor(input.action, cfg, now),
        documentNumber: null,
        // Approved: keep the verified name, number and address (encrypted) so a
        // scam can be reported. Rejected: keep nothing but the keyed hash.
        ...(approved
          ? {
              detailsEnc:
                row.detailsEnc ??
                (row.documentNumber ? sealIdentityDetails({ documentNumber: row.documentNumber, address: "" }) : null),
            }
          : { fullName: null, detailsEnc: null }),
      },
    }),
    prisma.adminActionLog.create({
      data: { adminId, action: approved ? "identity_approved" : "identity_rejected", targetType: "IdentityVerification", targetId: id, notes: note },
    }),
  ]);

  await notify(row.organizer.user.id, {
    type: approved ? "identity_approved" : "identity_rejected",
    title: approved ? "Identity verified" : "Identity check not approved",
    body: approved
      ? "Your identity is verified. Your Verified badge (on a paid plan) and your event limits are updated."
      : `Your identity check wasn't approved: ${note}. You can submit again.`,
    href: "/organizer/dashboard/verification",
  });
  return { ok: true };
}

export async function setIdentityRetentionHold(id: string, hold: boolean, adminId: string) {
  const row = await prisma.identityVerification.findUnique({ where: { id }, select: { id: true, purgedAt: true } });
  if (!row) return { error: "not_found" as const };
  if (row.purgedAt) return { error: "already_deleted" as const };
  await prisma.$transaction([
    prisma.identityVerification.update({ where: { id }, data: { retentionHold: hold } }),
    prisma.adminActionLog.create({
      data: { adminId, action: hold ? "identity_retention_hold" : "identity_retention_release", targetType: "IdentityVerification", targetId: id },
    }),
  ]);
  return { ok: true as const };
}

// ---------- finding and revealing verified details (admin) ----------

export type IdentityHit = {
  id: string;
  orgName: string;
  email: string | null;
  fullName: string | null;
  docType: string;
  status: string;
  reviewedAt: string | null;
  validUntil: string | null;
  photosStored: { front: boolean; back: boolean; selfie: boolean };
  matchedBy: "number" | "text";
};

// Find an organizer by document number (exact, through the keyed fingerprint),
// or by name, organization or email (partial).
export async function searchIdentity(query: string): Promise<IdentityHit[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const secret = process.env.IDENTITY_HASH_SECRET;
  const asNumber = normalizeDocNumber(q);
  const looksLikeNumber = secret && /\d/.test(asNumber) && isPlausibleDocNumber(q);
  const numberHash = looksLikeNumber ? hashDocNumber(q, secret!) : null;

  const rows = await prisma.identityVerification.findMany({
    where: {
      OR: [
        ...(numberHash ? [{ idNumberHash: numberHash }] : []),
        { fullName: { contains: q, mode: "insensitive" as const } },
        { organizer: { orgName: { contains: q, mode: "insensitive" as const } } },
        { organizer: { user: { email: { contains: q, mode: "insensitive" as const } } } },
      ],
    },
    include: WITH_ORG,
    orderBy: { submittedAt: "desc" },
    take: 25,
  });
  return rows.map((r) => ({
    id: r.id,
    orgName: r.organizer.orgName,
    email: r.organizer.user.email,
    fullName: r.fullName,
    docType: r.docType,
    status: r.status,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    validUntil: r.validUntil?.toISOString() ?? null,
    photosStored: { front: Boolean(r.frontPath), back: Boolean(r.backPath), selfie: Boolean(r.selfiePath) },
    matchedBy: numberHash && r.idNumberHash === numberHash ? ("number" as const) : ("text" as const),
  }));
}

// Shows the kept name, number and address. Every reveal is logged with the admin.
export async function revealIdentityDetails(
  id: string,
  adminId: string
): Promise<
  | { data: { fullName: string | null; documentNumber: string | null; address: string | null; docType: string; status: string; reviewedAt: string | null } }
  | { error: "not_found" | "unavailable" }
> {
  const r = await prisma.identityVerification.findUnique({ where: { id } });
  if (!r) return { error: "not_found" };
  const d = readDetails(r);
  if (!r.fullName && !d.documentNumber && !d.address) return { error: "unavailable" };
  await prisma.adminActionLog.create({
    data: { adminId, action: "identity_details_viewed", targetType: "IdentityVerification", targetId: id },
  });
  return {
    data: {
      fullName: r.fullName,
      documentNumber: d.documentNumber,
      address: d.address,
      docType: r.docType,
      status: r.status,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
    },
  };
}

// ---------- retention (called by the scheduled job) ----------

// Deletes identity photos, then clears the paths. Files first: if deleting fails
// nothing is cleared, so the next run tries again. Never touches a record that is
// pending or on "keep longer". When it is time:
//   rejected: idRejectedRetentionDays after the decision.
//   approved: at the latest idRetentionDays after the decision, but SOONER once
//   the organizer has built a track record (enough fully confirmed prize events,
//   or an admin lifted the limits), and only while there is no payout hold and
//   no active ban. The verified name, number and address are kept either way.
export async function purgeDueIdentityFiles(removeFiles: (paths: string[]) => Promise<void>) {
  const now = new Date();
  const cfg = await getTrustConfig();
  const candidates = await prisma.identityVerification.findMany({
    where: { status: { not: "pending" }, purgedAt: null, retentionHold: false },
    select: {
      id: true,
      status: true,
      purgeAfter: true,
      frontPath: true,
      backPath: true,
      selfiePath: true,
      organizer: { select: { id: true, userId: true, limitsLifted: true } },
    },
    take: 500,
  });

  let purged = 0;
  for (const r of candidates) {
    const pastLatest = r.purgeAfter !== null && r.purgeAfter <= now;
    let due = pastLatest;
    if (!due && r.status === "approved") {
      const trusted = r.organizer.limitsLifted || (await countFullyConfirmedEvents(r.organizer.id)) >= cfg.graduationEvents;
      if (trusted) {
        const [holds, bans] = await Promise.all([
          getPayoutHolds(r.organizer.id, cfg.payoutGraceDays),
          prisma.accountBan.count({
            where: { userId: r.organizer.userId, liftedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          }),
        ]);
        due = holds.length === 0 && bans === 0;
      }
    }
    if (!due) continue;

    const paths = [r.frontPath, r.backPath, r.selfiePath].filter((p): p is string => Boolean(p));
    if (paths.length) await removeFiles(paths);
    await prisma.identityVerification.update({
      where: { id: r.id },
      data: { frontPath: null, backPath: null, selfiePath: null, purgedAt: now },
    });
    purged += 1;
  }
  return purged;
}

// Every path still referenced by a record, so the job can find abandoned uploads
// (a file uploaded but never submitted, or replaced by a resubmission).
export async function referencedIdentityPaths(): Promise<Set<string>> {
  const [rows, institutes] = await Promise.all([
    prisma.identityVerification.findMany({
      where: { purgedAt: null },
      select: { frontPath: true, backPath: true, selfiePath: true },
    }),
    // An institute's registration document lives in the same bucket, so it must count as
    // referenced or the abandoned-upload sweep would delete it after two days.
    prisma.institution.findMany({ where: { proofPath: { not: null } }, select: { proofPath: true } }),
  ]);
  return new Set([
    ...rows.flatMap((r) => [r.frontPath, r.backPath, r.selfiePath]),
    ...institutes.map((i) => i.proofPath),
  ].filter((p): p is string => Boolean(p)));
}
