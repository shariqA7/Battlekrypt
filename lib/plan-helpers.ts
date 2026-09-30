// Turns a plan-requests-service failure ({ error, message? }) into a JSON
// response with the right status code and a user-facing message.
import { NextResponse } from "next/server";
import { PLAN_REQUEST_ERRORS, type PlanRequestErrorCode } from "@/lib/services/plan-requests";

export function planError(result: { error: PlanRequestErrorCode; message?: string }) {
  const def = PLAN_REQUEST_ERRORS[result.error];
  return NextResponse.json(
    { error: { code: result.error, message: result.message ?? def.message } },
    { status: def.status }
  );
}
