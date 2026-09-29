// PATCH /api/tournaments/:id/rules/:ruleId — edit a rule (send all its fields)
// DELETE /api/tournaments/:id/rules/:ruleId — remove a rule
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { ruleError } from "@/lib/rule-helpers";
import { updateTournamentRule, deleteTournamentRule } from "@/lib/services/rules";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
) {
  const { id, ruleId } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => null);
  const result = await updateTournamentRule(id, ruleId, auth.organizerProfile.id, body);
  if ("error" in result) return ruleError(result);
  return NextResponse.json(result.data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
) {
  const { id, ruleId } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const result = await deleteTournamentRule(id, ruleId, auth.organizerProfile.id);
  if ("error" in result) return ruleError(result);
  return NextResponse.json(result.data);
}
