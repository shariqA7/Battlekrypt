// POST /api/payouts/:id/respond — a winner confirms they were paid, or says
// they weren't. body: { response: "confirmed" | "disputed", note? }
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { banGuard } from "@/lib/services/bans";
import { respondToPayout } from "@/lib/services/organizer-trust";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: { code: "unauthenticated", message: "Sign in required." } }, { status: 401 });
  }
  const banned = await banGuard(user.id);
  if (banned) return banned;

  const body = await request.json().catch(() => ({}));
  if (body.response !== "confirmed" && body.response !== "disputed") {
    return NextResponse.json({ error: { code: "validation_error", message: "Choose confirmed or disputed." } }, { status: 400 });
  }
  const result = await respondToPayout({ userId: user.id, payoutId: id, response: body.response, note: typeof body.note === "string" ? body.note : undefined });
  if ("error" in result) {
    const map: Record<string, { status: number; message: string }> = {
      not_found: { status: 404, message: "Payout not found." },
      forbidden: { status: 403, message: "This isn't your prize." },
      already_confirmed: { status: 409, message: "You already confirmed this payout." },
      validation_error: { status: 400, message: "message" in result && result.message ? result.message : "Invalid request." },
    };
    const m = map[result.error ?? "validation_error"] ?? { status: 400, message: "Request failed." };
    return NextResponse.json({ error: { code: result.error, message: m.message } }, { status: m.status });
  }
  return NextResponse.json(result.data);
}
