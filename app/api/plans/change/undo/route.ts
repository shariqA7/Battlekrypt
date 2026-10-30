// POST /api/plans/change/undo — cancel a downgrade that is still waiting for the period to end.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { undoPendingDowngrade } from "@/lib/services/plan-changes";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { code: "unauthenticated", message: "Sign in required." } }, { status: 401 });
  const org = await prisma.organizerProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!org) return NextResponse.json({ error: { code: "not_found", message: "You don't have an organizer account." } }, { status: 404 });
  const r = await undoPendingDowngrade(org.id);
  if ("error" in r) return NextResponse.json({ error: { code: r.error, message: r.message } }, { status: 409 });
  return NextResponse.json(r.data);
}
