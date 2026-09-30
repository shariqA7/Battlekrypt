// Turns a templates-service failure ({ error, message? }) into a JSON
// response with the right status code and a user-facing message.
import { NextResponse } from "next/server";
import { TEMPLATE_ERRORS, type TemplateErrorCode } from "@/lib/services/templates";

export function templateError(result: { error: TemplateErrorCode; message?: string }) {
  const def = TEMPLATE_ERRORS[result.error];
  return NextResponse.json(
    { error: { code: result.error, message: result.message ?? def.message } },
    { status: def.status }
  );
}
