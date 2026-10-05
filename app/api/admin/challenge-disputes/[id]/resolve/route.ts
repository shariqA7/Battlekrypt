// POST { outcome: "for_challenger" | "for_poster", note: string,
//        ban?: "none" | "permanent" | <days> }
// "ban" only applies to a payment dispute ruled for the challenger: the
// poster who didn't pay can be banned for the length chosen.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { resolveDispute, type BanChoice } from "@/lib/services/challenge-fulfillment";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  if (body.outcome !== "for_challenger" && body.outcome !== "for_poster") {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Choose who the ruling favours." } },
      { status: 400 }
    );
  }

  let ban: BanChoice = null;
  if (body.ban === "permanent") ban = { days: null };
  else if (body.ban !== undefined && body.ban !== "none" && body.ban !== null) {
    const days = Number(body.ban);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      return NextResponse.json(
        { error: { code: "validation_error", message: "Ban length must be 1–3650 days, or permanent." } },
        { status: 400 }
      );
    }
    ban = { days };
  }

  const result = await resolveDispute(auth.admin.id, id, {
    outcome: body.outcome,
    note: typeof body.note === "string" ? body.note : "",
    ban,
  });
  if ("error" in result) {
    return NextResponse.json(
      { error: { code: result.error, message: result.message } },
      { status: result.error === "not_found" ? 404 : result.error === "validation_error" ? 400 : 409 }
    );
  }
  return NextResponse.json(result.data);
}
