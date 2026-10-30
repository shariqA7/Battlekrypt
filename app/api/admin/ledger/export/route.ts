// GET /api/admin/ledger/export?preset=this_month|last_month|this_quarter|this_year|last_year|all|custom&from=YYYY-MM-DD&to=YYYY-MM-DD
// The ledger's income and expense rows for that period, as a CSV for your accountant.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { getLedger, ledgerToCsv } from "@/lib/services/ledger";
import { resolveRange } from "@/lib/ledger-math";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const sp = new URL(request.url).searchParams;
  const range = resolveRange(sp.get("preset") ?? undefined, sp.get("from") ?? undefined, sp.get("to") ?? undefined);
  const csv = ledgerToCsv(await getLedger(range, { all: true }));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="battlekrypt-ledger-${range.from.toISOString().slice(0, 10)}-to-${new Date(range.to.getTime() - 1).toISOString().slice(0, 10)}.csv"`,
    },
  });
}
