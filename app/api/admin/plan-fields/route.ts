// GET  /api/admin/plan-fields — admin-defined extra plan fields
// POST /api/admin/plan-fields — { audience, label, kind: "text"|"number"|"flag" }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { createPlanField, listPlanFields } from "@/lib/services/plan-fields";

const AUDIENCES = ["organizer", "club", "player"];

export async function GET() {
  const auth = await requireAdmin("plans", "view");
  if ("response" in auth) return auth.response;
  return NextResponse.json(await listPlanFields());
}

export async function POST(request: Request) {
  const auth = await requireAdmin("plans");
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  if (!AUDIENCES.includes(body.audience)) {
    return NextResponse.json({ error: { code: "validation_error", message: "Choose organizer, club or player." } }, { status: 400 });
  }
  const result = await createPlanField({ audience: body.audience, label: body.label, kind: body.kind });
  if ("error" in result) {
    return NextResponse.json({ error: { code: result.error, message: result.message } }, { status: 400 });
  }
  return NextResponse.json(result.data, { status: 201 });
}
