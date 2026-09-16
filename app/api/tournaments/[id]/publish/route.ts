// POST /api/tournaments/:id/publish — organizer-only, requires prior admin approval
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { publishTournament } from "@/lib/services/tournaments";

export async function POST(
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

  const organizerProfile = await prisma.organizerProfile.findUnique({
    where: { userId: user.id },
  });

  if (!organizerProfile) {
    return NextResponse.json(
      { error: { code: "not_organizer", message: "Organizer profile required." } },
      { status: 403 }
    );
  }

  // Enforce the approval gate from the spec: an organizer can build drafts
  // while awaiting approval, but cannot publish until an admin approves them.
  const userRecord = await prisma.user.findUnique({ where: { id: user.id } });
  if (userRecord?.kycStatus !== "approved") {
    return NextResponse.json(
      {
        error: {
          code: "organizer_not_approved",
          message: "Your organizer account is pending admin approval.",
        },
      },
      { status: 403 }
    );
  }

  const result = await publishTournament(id, organizerProfile.id);

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
      { error: { code: "invalid_status", message: "Only draft tournaments can be published." } },
      { status: 409 }
    );
  }

  return NextResponse.json(result.data);
}
