// GET    /api/templates/:id — the template's fields, shaped to pre-fill the
//        new-tournament form (used by "Start from Template")
// PATCH  /api/templates/:id — rename { name }
// DELETE /api/templates/:id — remove it (never touches tournaments already
//        created from it — they hold their own copies)
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { templateError } from "@/lib/template-helpers";
import { getTemplatePrefill, renameTemplate, deleteTemplate } from "@/lib/services/templates";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const result = await getTemplatePrefill(id, auth.organizerProfile.id);
  if ("error" in result) return templateError(result);
  return NextResponse.json(result.data);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const result = await renameTemplate(id, auth.organizerProfile.id, String(body.name ?? ""));
  if ("error" in result) return templateError(result);
  return NextResponse.json(result.data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const result = await deleteTemplate(id, auth.organizerProfile.id);
  if ("error" in result) return templateError(result);
  return NextResponse.json(result.data);
}
