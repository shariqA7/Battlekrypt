// Admin-curated featured content (updates branch):
//  - dashboard carousel slides (a perk of paid organization / club plans)
//  - the "upcoming tournaments" featured list
//
// Slide eligibility is checked at READ time against the owner's current
// plan, so the carousel edge disappears by itself when a paid plan lapses
// and comes back on renewal — nothing to clean up.

import { prisma } from "@/lib/prisma";
import { resolvePlan } from "@/lib/plans";

export const FEATURED_ERRORS = {
  validation_error: { status: 400, message: "Invalid request." },
  not_found: { status: 404, message: "Not found." },
  not_eligible: {
    status: 409,
    message: "That account's plan doesn't include the dashboard carousel.",
  },
  already_featured: { status: 409, message: "That tournament is already featured." },
  tournament_not_featurable: {
    status: 409,
    message: "Only published, upcoming tournaments can be featured.",
  },
  too_many: { status: 409, message: "You can feature up to 12 tournaments." },
} as const;
export type FeaturedErrorCode = keyof typeof FEATURED_ERRORS;
type Fail = { error: FeaturedErrorCode; message?: string };
const fail = (error: FeaturedErrorCode, message?: string): Fail => ({ error, message });

export const MAX_FEATURED_TOURNAMENTS = 12;
const MAX_SLIDES = 20;

function cleanUrl(v: unknown, required: boolean): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return required ? undefined : null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  // Only http(s) links — never javascript: or data: URLs in a clickable slide.
  return /^https?:\/\/[^\s]+$/i.test(t) && t.length <= 500 ? t : undefined;
}

// Does the owner's CURRENT plan include the carousel perk?
async function ownerEligible(owner: {
  organizer?: { planCode: string; planExpiresAt: Date | null } | null;
  club?: { subscriptionPlanCode: string; planExpiresAt: Date | null; status: string } | null;
}) {
  if (owner.organizer) {
    return (await resolvePlan("organizer", owner.organizer)).limits.dashboardCarousel;
  }
  if (owner.club) {
    if (owner.club.status === "disbanded") return false;
    const plan = await resolvePlan("club", {
      planCode: owner.club.subscriptionPlanCode,
      planExpiresAt: owner.club.planExpiresAt,
    });
    return plan.limits.dashboardCarousel;
  }
  return true; // platform announcement
}

// ---------------- public reads ----------------

export async function listVisibleSlides() {
  const rows = await prisma.featuredSlide.findMany({
    where: { isActive: true },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    include: { organizer: true, club: true },
  });
  const visible = [];
  for (const s of rows) {
    if (await ownerEligible({ organizer: s.organizer, club: s.club })) {
      visible.push({
        id: s.id,
        imageUrl: s.imageUrl,
        title: s.title,
        text: s.text,
        linkUrl: s.linkUrl,
        ownerName: s.organizer?.orgName ?? s.club?.clubName ?? null,
      });
    }
  }
  return visible;
}

export async function listUpcomingFeatured() {
  const rows = await prisma.featuredTournament.findMany({
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: {
      tournament: {
        include: { game: { select: { name: true } }, organizer: { select: { orgName: true } } },
      },
    },
  });
  const now = new Date();
  return rows
    .map((r) => r.tournament)
    .filter(
      (t) =>
        ["published", "registration_open"].includes(t.status) && (!t.startAt || t.startAt > now)
    )
    .map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      bannerUrl: t.bannerUrl,
      startAt: t.startAt,
      gameName: t.game.name,
      organizerName: t.organizer.orgName,
    }));
}

// ---------------- admin ----------------

