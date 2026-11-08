// Shared replies for the admin games API, so both routes answer the same way.
import { NextResponse } from "next/server";

const MESSAGES: Record<string, [number, string]> = {
  not_found: [404, "Game not found."],
  name_taken: [409, "A game with that name already exists."],
  name_locked: [409, "This game's name can't be changed: it is part of the built-in game list. You can still hide it or edit everything else."],
  seeded: [409, "This game is part of the built-in game list and would come back on the next update. Hide it instead."],
  in_use: [409, "This game is used by tournaments, challenges, clubs or ratings, so it can't be deleted. Hide it instead."],
};

export function gameError(code: string) {
  const [status, message] = MESSAGES[code] ?? [400, "Something went wrong."];
  return NextResponse.json({ error: { code, message } }, { status });
}

export const validationError = (message: string) =>
  NextResponse.json({ error: { code: "validation_error", message } }, { status: 400 });
