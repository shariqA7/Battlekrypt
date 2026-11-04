// GET   /api/admin/payment-channels — every way to pay with its switch and whether it is ready
// PATCH /api/admin/payment-channels — { key: "manual" | "nowpayments", enabled: boolean }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { getChannelsView, setChannelEnabled } from "@/lib/services/payment-channels";

export async function GET() {
  const auth = await requireAdmin("payments", "view");
  if ("response" in auth) return auth.response;
  return NextResponse.json({ items: await getChannelsView() });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin("payments");
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));
  const r = await setChannelEnabled(auth.admin.id, b?.key, b?.enabled);
  if ("error" in r) return NextResponse.json({ error: { code: r.error, message: r.message } }, { status: 400 });
  return NextResponse.json(r.data);
}
