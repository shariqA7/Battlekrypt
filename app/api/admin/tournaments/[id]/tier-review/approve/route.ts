import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { approveTierReview } from "@/lib/services/tournaments";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const result = await approveTierReview(id, auth.admin.id);
  if (result.error === "not_found") {
    return NextResponse.json(
      { error: { code: "not_found", message: "Tournament not found." } },
      { status: 404 }
    );
  }
  if (result.error === "not_pending") {
    return NextResponse.json(
      { error: { code: "not_pending", message: "This tournament isn't awaiting tier review." } },
      { status: 409 }
    );
  }

  return NextResponse.json(result.data);
}
