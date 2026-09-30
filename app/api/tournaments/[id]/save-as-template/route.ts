// POST /api/tournaments/:id/save-as-template — { name } — snapshots this
// tournament's current config (and its rules/stage names) as a new,
// reusable template. Works at any tournament status.
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { templateError } from "@/lib/template-helpers";
import { createTemplateFromTournament } from "@/lib/services/templates";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const result = await createTemplateFromTournament(
    id,
    auth.organizerProfile.id,
    String(body.name ?? "")
  );
  if ("error" in result) return templateError(result);
  return NextResponse.json(result.data, { status: 201 });
}
