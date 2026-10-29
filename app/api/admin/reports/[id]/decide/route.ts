// POST /api/admin/reports/:id/decide — { outcome: "upheld" | "dismissed", note }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { decideReport } from "@/lib/services/organizer-reports";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const b = await request.json().catch(() => ({}));
  if (b.outcome !== "upheld" && b.outcome !== "dismissed") {
    return NextResponse.json({ error: { code: "validation_error", message: "Choose upheld or dismissed." } }, { status: 400 });
  }
  const result = await decideReport({ adminId: auth.admin.id, reportId: id, outcome: b.outcome, note: String(b.note ?? "") });
  if ("error" in result) {
    return NextResponse.json({ error: { code: result.error, message: "message" in result && result.message ? result.message : "Report not found." } }, { status: result.error === "not_found" ? 404 : 400 });
  }
  return NextResponse.json(result.data);
}
