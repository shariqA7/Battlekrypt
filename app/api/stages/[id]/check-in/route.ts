// GET  /api/stages/:id/check-in — my state for this LAN stage (null if n/a)
// POST /api/stages/:id/check-in — { code } self check-in at the stage's venue
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { banGuard } from "@/lib/services/bans";
import { getMyStageCheckIn, stageSelfCheckIn } from "@/lib/services/stages";

async function authedPlayer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { response: NextResponse.json({ error: { code: "unauthenticated", message: "Sign in required." } }, { status: 401 }) } as const;
  }
  const banned = await banGuard(user.id);
  if (banned) return { response: banned } as const;
  const player = await prisma.playerProfile.findUnique({ where: { userId: user.id } });
  if (!player) {
    return { response: NextResponse.json({ error: { code: "not_registered", message: "You're not registered for this tournament." } }, { status: 403 }) } as const;
  }
  return { player } as const;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authedPlayer();
  // Signed-out visitors and non-entrants just get "nothing to show" (200 null)
  // rather than a 401 that the browser logs as an error on every page view.
  if ("response" in auth) return NextResponse.json(null);
  return NextResponse.json(await getMyStageCheckIn(id, auth.player.id));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authedPlayer();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code : "";
  if (!code.trim()) {
    return NextResponse.json({ error: { code: "validation_error", message: "Enter the check-in code." } }, { status: 400 });
  }
  const result = await stageSelfCheckIn(id, auth.player.id, code);
  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : result.error === "wrong_code" ? 400 : result.error === "not_advanced" ? 403 : 409;
    return NextResponse.json({ error: { code: result.error, message: result.message ?? "Couldn't check in." } }, { status });
  }
  return NextResponse.json(result.data);
}
