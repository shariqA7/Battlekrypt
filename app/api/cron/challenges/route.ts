// Optional: lets a scheduler (e.g. Vercel Cron) move challenge deadlines along
// even when nobody is visiting the site. Deadlines are also handled whenever
// challenge pages are read, so this only tightens the timing.
//
// Call with:  Authorization: Bearer $CRON_SECRET
import { NextResponse } from "next/server";
import { expireStaleChallenges } from "@/lib/services/challenges";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Unauthorized." } }, { status: 401 });
  }
  await expireStaleChallenges();
  return NextResponse.json({ ok: true });
}
