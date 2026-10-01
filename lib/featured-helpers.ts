import { NextResponse } from "next/server";
import { FEATURED_ERRORS, type FeaturedErrorCode } from "@/lib/services/featured";

export function featuredError(result: { error: FeaturedErrorCode; message?: string }) {
  const def = FEATURED_ERRORS[result.error];
  return NextResponse.json(
    { error: { code: result.error, message: result.message ?? def.message } },
    { status: def.status }
  );
}
