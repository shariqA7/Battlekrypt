// GET /api/currencies — currencies organizers may currently choose (public)
import { NextResponse } from "next/server";
import { getEnabledCurrencies } from "@/lib/services/currencies";
import { currencyName } from "@/lib/money";

export async function GET() {
  const codes = await getEnabledCurrencies();
  return NextResponse.json(codes.map((code) => ({ code, name: currencyName(code) })));
}
