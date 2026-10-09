// POST /api/registrations/:id/approve
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { approveRegistration } from "@/lib/services/tournaments";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const result = await approveRegistration(id, auth.organizerProfile.id);

  if (result.error === "not_found") {
    return NextResponse.json(
      { error: { code: "not_found", message: "Registration not found." } },
      { status: 404 }
    );
  }
  if (result.error === "forbidden") {
    return NextResponse.json(
      { error: { code: "forbidden", message: "You can't manage this registration." } },
      { status: 403 }
    );
  }

  return NextResponse.json({
    ...result.data,
    // True when a co-host approved a paid entry: the host still has to
    // confirm payment before the registration counts as approved.
    awaitingHostPayment: result.awaitingHostPayment,
  });
}
