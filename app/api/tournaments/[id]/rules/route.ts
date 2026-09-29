// POST /api/tournaments/:id/rules — add a rule (a suggestion or a custom one)
// { title?, description, action, penaltyPoints?, appliesToStageId?, suggestedRuleId? }
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { ruleError } from "@/lib/rule-helpers";
import { addTournamentRule } from "@/lib/services/rules";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => null);
  const result = await addTournamentRule(id, auth.organizerProfile.id, body);
  if ("error" in result) return ruleError(result);
  return NextResponse.json(result.data, { status: 201 });
}