export async function listAllSlides() {
  const rows = await prisma.featuredSlide.findMany({
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    include: { organizer: true, club: true },
  });
  return Promise.all(
    rows.map(async (s) => ({
      id: s.id,
      imageUrl: s.imageUrl,
      title: s.title,
      text: s.text,
      linkUrl: s.linkUrl,
      isActive: s.isActive,
      position: s.position,
      organizerId: s.organizerId,
      clubId: s.clubId,
      ownerName: s.organizer?.orgName ?? s.club?.clubName ?? null,
      ownerKind: s.organizer ? ("organization" as const) : s.club ? ("club" as const) : null,
      // Slide exists but is currently hidden because the plan lapsed.
      eligible: await ownerEligible({ organizer: s.organizer, club: s.club }),
    }))
  );
}

// Accounts that can currently own a slide (their plan has the perk).
export async function listEligibleOwners() {
  const [orgs, clubs] = await Promise.all([
    prisma.organizerProfile.findMany({ orderBy: { orgName: "asc" } }),
    prisma.clubProfile.findMany({ where: { status: "approved" }, orderBy: { clubName: "asc" } }),
  ]);
  const out: { kind: "organization" | "club"; id: string; name: string }[] = [];
  for (const o of orgs) {
    if (await ownerEligible({ organizer: o })) out.push({ kind: "organization", id: o.id, name: o.orgName });
  }
  for (const c of clubs) {
    if (await ownerEligible({ club: c })) out.push({ kind: "club", id: c.id, name: c.clubName });
  }
  return out;
}

export async function createSlide(
  adminId: string,
  input: {
    imageUrl: unknown;
    title: unknown;
    text?: unknown;
    linkUrl?: unknown;
    organizerId?: unknown;
    clubId?: unknown;
  }
) {
  const imageUrl = cleanUrl(input.imageUrl, true);
  if (!imageUrl) return fail("validation_error", "Upload an image first.");
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title.length < 2 || title.length > 80) {
    return fail("validation_error", "Title must be 2–80 characters.");
  }
  const text = typeof input.text === "string" && input.text.trim() ? input.text.trim().slice(0, 200) : null;
  const linkUrl = cleanUrl(input.linkUrl, false);
  if (input.linkUrl && linkUrl === undefined) {
    return fail("validation_error", "The link must start with http:// or https://");
  }

  const organizerId = typeof input.organizerId === "string" && input.organizerId ? input.organizerId : null;
  const clubId = typeof input.clubId === "string" && input.clubId ? input.clubId : null;
  if (organizerId && clubId) return fail("validation_error", "Pick an organization or a club, not both.");

  if (organizerId) {
    const o = await prisma.organizerProfile.findUnique({ where: { id: organizerId } });
    if (!o) return fail("not_found", "Organization not found.");
    if (!(await ownerEligible({ organizer: o }))) return fail("not_eligible");
  }
  if (clubId) {
    const c = await prisma.clubProfile.findUnique({ where: { id: clubId } });
    if (!c) return fail("not_found", "Club not found.");
    if (!(await ownerEligible({ club: c }))) return fail("not_eligible");
  }

  if ((await prisma.featuredSlide.count()) >= MAX_SLIDES) {
    return fail("validation_error", `Up to ${MAX_SLIDES} slides — delete one first.`);
  }

  const last = await prisma.featuredSlide.aggregate({ _max: { position: true } });
  const slide = await prisma.featuredSlide.create({
    data: {
      imageUrl,
      title,
      text,
      linkUrl: linkUrl ?? null,
      organizerId,
      clubId,
      position: (last._max.position ?? -1) + 1,
    },
  });
  await prisma.adminActionLog.create({
    data: { adminId, action: "created_featured_slide", targetType: "FeaturedSlide", targetId: slide.id },
  });
  return { data: slide };
}

