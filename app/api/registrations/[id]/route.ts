// GET /api/registrations/:id — visible to the registrant or the tournament's organizer
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRegistrationById } from "@/lib/services/tournaments";

export async function GET(
  _request: Request,
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

  const result = await getRegistrationById(id, user.id);
  if (result.error === "not_found") {
    return NextResponse.json(
      { error: { code: "not_found", message: "Registration not found." } },
      { status: 404 }
    );
  }
  if (result.error === "forbidden") {
    return NextResponse.json(
      { error: { code: "forbidden", message: "You can't view this registration." } },
      { status: 403 }
    );
  }

  return NextResponse.json(result.data);
}
