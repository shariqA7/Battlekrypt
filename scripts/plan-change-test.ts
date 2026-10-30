// Plan change rules that need no database. Run alone with: npx tsx scripts/plan-change-test.ts
import { classifyChange, computeUpgradeCredit } from "../lib/plan-change-rules";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };

const pro = { code: "organizer_pro", price: 3000, currency: "PKR", sortOrder: 1 };
const biz = { code: "organizer_business", price: 8000, currency: "PKR", sortOrder: 2 };
ok("a dearer plan is an upgrade", classifyChange(pro, biz) === "upgrade");
ok("a cheaper plan is a downgrade", classifyChange(biz, pro) === "downgrade");
ok("the same plan is not a change", classifyChange(pro, pro) === "same");
ok("different currencies fall back to the plan order", classifyChange({ ...pro, currency: "PKR" }, { ...biz, price: 40, currency: "USD" }) === "upgrade" && classifyChange({ ...biz, currency: "PKR" }, { ...pro, price: 10, currency: "USD", sortOrder: 1 }) === "downgrade");

const now = new Date("2026-11-20T00:00:00Z");
const base = { oldPrice: 3000, oldCurrency: "PKR", oldPeriodDays: 30, expiresAt: new Date("2026-11-30T00:00:00Z"), now, newFee: 8000, newCurrency: "PKR" };
const c = computeUpgradeCredit(base);
ok("10 of 30 days left on 3000 is a credit of 1000", c.credit === 1000 && c.remainingDays === 10);
ok("a part day counts as a day left", computeUpgradeCredit({ ...base, expiresAt: new Date("2026-11-30T06:00:00Z") }).remainingDays === 11);
ok("no credit once the plan has run out", computeUpgradeCredit({ ...base, expiresAt: new Date("2026-11-19T00:00:00Z") }).credit === 0);
ok("no credit when it has no end date (given free)", computeUpgradeCredit({ ...base, expiresAt: null }).credit === 0);
ok("no credit when the old plan has no price", computeUpgradeCredit({ ...base, oldPrice: null }).credit === 0);
ok("no credit across currencies", computeUpgradeCredit({ ...base, oldCurrency: "USD" }).credit === 0);
ok("credit never exceeds the period", computeUpgradeCredit({ ...base, expiresAt: new Date("2027-03-01T00:00:00Z") }).credit === 3000);
const capped = computeUpgradeCredit({ ...base, newFee: 3500, oldPrice: 6000, expiresAt: new Date("2026-12-20T00:00:00Z") });
ok("credit is kept below the new fee", capped.credit < 3500 && capped.credit > 0);

if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log("all passed");
