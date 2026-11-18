// Daily job (see vercel.json): tops up every running scrim series so its next two weeks of
// sessions exist. Safe to run any number of times; it never creates a session twice.
//
// Call with:  Authorization: Bearer $CRON_SECRET   (Vercel Cron sends it itself)
import { NextResponse } from "next/server";
import { generateAllSeries } from "@/lib/services/scrim-series";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Unauthorized." } }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ...(await generateAllSeries(new Date())) });
}
