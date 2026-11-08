// GET    /api/admin/games/:id  - one game (view access)
// PATCH  /api/admin/games/:id  - change it (edit access)
// DELETE /api/admin/games/:id  - delete it (super admin only; refused while the game is in use)
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { cleanGameInput } from "@/lib/game-details";
import { gameError, validationError } from "@/lib/game-http";
import { deleteGame, getGameForAdmin, updateGame } from "@/lib/services/games-admin";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const auth = await requireAdmin("games", "view");
  if ("response" in auth) return auth.response;
  const game = await getGameForAdmin((await params).id);
  return game ? NextResponse.json(game) : gameError("not_found");
}

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await requireAdmin("games");
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => null);
  const clean = cleanGameInput(body, "update", process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!clean.ok) return validationError(clean.message);

  const result = await updateGame(auth.admin.id, (await params).id, clean.data);
  if ("error" in result) return gameError(result.error);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  // "staff" is the super-admin-only area: no switch can grant it.
  const auth = await requireAdmin("staff");
  if ("response" in auth) return auth.response;

  const result = await deleteGame(auth.admin.id, (await params).id);
  if ("error" in result) return gameError(result.error);
  return NextResponse.json({ ok: true });
}
