// DELETE /api/admin/tier-settings/:id — remove a country/region override.
// The mandatory "world" row per tier can't be deleted (see
// deleteTierSetting) since it's the fallback every resolution needs.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { deleteTierSetting } from "@/lib/services/competitive-tiers";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const result = await deleteTierSetting(id);
  if (result.error === "not_found") {
    return NextResponse.json(
      { error: { code: "not_found", message: "Tier setting not found." } },
      { status: 404 }
    );
  }
  if (result.error === "cannot_delete_world") {
    return NextResponse.json(
      {
        error: {
          code: "cannot_delete_world",
          message: "The world default for a tier can't be deleted, only edited.",
        },
      },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true });
}
