// Renewal rules that need no database. Run alone with: npx tsx scripts/renewals-test.ts
import { decideRenewal, type RenewalInput } from "../lib/renewal-rules";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };

const now = new Date("2026-11-10T09:00:00Z");
const base: RenewalInput = {
  now, leadDays: 7, autoRenew: true, onFreePlan: false, planExpiresAt: new Date("2026-11-15T12:00:00Z"),
  planSellable: true, alreadyInvoicedForThisExpiry: false, openPlanInvoice: false, pendingPlanRequest: false,
};
const r = (o: Partial<RenewalInput>) => decideRenewal({ ...base, ...o });

const go = r({});
ok("invoice is created inside the lead window, due the day the plan ends", go.ok && go.dueDate === "2026-11-15");
ok("not yet due outside the window", !r({ planExpiresAt: new Date("2026-11-20T00:00:00Z") }).ok);
ok("exactly at the edge of the window counts", r({ planExpiresAt: new Date("2026-11-17T09:00:00Z") }).ok);
const late = r({ planExpiresAt: new Date("2026-11-08T00:00:00Z") });
ok("a plan that just ended is still renewed, due today", late.ok && late.dueDate === "2026-11-10");
ok("not renewed after the grace period", !r({ planExpiresAt: new Date("2026-10-01T00:00:00Z") }).ok);
ok("auto-renew off", !r({ autoRenew: false }).ok);
ok("free plan", !r({ onFreePlan: true }).ok);
ok("no expiry date (an admin gave it with no end)", !r({ planExpiresAt: null }).ok);
ok("plan no longer for sale", !r({ planSellable: false }).ok);
ok("never invoiced twice for the same plan end", !r({ alreadyInvoicedForThisExpiry: true }).ok);
ok("an unpaid plan invoice blocks another", !r({ openPlanInvoice: true }).ok);
ok("a pending plan request blocks it", !r({ pendingPlanRequest: true }).ok);
const skipReason = (o: Partial<RenewalInput>) => { const d = r(o); return d.ok ? "" : d.reason; };
ok("reasons are reported", skipReason({ autoRenew: false }) === "auto_renew_off" && skipReason({ openPlanInvoice: true }) === "invoice_open");

if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log("all passed");
