// Donations and the community fund.
//
// People give to the PLATFORM; an admin decides how the money is used. There is no payment gateway:
// the donor pays outside the app and uploads proof, an admin approves it (which writes the payment
// ledger), and the approved money joins the fund. Admins then record each use of the fund as an
// allocation (a prize pool, a giveaway, running costs). Fund balance = approved donations - allocations.
//
// An admin can open a donation campaign (a goal, a deadline, a purpose) and choose per campaign
// whether only verified accounts (those on an active paid plan) may give.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isSupportedCurrency, sumByCurrency } from "@/lib/money";
import { getVerifiedStatus } from "@/lib/verified";
import { getFeatureFlags } from "@/lib/services/feature-flags";
import { notify } from "@/lib/services/notifications";
import { findProofMatches, queueProofCheck } from "@/lib/services/proof-fingerprints";
import { REFERENCE_REQUIRED_MESSAGE, parseReference } from "@/lib/proof-match";

export const MAX_DONATION = 10_000_000;
export const DONATIONS_PER_DAY = 5;
const DAY_MS = 86_400_000;

const num = (d: { toString(): string } | null | undefined) => (d == null ? 0 : Number(d.toString()));
const cents = (n: number) => Math.round(n * 100);

export type DonationError =
  | { error: "feature_off" | "not_found" | "not_verified" | "campaign_closed" | "rate_limited" | "not_pending" | "over_balance" | "conflict" }
  | { error: "validation_error"; message: string };

// ---------- settings ----------

export async function getDonationSettings() {
  const s = await prisma.siteSettings.findUnique({ where: { id: "singleton" }, select: { donationsVerifiedOnly: true, donationInstructions: true } });
  return { verifiedOnly: s?.donationsVerifiedOnly ?? false, instructions: s?.donationInstructions ?? null };
}

export async function updateDonationSettings(input: { verifiedOnly?: unknown; instructions?: unknown }): Promise<DonationError | { data: Awaited<ReturnType<typeof getDonationSettings>> }> {
  const data: { donationsVerifiedOnly?: boolean; donationInstructions?: string | null } = {};
  if (input.verifiedOnly !== undefined) {
    if (typeof input.verifiedOnly !== "boolean") return { error: "validation_error", message: "Invalid setting." };
    data.donationsVerifiedOnly = input.verifiedOnly;
  }
  if (input.instructions !== undefined) {
    if (input.instructions !== null && typeof input.instructions !== "string") return { error: "validation_error", message: "Invalid instructions." };
    const v = (input.instructions ?? "").toString().trim();
    if (v.length > 2000) return { error: "validation_error", message: "The instructions are too long (2000 characters at most)." };
    data.donationInstructions = v || null;
  }
  if (Object.keys(data).length === 0) return { error: "validation_error", message: "Nothing to update." };
  await prisma.siteSettings.upsert({ where: { id: "singleton" }, create: { id: "singleton", ...data }, update: data });
  return { data: await getDonationSettings() };
}

// ---------- the fund ----------

// Per currency: approved donations in, allocations out, what is left.
export async function getFundSummary(campaignId?: string) {
  const [inRows, outRows] = await Promise.all([
    prisma.donation.groupBy({ by: ["currency"], where: { status: "approved", ...(campaignId ? { campaignId } : {}) }, _sum: { amount: true } }),
    prisma.fundAllocation.groupBy({ by: ["currency"], where: campaignId ? { campaignId } : {}, _sum: { amount: true } }),
  ]);
  const raised = sumByCurrency(inRows.map((r) => ({ amount: num(r._sum.amount), currency: r.currency })));
  const allocated = sumByCurrency(outRows.map((r) => ({ amount: num(r._sum.amount), currency: r.currency })));
  const balance: Record<string, number> = {};
  for (const c of new Set([...Object.keys(raised), ...Object.keys(allocated)])) balance[c] = (cents(raised[c] ?? 0) - cents(allocated[c] ?? 0)) / 100;
  return { raised, allocated, balance };
}

// ---------- campaigns ----------

function slugify(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "campaign";
}

