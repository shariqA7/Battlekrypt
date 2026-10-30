// POST /api/plans/change — { planCode }  An organization moves to another paid plan.
//   Upgrade: creates an invoice (credit for unused time; only the extra security fee) -> { kind: "upgrade", invoiceId }.
//   Downgrade: scheduled for when the current period ends -> { kind: "downgrade", effectiveOn }.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { banGuard } from "@/lib/services/bans";
import { requestPlanChange } from "@/lib/services/plan-changes";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { code: "unauthenticated", message: "Sign in required." } }, { status: 401 });
  const banned = await banGuard(user.id);
  if (banned) return banned;

  const org = await prisma.organizerProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!org) return NextResponse.json({ error: { code: "not_found", message: "You don't have an organizer account." } }, { status: 404 });
  const b = await request.json().catch(() => ({}));
  const r = await requestPlanChange({ organizerId: org.id, targetCode: String(b.planCode ?? "") });
  if ("error" in r) return NextResponse.json({ error: { code: r.error, message: r.message } }, { status: r.error === "not_found" ? 404 : 409 });
  return NextResponse.json(r.data);
}
