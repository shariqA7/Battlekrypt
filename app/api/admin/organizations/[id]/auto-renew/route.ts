// PATCH /api/admin/organizations/:id/auto-renew — { autoRenew: boolean }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { setAutoRenew } from "@/lib/services/renewals";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin("organizations");
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));
  if (typeof b.autoRenew !== "boolean") return NextResponse.json({ error: { code: "validation_error", message: "autoRenew must be true or false." } }, { status: 400 });
  const r = await setAutoRenew(auth.admin.id, id, b.autoRenew);
  if ("error" in r) return NextResponse.json({ error: { code: "not_found", message: "Organization not found." } }, { status: 404 });
  return NextResponse.json(r.data);
}
