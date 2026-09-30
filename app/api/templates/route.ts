// GET /api/templates — the signed-in organizer's own templates, newest first
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { listTemplates } from "@/lib/services/templates";

export async function GET() {
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  return NextResponse.json({ data: await listTemplates(auth.organizerProfile.id) });
}
