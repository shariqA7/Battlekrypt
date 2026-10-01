import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { approveApplication } from "@/lib/services/org-applications";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const result = await approveApplication(id, auth.admin.id);
  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : 409;
    return NextResponse.json(
      { error: { code: result.error, message: "Couldn't approve this application." } },
      { status }
    );
  }
  return NextResponse.json(result.data);
}
