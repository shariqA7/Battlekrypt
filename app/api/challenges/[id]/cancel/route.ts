import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/player-helpers";
import { cancelChallenge } from "@/lib/services/challenges";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;

  const result = await cancelChallenge(auth.user.id, id);
  if ("error" in result) {
    return NextResponse.json(
      {
        error: {
          code: result.error,
          message: result.error === "not_found" ? "Challenge not found." : "This challenge can't be cancelled any more.",
        },
      },
      { status: result.error === "not_found" ? 404 : 409 }
    );
  }
  return NextResponse.json(result.data);
}
