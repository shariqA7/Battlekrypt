// GET /api/players/:id — public player profile (limited fields)
import { NextResponse } from "next/server";
import { getPublicPlayerProfile } from "@/lib/services/tournaments";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const profile = await getPublicPlayerProfile(id);

  if (!profile) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Player not found." } },
      { status: 404 }
    );
  }

  return NextResponse.json(profile);
}
