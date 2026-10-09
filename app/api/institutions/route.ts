// GET /api/institutions?q= — verified institutes (what a player picks from)
import { NextResponse } from "next/server";
import { listVerifiedInstitutions } from "@/lib/services/institutions";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? undefined;
  return NextResponse.json({ data: await listVerifiedInstitutions(q) });
}