export async function createCampaign(input: {
  adminId: string;
  title: unknown;
  description: unknown;
  goalAmount?: unknown;
  currency: unknown;
  endsAt?: unknown;
  verifiedOnly?: unknown;
  status?: unknown;
}): Promise<DonationError | { data: { id: string; slug: string } }> {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (title.length < 3 || title.length > 80) return { error: "validation_error", message: "The title must be 3–80 characters." };
  if (description.length < 10 || description.length > 2000) return { error: "validation_error", message: "Describe what the money is for (10–2000 characters)." };
  if (!isSupportedCurrency(input.currency)) return { error: "validation_error", message: "Choose a supported currency." };
  let goal: number | null = null;
  if (input.goalAmount !== undefined && input.goalAmount !== null && input.goalAmount !== "") {
    goal = Number(input.goalAmount);
    if (!Number.isFinite(goal) || goal <= 0 || goal > 1_000_000_000) return { error: "validation_error", message: "The goal must be more than zero." };
  }
  let endsAt: Date | null = null;
  if (input.endsAt) {
    endsAt = new Date(String(input.endsAt));
    if (Number.isNaN(endsAt.getTime()) || endsAt <= new Date()) return { error: "validation_error", message: "The end date must be in the future." };
  }
  const status = input.status === "draft" ? "draft" : "active";

  const base = slugify(title);
  let slug = base;
  for (let i = 0; i < 5 && (await prisma.donationCampaign.findUnique({ where: { slug }, select: { id: true } })); i++) {
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }
  const row = await prisma.donationCampaign.create({
    data: { slug, title, description, goalAmount: goal, currency: input.currency, endsAt, status, verifiedOnly: input.verifiedOnly === true, createdById: input.adminId },
    select: { id: true, slug: true },
  });
  await prisma.adminActionLog.create({ data: { adminId: input.adminId, action: "created_donation_campaign", targetType: "DonationCampaign", targetId: row.id, notes: title } });
  return { data: row };
}

export async function updateCampaign(input: {
  adminId: string;
  id: string;
  status?: unknown;
  verifiedOnly?: unknown;
  title?: unknown;
  description?: unknown;
  endsAt?: unknown;
}): Promise<DonationError | { data: { id: string } }> {
  const data: Prisma.DonationCampaignUpdateInput = {};
  if (input.status !== undefined) {
    if (input.status !== "draft" && input.status !== "active" && input.status !== "closed") return { error: "validation_error", message: "Invalid status." };
    data.status = input.status;
  }
  if (input.verifiedOnly !== undefined) {
    if (typeof input.verifiedOnly !== "boolean") return { error: "validation_error", message: "Invalid setting." };
    data.verifiedOnly = input.verifiedOnly;
  }
  if (input.title !== undefined) {
    const t = typeof input.title === "string" ? input.title.trim() : "";
    if (t.length < 3 || t.length > 80) return { error: "validation_error", message: "The title must be 3–80 characters." };
    data.title = t;
  }
  if (input.description !== undefined) {
    const d = typeof input.description === "string" ? input.description.trim() : "";
    if (d.length < 10 || d.length > 2000) return { error: "validation_error", message: "Describe what the money is for (10–2000 characters)." };
    data.description = d;
  }
  if (input.endsAt !== undefined) {
    if (input.endsAt === null || input.endsAt === "") data.endsAt = null;
    else {
      const e = new Date(String(input.endsAt));
      if (Number.isNaN(e.getTime())) return { error: "validation_error", message: "Invalid end date." };
      data.endsAt = e;
    }
  }
  if (Object.keys(data).length === 0) return { error: "validation_error", message: "Nothing to update." };
  const exists = await prisma.donationCampaign.findUnique({ where: { id: input.id }, select: { id: true } });
  if (!exists) return { error: "not_found" };
  await prisma.$transaction([
    prisma.donationCampaign.update({ where: { id: input.id }, data }),
    prisma.adminActionLog.create({ data: { adminId: input.adminId, action: "updated_donation_campaign", targetType: "DonationCampaign", targetId: input.id, notes: Object.keys(data).join(", ") } }),
  ]);
  return { data: { id: input.id } };
}

// A campaign takes gifts while it is active and its end date hasn't passed.
const isOpen = (c: { status: string; endsAt: Date | null }, now = new Date()) => c.status === "active" && (!c.endsAt || c.endsAt > now);

// ---------- the Donate page ----------

