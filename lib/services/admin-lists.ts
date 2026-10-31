// Paged, searchable lists for the admin Users and Clubs pages (10 at a time, see lib/admin-paging.ts).
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cursorArgs, toPage, type Page, type PageQuery } from "@/lib/admin-paging";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  organization: { name: string; plan: string } | null;
  club: { name: string; paid: boolean } | null;
  banned: boolean;
  joinedAt: string;
  lastSeen: { country: string | null; device: string } | null;
};

export async function listUsersPage({ q, cursor, limit }: PageQuery): Promise<Page<UserRow>> {
  const where: Prisma.UserWhereInput = q
    ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }, { phone: { contains: q, mode: "insensitive" } }] }
    : {};
  const rows = await prisma.user.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: limit + 1,
    ...cursorArgs(cursor),
    include: {
      organizerProfile: { select: { orgName: true, planCode: true } },
      clubProfile: { select: { clubName: true, status: true, subscriptionPlanCode: true } },
      bans: { where: { liftedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }, select: { id: true } },
      visits: { orderBy: { createdAt: "desc" }, take: 1, select: { country: true, deviceType: true } },
    },
  });
  const page = toPage(rows, limit);
  return {
    nextCursor: page.nextCursor,
    items: page.items.map((u) => ({
      id: u.id,
      name: u.displayName,
      email: u.email ?? "",
      avatarUrl: u.avatarUrl,
      isAdmin: u.isAdmin,
      organization: u.organizerProfile ? { name: u.organizerProfile.orgName, plan: u.organizerProfile.planCode.replace("organizer_", "") } : null,
      club: u.clubProfile && u.clubProfile.status !== "disbanded" ? { name: u.clubProfile.clubName, paid: u.clubProfile.subscriptionPlanCode !== "club_free" } : null,
      banned: u.bans.length > 0,
      joinedAt: u.createdAt.toISOString(),
      lastSeen: u.visits[0] ? { country: u.visits[0].country, device: u.visits[0].deviceType } : null,
    })),
  };
}

export type ClubRow = {
  id: string;
  name: string;
  logoUrl: string | null;
  ownerName: string;
  ownerEmail: string;
  status: string;
  paid: boolean;
  paymentPending: boolean;
  teams: number;
  players: number;
  createdAt: string;
};

export async function listClubsPage({ q, cursor, limit }: PageQuery): Promise<Page<ClubRow>> {
  const where: Prisma.ClubProfileWhereInput = q
    ? { OR: [{ clubName: { contains: q, mode: "insensitive" } }, { user: { email: { contains: q, mode: "insensitive" } } }, { user: { displayName: { contains: q, mode: "insensitive" } } }] }
    : {};
  const rows = await prisma.clubProfile.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: limit + 1,
    ...cursorArgs(cursor),
    include: { user: { select: { email: true, displayName: true } }, _count: { select: { teams: true, roster: true } } },
  });
  const page = toPage(rows, limit);
  return {
    nextCursor: page.nextCursor,
    items: page.items.map((c) => ({
      id: c.id,
      name: c.clubName,
      logoUrl: c.logoUrl,
      ownerName: c.user.displayName,
      ownerEmail: c.user.email ?? "",
      status: c.status,
      paid: c.subscriptionPlanCode !== "club_free",
      paymentPending: c.upgradeStatus === "pending",
      teams: c._count.teams,
      players: c._count.roster,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

export type TournamentHit = { id: string; name: string; organizer: string; status: string };

// For pickers (e.g. "which tournament does this fund money go to"), 10 at a time.
export async function searchTournamentsPage({ q, cursor, limit }: PageQuery): Promise<Page<TournamentHit>> {
  const where: Prisma.TournamentWhereInput = q
    ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }, { organizer: { orgName: { contains: q, mode: "insensitive" } } }] }
    : {};
  const rows = await prisma.tournament.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: limit + 1,
    ...cursorArgs(cursor),
    select: { id: true, name: true, status: true, organizer: { select: { orgName: true } } },
  });
  const page = toPage(rows, limit);
  return { nextCursor: page.nextCursor, items: page.items.map((t) => ({ id: t.id, name: t.name, organizer: t.organizer.orgName, status: t.status })) };
}
