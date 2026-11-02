// Daily job (see vercel.json): deletes what has been kept long enough. The periods are in
// lib/retention.ts. Returns how many items each rule removed (or "failed").
//
// Call with:  Authorization: Bearer $CRON_SECRET   (Vercel Cron sends it itself)
import { NextResponse } from "next/server";
import { runRetention } from "@/lib/services/retention";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Unauthorized." } }, { status: 401 });
  }
  return NextResponse.json({ ok: true, removed: await runRetention() });
}