export async function getDonateOverview(userId: string | null) {
  const now = new Date();
  const [flags, settings, fund, campaigns, allocations, supporters, verified] = await Promise.all([
    getFeatureFlags(),
    getDonationSettings(),
    getFundSummary(),
    prisma.donationCampaign.findMany({ where: { status: "active" }, orderBy: { createdAt: "desc" } }),
    prisma.fundAllocation.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { id: true, purpose: true, amount: true, currency: true, createdAt: true, tournament: { select: { name: true } } } }),
    prisma.donation.findMany({ where: { status: "approved", anonymous: false }, orderBy: { reviewedAt: "desc" }, take: 10, select: { id: true, user: { select: { displayName: true } }, campaign: { select: { title: true } } } }),
    userId ? getVerifiedStatus(userId) : Promise.resolve({ verified: false, via: null }),
  ]);
  const open = campaigns.filter((c) => isOpen(c, now));
  const raisedBy = await prisma.donation.groupBy({ by: ["campaignId"], where: { status: "approved", campaignId: { in: open.map((c) => c.id) } }, _sum: { amount: true }, _count: true });
  return {
    enabled: flags.donations,
    instructions: settings.instructions,
    generalVerifiedOnly: settings.verifiedOnly,
    viewer: { loggedIn: userId !== null, verified: verified.verified },
    fund,
    campaigns: open.map((c) => {
      const r = raisedBy.find((x) => x.campaignId === c.id);
      return {
        id: c.id,
        slug: c.slug,
        title: c.title,
        description: c.description,
        currency: c.currency,
        goal: c.goalAmount ? num(c.goalAmount) : null,
        raised: num(r?._sum.amount),
        donors: r?._count ?? 0,
        endsAt: c.endsAt?.toISOString() ?? null,
        verifiedOnly: c.verifiedOnly,
      };
    }),
    allocations: allocations.map((a) => ({ id: a.id, purpose: a.purpose, amount: num(a.amount), currency: a.currency, at: a.createdAt.toISOString(), tournament: a.tournament?.name ?? null })),
    supporters: supporters.map((s) => ({ id: s.id, name: s.user.displayName, campaign: s.campaign?.title ?? null })),
  };
}

export async function listMyDonations(userId: string) {
  const rows = await prisma.donation.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, amount: true, currency: true, status: true, adminNote: true, createdAt: true, campaign: { select: { title: true } } } });
  return rows.map((d) => ({ id: d.id, amount: num(d.amount), currency: d.currency, status: d.status, note: d.adminNote, at: d.createdAt.toISOString(), campaign: d.campaign?.title ?? null }));
}

// ---------- giving ----------

export async function createDonation(input: {
  userId: string;
  campaignId?: unknown;
  amount: unknown;
  currency: unknown;
  proofUrl: unknown;
  reference?: unknown;
  message?: unknown;
  anonymous?: unknown;
}): Promise<DonationError | { data: { id: string } }> {
  if (!(await getFeatureFlags()).donations) return { error: "feature_off" };

  const amount = typeof input.amount === "number" ? input.amount : Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_DONATION) return { error: "validation_error", message: "Enter an amount more than zero." };
  if (Math.round(amount * 100) !== amount * 100 && Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6) return { error: "validation_error", message: "Use at most two decimal places." };
  if (!isSupportedCurrency(input.currency)) return { error: "validation_error", message: "Choose a supported currency." };
  const proofUrl = typeof input.proofUrl === "string" ? input.proofUrl.trim() : "";
  if (!/^https:\/\/\S+$/.test(proofUrl) || proofUrl.length > 600) return { error: "validation_error", message: "Upload a screenshot of your payment." };
  const reference = parseReference(input.reference);
  if (!reference) return { error: "validation_error", message: REFERENCE_REQUIRED_MESSAGE };
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (message.length > 300) return { error: "validation_error", message: "Keep the message under 300 characters." };

  let verifiedOnly = (await getDonationSettings()).verifiedOnly;
  let campaignId: string | null = null;
  if (input.campaignId) {
    const c = await prisma.donationCampaign.findUnique({ where: { id: String(input.campaignId) } });
    if (!c) return { error: "not_found" };
    if (!isOpen(c)) return { error: "campaign_closed" };
    if (input.currency !== c.currency) return { error: "validation_error", message: `This campaign takes ${c.currency} only.` };
    campaignId = c.id;
    verifiedOnly = c.verifiedOnly;
  }
  if (verifiedOnly && !(await getVerifiedStatus(input.userId)).verified) return { error: "not_verified" };

  const recent = await prisma.donation.count({ where: { userId: input.userId, createdAt: { gte: new Date(Date.now() - DAY_MS) } } });
  if (recent >= DONATIONS_PER_DAY) return { error: "rate_limited" };

  const row = await prisma.donation.create({
    data: { userId: input.userId, campaignId, amount: amount.toFixed(2), currency: input.currency, proofUrl, reference: reference.display, message: message || null, anonymous: input.anonymous === true },
    select: { id: true },
  });
  // Flag (never block) a screenshot or transaction ID that was already used on another payment.
  await queueProofCheck({ kind: "donation", refId: row.id, userId: input.userId }, proofUrl, reference.key);
  return { data: row };
}

