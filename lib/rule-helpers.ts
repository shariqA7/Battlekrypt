// Turns a rules-service failure ({ error, message? }) into a JSON response
// with the right status code and a user-facing message.
import { NextResponse } from "next/server";
import { RULE_ERRORS, type RuleErrorCode } from "@/lib/services/rules";

export function ruleError(result: { error: RuleErrorCode; message?: string }) {
  const def = RULE_ERRORS[result.error];
  return NextResponse.json(
    { error: { code: result.error, message: result.message ?? def.message } },
    { status: def.status }
  );
}
