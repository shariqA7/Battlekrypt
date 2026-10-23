// POST /api/admin/deposits/:id/resolve — { action: "refund" | "forfeit", amount?, note }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { resolveDeposit } from "@/lib/services/security-deposits";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const b = await request.json().catch(() => ({}));
  if (b.action !== "refund" && b.action !== "forfeit") {
    return NextResponse.json({ error: { code: "validation_error", message: "Choose refund or forfeit." } }, { status: 400 });
  }
  const result = await resolveDeposit({
    adminId: auth.admin.id,
    depositId: id,
    action: b.action,
    amount: b.amount === undefined || b.amount === "" ? undefined : Number(b.amount),
    note: String(b.note ?? ""),
  });
  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : 400;
    return NextResponse.json({ error: { code: result.error, message: "message" in result ? result.message : "Not found." } }, { status });
  }
  return NextResponse.json(result.data);
}
