import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { cancelTournament } from "@/lib/services/tournaments";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const result = await cancelTournament(id, auth.organizerProfile.id);

  if (result.error === "not_found") {
    return NextResponse.json(
      { error: { code: "not_found", message: "Tournament not found." } },
      { status: 404 }
    );
  }
  if (result.error === "forbidden") {
    return NextResponse.json(
      { error: { code: "forbidden", message: "You don't own this tournament." } },
      { status: 403 }
    );
  }
  if (result.error === "invalid_status") {
    return NextResponse.json(
      { error: { code: "invalid_status", message: "This tournament is already completed or cancelled." } },
      { status: 409 }
    );
  }

  return NextResponse.json(result.data);
}