export async function updateSlide(
  id: string,
  adminId: string,
  input: { isActive?: unknown; title?: unknown; text?: unknown; linkUrl?: unknown; position?: unknown }
) {
  const slide = await prisma.featuredSlide.findUnique({ where: { id } });
  if (!slide) return fail("not_found");

  const data: { isActive?: boolean; title?: string; text?: string | null; linkUrl?: string | null; position?: number } = {};
  if (input.isActive !== undefined) {
    if (typeof input.isActive !== "boolean") return fail("validation_error");
    data.isActive = input.isActive;
  }
  if (input.title !== undefined) {
    const t = typeof input.title === "string" ? input.title.trim() : "";
    if (t.length < 2 || t.length > 80) return fail("validation_error", "Title must be 2–80 characters.");
    data.title = t;
  }
  if (input.text !== undefined) {
    data.text = typeof input.text === "string" && input.text.trim() ? input.text.trim().slice(0, 200) : null;
  }
  if (input.linkUrl !== undefined) {
    const l = cleanUrl(input.linkUrl, false);
    if (input.linkUrl && l === undefined) {
      return fail("validation_error", "The link must start with http:// or https://");
    }
    data.linkUrl = l ?? null;
  }
  if (input.position !== undefined) {
    if (typeof input.position !== "number" || !Number.isInteger(input.position) || input.position < 0 || input.position > 1000) {
      return fail("validation_error");
    }
    data.position = input.position;
  }
  if (Object.keys(data).length === 0) return fail("validation_error", "Nothing to update.");

  const updated = await prisma.featuredSlide.update({ where: { id }, data });
  await prisma.adminActionLog.create({
    data: { adminId, action: "updated_featured_slide", targetType: "FeaturedSlide", targetId: id },
  });
  return { data: updated };
}

export async function deleteSlide(id: string, adminId: string) {
  const slide = await prisma.featuredSlide.findUnique({ where: { id } });
  if (!slide) return fail("not_found");
  await prisma.featuredSlide.delete({ where: { id } });
  await prisma.adminActionLog.create({
    data: { adminId, action: "deleted_featured_slide", targetType: "FeaturedSlide", targetId: id },
  });
  return { data: { ok: true as const } };
}

export async function listFeaturedForAdmin() {
  const rows = await prisma.featuredTournament.findMany({
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { tournament: { select: { id: true, name: true, status: true, startAt: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    tournamentId: r.tournamentId,
    name: r.tournament.name,
    status: r.tournament.status,
    startAt: r.tournament.startAt,
  }));
}

// Tournaments an admin can still add: published/open, upcoming, not yet featured.
export async function listFeaturableTournaments() {
  return prisma.tournament.findMany({
    where: {
      status: { in: ["published", "registration_open"] },
      OR: [{ startAt: null }, { startAt: { gt: new Date() } }],
      featured: null,
    },
    orderBy: { startAt: "asc" },
    take: 100,
    select: { id: true, name: true, startAt: true },
  });
}

export async function addFeaturedTournament(adminId: string, tournamentId: unknown) {
  if (typeof tournamentId !== "string") return fail("validation_error");
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!t) return fail("not_found");
  if (
    !["published", "registration_open"].includes(t.status) ||
    (t.startAt && t.startAt <= new Date())
  ) {
    return fail("tournament_not_featurable");
  }
  if (await prisma.featuredTournament.findUnique({ where: { tournamentId } })) {
    return fail("already_featured");
  }
  const count = await prisma.featuredTournament.count();
  if (count >= MAX_FEATURED_TOURNAMENTS) return fail("too_many");

  const row = await prisma.featuredTournament.create({ data: { tournamentId, position: count } });
  await prisma.adminActionLog.create({
    data: { adminId, action: "featured_tournament", targetType: "Tournament", targetId: tournamentId },
  });
  return { data: row };
}

export async function removeFeaturedTournament(adminId: string, tournamentId: string) {
  const row = await prisma.featuredTournament.findUnique({ where: { tournamentId } });
  if (!row) return fail("not_found");
  await prisma.featuredTournament.delete({ where: { tournamentId } });
  await prisma.adminActionLog.create({
    data: { adminId, action: "unfeatured_tournament", targetType: "Tournament", targetId: tournamentId },
  });
  return { data: { ok: true as const } };
}
