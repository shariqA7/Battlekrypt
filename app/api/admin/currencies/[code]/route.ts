// PATCH /api/admin/currencies/:code — body { enabled: boolean }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { setCurrencyEnabled } from "@/lib/services/currencies";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: { code: "validation_error", message: "enabled must be true or false." } }, { status: 400 });
  }
  const upper = code.toUpperCase();
  const result = await setCurrencyEnabled(upper, body.enabled);
  if ("error" in result) {
    const message = result.error === "usd_required" ? "USD can't be switched off: tier prize-pool floors are measured in it." : "Unknown currency.";
    return NextResponse.json({ error: { code: result.error, message } }, { status: result.error === "unknown_currency" ? 404 : 409 });
  }
  await prisma.adminActionLog.create({
    data: { adminId: auth.admin.id, action: body.enabled ? "currency_enabled" : "currency_disabled", targetType: "Currency", targetId: upper },
  });
  return NextResponse.json(result.data);
}
