// GET    /api/tournaments/:id/institutions — host: co-hosts + guests of this tournament
// POST   /api/tournaments/:id/institutions — host adds one. Body: { institutionId, role: "cohost" | "guest" }
// DELETE /api/tournaments/:id/institutions — host removes one. Body: { institutionId }
// PATCH  /api/tournaments/:id/institutions — host sets an entry limit per institute.
//        Body: { institutionId: string | null, maxEntries: number | null }
//        institutionId null = the default for every institute; maxEntries null = no cap/override.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrganizer } from "@/lib/auth-helpers";
import {
  addTournamentInstitution,
  removeTournamentInstitution,
  listTournamentInstitutions,
  setInstitutionEntryLimit,
} from "@/lib/services/institutions";

const MESSAGES: Record<string, [number, string]> = {
  not_found: [404, "Not found."],
  forbidden: [403, "Only the host can manage institutes."],
  not_institution_tournament: [409, "Only institution-only tournaments can have co-hosts or guest institutes."],
  host_not_verified: [409, "Your institute must be verified by an admin first."],
  is_host: [409, "That's your own institute."],
  institution_not_found: [404, "That institute isn't available."],
  already_added: [409, "That institute is already added."],
  invalid_limit: [400, "The limit must be a whole number from 1 to 1000, or empty for no limit."],
  has_registrations: [409, "That institute already has players registered. Reject or move them first."],
};

function fail(code: string) {
  const [status, message] = MESSAGES[code] ?? [400, "Couldn't do that."];
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const t = await prisma.tournament.findUnique({ where: { id }, select: { organizerId: true } });
  if (!t) return fail("not_found");
  if (t.organizerId !== auth.organizerProfile.id) return fail("forbidden");
  return NextResponse.json({ data: await listTournamentInstitutions(id) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  if (typeof body.institutionId !== "string" || (body.role !== "cohost" && body.role !== "guest")) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "institutionId and role (cohost or guest) are required." } },
      { status: 400 }
    );
  }
  const result = await addTournamentInstitution(id, auth.organizerProfile.id, body.institutionId, body.role);
  if ("error" in result) return fail(result.error);
  return NextResponse.json(result.data, { status: 201 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  if (typeof body.institutionId !== "string") {
    return NextResponse.json(
      { error: { code: "validation_error", message: "institutionId is required." } },
      { status: 400 }
    );
  }
  const result = await removeTournamentInstitution(id, auth.organizerProfile.id, body.institutionId);
  if ("error" in result) return fail(result.error);
  return NextResponse.json(result.data);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  const institutionId = body.institutionId === null || body.institutionId === undefined ? null : body.institutionId;
  const maxEntries = body.maxEntries === null || body.maxEntries === undefined || body.maxEntries === "" ? null : Number(body.maxEntries);
  if (institutionId !== null && typeof institutionId !== "string") return fail("invalid_limit");
  const result = await setInstitutionEntryLimit(id, auth.organizerProfile.id, institutionId, maxEntries);
  if ("error" in result) return fail(result.error);
  return NextResponse.json(result.data);
}
