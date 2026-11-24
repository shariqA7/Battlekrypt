// Daily job (see vercel.json): releases unpaid seats whose payment window has ended and moves each waiting
// list up. Live pages do this the moment someone opens them; this catches tournaments nobody opened.
//
// Call with:  Authorization: Bearer $CRON_SECRET   (Vercel Cron sends it itself)
import { NextResponse } from "next/server";
import { refreshAllSeats } from "@/lib/services/rooms";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Unauthorized." } }, { status: 401 });
  }
  const result = await refreshAllSeats();
  return NextResponse.json({ ok: true, ...result });
}
