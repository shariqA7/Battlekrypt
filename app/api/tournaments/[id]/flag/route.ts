// POST /api/tournaments/:id/flag — any authenticated user can report a tournament
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { flagTournament } from "@/lib/services/tournaments";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "Sign in required." } },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  if (!body.reason) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "reason is required." } },
      { status: 400 }
    );
  }

  const result = await flagTournament(id, user.id, body.reason);
  if (result.error === "not_found") {
    return NextResponse.json(
      { error: { code: "not_found", message: "Tournament not found." } },
      { status: 404 }
    );
  }

  return NextResponse.json(result.data, { status: 201 });
}