// ---------- admin: review ----------

export async function listPendingDonations() {
  const rows = await prisma.donation.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, displayName: true, email: true } }, campaign: { select: { title: true } } },
  });
  const [verified, duplicates] = await Promise.all([Promise.all(rows.map((r) => getVerifiedStatus(r.user.id))), findProofMatches("donation", rows.map((r) => r.id))]);
  return rows.map((d, i) => ({
    duplicate: duplicates.get(d.id) ?? null,
    id: d.id,
    donor: d.user.displayName,
    email: d.user.email ?? "",
    verified: verified[i].verified,
    amount: num(d.amount),
    currency: d.currency,
    proofUrl: d.proofUrl,
    reference: d.reference,
    message: d.message,
    anonymous: d.anonymous,
    campaign: d.campaign?.title ?? null,
    at: d.createdAt.toISOString(),
  }));
}

export async function listRecentDonations(limit = 15) {
  const rows = await prisma.donation.findMany({
    where: { status: { not: "pending" } },
    orderBy: { reviewedAt: "desc" },
    take: limit,
    include: { user: { select: { displayName: true } }, campaign: { select: { title: true } } },
  });
  return rows.map((d) => ({ id: d.id, donor: d.user.displayName, amount: num(d.amount), currency: d.currency, status: d.status, campaign: d.campaign?.title ?? null, note: d.adminNote, at: (d.reviewedAt ?? d.createdAt).toISOString() }));
}

export async function reviewDonation(input: { adminId: string; donationId: string; approve: boolean; note?: string }): Promise<DonationError | { data: { id: string; status: "approved" | "rejected" } }> {
  const note = input.note?.trim() ?? "";
  if (!input.approve && note.length < 3) return { error: "validation_error", message: "Say why you are rejecting it." };

  const d = await prisma.donation.findUnique({ where: { id: input.donationId }, include: { campaign: { select: { title: true } } } });
  if (!d) return { error: "not_found" };
  const now = new Date();

  const claimed = await prisma.$transaction(async (tx) => {
    // Only the first reviewer wins: two admins clicking at once can't approve (and book) it twice.
    const res = await tx.donation.updateMany({
      where: { id: d.id, status: "pending" },
      data: { status: input.approve ? "approved" : "rejected", adminNote: note || null, reviewedById: input.adminId, reviewedAt: now },
    });
    if (res.count === 0) return false;
    if (input.approve) {
      await tx.paymentRecord.create({
        data: {
          userId: d.userId,
          kind: "donation",
          amount: d.amount,
          currency: d.currency,
          method: "Donation",
          reference: d.id,
          note: d.campaign?.title ?? "General fund",
          recordedById: input.adminId,
        },
      });
    }
    await tx.adminActionLog.create({
      data: { adminId: input.adminId, action: input.approve ? "approved_donation" : "rejected_donation", targetType: "Donation", targetId: d.id, notes: `${num(d.amount)} ${d.currency}${note ? ` · ${note}` : ""}` },
    });
    return true;
  });
  if (!claimed) return { error: "not_pending" };

  await notify(d.userId, {
    type: "donation",
    title: input.approve ? "Thank you for your donation" : "Your donation wasn't approved",
    body: input.approve ? `We received your ${num(d.amount)} ${d.currency} donation${d.campaign ? ` for “${d.campaign.title}”` : ""}. It is now part of the community fund.` : `We couldn't approve your donation: ${note}`,
    href: "/donate",
  });
  return { data: { id: d.id, status: input.approve ? "approved" : "rejected" } };
}

// ---------- admin: using the fund ----------

// A serializable transaction that lost a race. Prisma reports it as P2034, and the pg driver
// adapter as a "TransactionWriteConflict" driver error, so accept both.
function isSerializationConflict(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") return true;
  const x = e as { message?: string; cause?: { kind?: string } } | null;
  return Boolean(x && (x.cause?.kind === "TransactionWriteConflict" || /TransactionWriteConflict|could not serialize/i.test(x.message ?? "")));
}

