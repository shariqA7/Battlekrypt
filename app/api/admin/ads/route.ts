// POST /api/admin/ads — create a sponsor campaign (see lib/ad-rules.ts for the fields)
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { createCampaign } from "@/lib/services/ads";

export async function POST(request: Request) {
  const auth = await requireAdmin("ads");
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));
  const r = await createCampaign(auth.admin.id, b);
  if (r.error) return NextResponse.json({ error: { code: r.error, message: r.message } }, { status: 400 });
  return NextResponse.json(r.data, { status: 201 });
}
