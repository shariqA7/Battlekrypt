// GET  /api/organizer/institution — the institute this organization runs (if any)
// POST /api/organizer/institution — register it. Body: { name }. Needs admin verification.
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { createInstitution, getInstitutionForOrganizer } from "@/lib/services/institutions";

export async function GET() {
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const row = await getInstitutionForOrganizer(auth.organizerProfile.id);
  return NextResponse.json(row ? { id: row.id, name: row.name, verified: row.verified } : null);
}

export async function POST(request: Request) {
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const result = await createInstitution(
    auth.organizerProfile.id,
    typeof body.name === "string" ? body.name : ""
  );
  if ("error" in result) {
    const messages: Record<string, string> = {
      invalid_name: "Enter your institute's name (2–120 characters).",
      already_has_institution: "Your organization already has an institute.",
      name_taken: "An institute with that name already exists.",
    };
    return NextResponse.json(
      { error: { code: result.error, message: messages[result.error] ?? "Couldn't create the institute." } },
      { status: result.error === "invalid_name" ? 400 : 409 }
    );
  }
  return NextResponse.json(result.data, { status: 201 });
}
