// POST /api/reports — report an organizer after taking part in a paid or prized event
// body: { tournamentId, kind, description }
import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/player-helpers";
import { banGuard } from "@/lib/services/bans";
import { fileReport } from "@/lib/services/organizer-reports";
import type { ReportKindT } from "@/lib/report-kinds";

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser();
  if ("response" in auth) return auth.response;
  const banned = await banGuard(auth.user.id);
  if (banned) return banned;

  const b = await request.json().catch(() => ({}));
  const result = await fileReport({
    userId: auth.user.id,
    tournamentId: String(b.tournamentId ?? ""),
    kind: b.kind as ReportKindT,
    description: String(b.description ?? ""),
  });
  if ("error" in result) {
    const map: Record<string, { status: number; message: string }> = {
      feature_off: { status: 403, message: "Reports are switched off on this site." },
      not_found: { status: 404, message: "Tournament not found." },
      forbidden: { status: 403, message: "Only players who took part in this event can report it." },
      rate_limited: { status: 429, message: "You've sent several reports today. Try again tomorrow." },
      already_reported: { status: 409, message: "You already have an open report for this event." },
    };
    const m = map[result.error ?? ""] ?? { status: 400, message: "Invalid request." };
    return NextResponse.json({ error: { code: result.error, message: "message" in result && result.message ? result.message : m.message } }, { status: m.status });
  }
  return NextResponse.json({ id: result.data.id }, { status: 201 });
}