export async function allocateFund(input: {
  adminId: string;
  amount: unknown;
  currency: unknown;
  purpose: unknown;
  campaignId?: unknown;
  tournamentId?: unknown;
}): Promise<DonationError | { data: { id: string } }> {
  const amount = typeof input.amount === "number" ? input.amount : Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) return { error: "validation_error", message: "Enter an amount more than zero." };
  if (!isSupportedCurrency(input.currency)) return { error: "validation_error", message: "Choose a supported currency." };
  const purpose = typeof input.purpose === "string" ? input.purpose.trim() : "";
  if (purpose.length < 3 || purpose.length > 200) return { error: "validation_error", message: "Say what the money is used for (3–200 characters)." };
  const campaignId = input.campaignId ? String(input.campaignId) : null;
  const tournamentId = input.tournamentId ? String(input.tournamentId).trim() : null;

  if (tournamentId && !(await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true } }))) {
    return { error: "validation_error", message: "That tournament doesn't exist." };
  }
  const attempt = () =>
    prisma.$transaction(
      async (tx) => {
        if (campaignId) {
          const c = await tx.donationCampaign.findUnique({ where: { id: campaignId }, select: { currency: true } });
          if (!c) return { error: "not_found" as const };
          if (c.currency !== input.currency) return { error: "validation_error" as const, message: `That campaign is in ${c.currency}.` };
        }
        const sum = async (where: Prisma.DonationWhereInput, awhere: Prisma.FundAllocationWhereInput) => {
          const [i, o] = await Promise.all([tx.donation.aggregate({ where: { status: "approved", currency: input.currency as string, ...where }, _sum: { amount: true } }), tx.fundAllocation.aggregate({ where: { currency: input.currency as string, ...awhere }, _sum: { amount: true } })]);
          return cents(num(i._sum.amount)) - cents(num(o._sum.amount));
        };
        // Never spend more than the fund holds, nor more than the campaign raised.
        if (cents(amount) > (await sum({}, {}))) return { error: "over_balance" as const };
        if (campaignId && cents(amount) > (await sum({ campaignId }, { campaignId }))) return { error: "over_balance" as const };
        const row = await tx.fundAllocation.create({
          data: { amount: amount.toFixed(2), currency: input.currency as string, purpose, campaignId, tournamentId, allocatedById: input.adminId },
          select: { id: true },
        });
        await tx.adminActionLog.create({ data: { adminId: input.adminId, action: "allocated_fund", targetType: "FundAllocation", targetId: row.id, notes: `${amount} ${input.currency} · ${purpose}` } });
        return { data: row };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

  // Two admins allocating at the same moment: the database makes one of them retry. Try again a
  // few times (the second one then sees the first one's spending and may be refused honestly).
  for (let i = 0; i < 4; i++) {
    try {
      return await attempt();
    } catch (e) {
      if (!isSerializationConflict(e)) throw e;
    }
  }
  return { error: "conflict" };
}

export async function listAllocations(limit = 20) {
  const rows = await prisma.fundAllocation.findMany({ orderBy: { createdAt: "desc" }, take: limit, include: { campaign: { select: { title: true } }, tournament: { select: { name: true } } } });
  return rows.map((a) => ({ id: a.id, amount: num(a.amount), currency: a.currency, purpose: a.purpose, campaign: a.campaign?.title ?? null, tournament: a.tournament?.name ?? null, at: a.createdAt.toISOString() }));
}

export async function listCampaignsAdmin() {
  const rows = await prisma.donationCampaign.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  const raised = await prisma.donation.groupBy({ by: ["campaignId"], where: { status: "approved", campaignId: { in: rows.map((r) => r.id) } }, _sum: { amount: true }, _count: true });
  const spent = await prisma.fundAllocation.groupBy({ by: ["campaignId"], where: { campaignId: { in: rows.map((r) => r.id) } }, _sum: { amount: true } });
  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    description: c.description,
    currency: c.currency,
    goal: c.goalAmount ? num(c.goalAmount) : null,
    raised: num(raised.find((r) => r.campaignId === c.id)?._sum.amount),
    donors: raised.find((r) => r.campaignId === c.id)?._count ?? 0,
    allocated: num(spent.find((r) => r.campaignId === c.id)?._sum.amount),
    status: c.status,
    open: isOpen(c),
    verifiedOnly: c.verifiedOnly,
    endsAt: c.endsAt?.toISOString() ?? null,
  }));
}

// What the fund has paid toward one organizer's events (shown on the organization's admin page).
export async function getFundSupportFor(organizerId: string) {
  const rows = await prisma.fundAllocation.findMany({ where: { tournament: { organizerId } }, orderBy: { createdAt: "desc" }, include: { tournament: { select: { name: true } } } });
  return {
    totals: sumByCurrency(rows.map((r) => ({ amount: num(r.amount), currency: r.currency }))),
    items: rows.slice(0, 5).map((r) => ({ id: r.id, amount: num(r.amount), currency: r.currency, purpose: r.purpose, tournament: r.tournament?.name ?? "", at: r.createdAt.toISOString() })),
    count: rows.length,
  };
}
