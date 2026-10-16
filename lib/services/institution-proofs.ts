// Admin-only: find tournament entries that carry a fresh student-ID photo, and
// open one when a dispute needs it. The photo itself stays in the private
// "institution-proofs" bucket; this only ever hands out its PATH after writing
// an audit-log row, so every look at a student's ID is on record.
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const PROOFS_PAGE_SIZE = 25;

// "%" and "_" are wildcards in the database's text search; an admin typing them
// means the literal character, so escape them (and the escape character itself).
const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

export interface ProofListQuery {
  q?: string; // tournament name, institute name, player name or e-mail
  status?: "pending" | "approved" | "rejected";
  page?: number;
}

export async function listInstitutionProofs({ q, status, page = 1 }: ProofListQuery) {
  const term = q?.trim() ? escapeLike(q.trim()) : undefined;
  const where: Prisma.RegistrationWhereInput = {
    institutionProofPath: { not: null },
    ...(status ? { status } : {}),
    ...(term
      ? {
          OR: [
            { tournament: { name: { contains: term, mode: "insensitive" } } },
            { institution: { name: { contains: term, mode: "insensitive" } } },
            { player: { user: { displayName: { contains: term, mode: "insensitive" } } } },
            { player: { user: { email: { contains: term, mode: "insensitive" } } } },
            { teamEntry: { name: { contains: term, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const safePage = Math.max(1, Math.floor(page) || 1);
  const [total, rows] = await Promise.all([
    prisma.registration.count({ where }),
    prisma.registration.findMany({
      where,
      orderBy: { registeredAt: "desc" },
      skip: (safePage - 1) * PROOFS_PAGE_SIZE,
      take: PROOFS_PAGE_SIZE,
      // NOTE: institutionProofPath is deliberately NOT selected: the list page
      // never sees it, only requestProofView does (after logging).
      select: {
        id: true,
        status: true,
        registeredAt: true,
        tournament: { select: { id: true, name: true } },
        institution: { select: { name: true } },
        teamEntry: { select: { name: true } },
        player: { select: { user: { select: { displayName: true, email: true } } } },
      },
    }),
  ]);
  return {
    total,
    page: safePage,
    pages: Math.max(1, Math.ceil(total / PROOFS_PAGE_SIZE)),
    rows: rows.map((r) => ({
      id: r.id,
      status: r.status,
      registeredAt: r.registeredAt,
      tournament: r.tournament,
      institute: r.institution?.name ?? null,
      entrant: r.teamEntry?.name ?? r.player?.user.displayName ?? "Unknown",
      email: r.player?.user.email ?? null,
    })),
  };
}

// Records WHO asked to see WHICH entry's ID photo, then returns the storage
// path. The browser opens it with the admin's own login (storage policy), so
// the app never holds a key that can read every photo.
export async function requestProofView(
  registrationId: string,
  adminId: string
): Promise<{ data: { path: string } } | { error: "not_found" | "no_proof" }> {
  const r = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: { institutionProofPath: true },
  });
  if (!r) return { error: "not_found" };
  if (!r.institutionProofPath) return { error: "no_proof" };
  await prisma.adminActionLog.create({
    data: {
      adminId,
      action: "institution_proof_viewed",
      targetType: "Registration",
      targetId: registrationId,
    },
  });
  return { data: { path: r.institutionProofPath } };
}
