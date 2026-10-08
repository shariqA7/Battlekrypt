// GET /api/organizer/cohost-invites — tournaments this organization's institute is invited to co-host
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { listCoHostInvitations } from "@/lib/services/institutions";

export async function GET() {
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  return NextResponse.json({ data: await listCoHostInvitations(auth.organizerProfile.id) });
}
