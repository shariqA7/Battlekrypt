// POST /api/organizer/scrim-series — an organizer on a paid plan starts a recurring scrim series.
// body: { name, description?, bannerUrl?, gameId, mode, maxTeamSize?, maxTeams, playersPerRoom?, entryType,
//         entryFeeAmount?, entryFeeCurrency?, paymentInstructions?, rulesText?, timezone, daysOfWeek: number[],
//         slotTimes: string[], startDate: "YYYY-MM-DD", endDate?: "YYYY-MM-DD" | null, skipDates?: string[] }
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { banGuard } from "@/lib/services/bans";
import { createSeries } from "@/lib/services/scrim-series";

export async function POST(request: Request) {
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const ban = await banGuard(auth.organizerProfile.userId);
  if (ban) return ban;
  const b = await request.json().catch(() => ({}));
  const r = await createSeries(auth.organizerProfile.userId, b);
  if ("error" in r) {
    const status = r.error === "validation_error" || r.error === "plan_limit" || r.error === "trust_limit" ? 400 : 403;
    return NextResponse.json({ error: { code: r.error, message: r.message } }, { status });
  }
  return NextResponse.json(r.data, { status: 201 });
}
