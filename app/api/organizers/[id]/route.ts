// GET /api/organizers/:id — public organizer profile
import { NextResponse } from "next/server";
import { getPublicOrganizerProfile } from "@/lib/services/tournaments";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const profile = await getPublicOrganizerProfile(id);

  if (!profile) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Organizer not found." } },
      { status: 404 }
    );
  }

  return NextResponse.json(profile);
}
