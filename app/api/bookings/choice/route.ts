// POST /api/bookings/choice — a player decides what happens to a paid entry in a cancelled session.
// body: { registrationId, choice: "next" | "refund" }
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chooseForCancelled } from "@/lib/services/series-booking";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { code: "unauthorized", message: "Sign in first." } }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  const r = await chooseForCancelled(user.id, String(b.registrationId ?? ""), b.choice);
  if ("error" in r) {
    const status = r.error === "not_found" ? 404 : r.error === "forbidden" ? 403 : r.error === "already_chosen" ? 409 : 400;
    return NextResponse.json({ error: { code: r.error, message: r.message ?? "Could not save your choice." } }, { status });
  }
  return NextResponse.json(r.data);
}
