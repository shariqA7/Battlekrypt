// PATCH /api/admin/club-settings — admin sets the payment instructions
// (amount + where to send it) shown on the club registration form.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { updateClubPaymentInstructions } from "@/lib/services/clubs";

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  if (typeof body.clubPaymentInstructions !== "string") {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "clubPaymentInstructions is required.",
        },
      },
      { status: 400 }
    );
  }

  const settings = await updateClubPaymentInstructions(body.clubPaymentInstructions.trim());
  return NextResponse.json(settings);
}
