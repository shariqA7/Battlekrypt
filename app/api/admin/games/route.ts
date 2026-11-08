// GET  /api/admin/games  - every game, hidden ones included (view access)
// POST /api/admin/games  - add a game (edit access)
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { cleanGameInput } from "@/lib/game-details";
import { gameError, validationError } from "@/lib/game-http";
import { createGame, listGamesForAdmin } from "@/lib/services/games-admin";

export async function GET() {
  const auth = await requireAdmin("games", "view");
  if ("response" in auth) return auth.response;
  return NextResponse.json({ data: await listGamesForAdmin() });
}

export async function POST(request: Request) {
  const auth = await requireAdmin("games");
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => null);
  const clean = cleanGameInput(body, "create", process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!clean.ok) return validationError(clean.message);

  const result = await createGame(auth.admin.id, clean.data as typeof clean.data & { name: string });
  if ("error" in result) return gameError(result.error);
  return NextResponse.json({ id: result.id }, { status: 201 });
}
