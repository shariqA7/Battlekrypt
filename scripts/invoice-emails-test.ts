// The invoice emails: what they say and that user-supplied text can't inject HTML.
// Run alone with: npx tsx scripts/invoice-emails-test.ts
import { invoiceIssuedEmail, invoicePaidEmail, invoiceProofRejectedEmail, type InvoiceEmailData } from "../lib/invoice-emails";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };

const base: InvoiceEmailData = {
  to: "owner@example.com",
  recipientName: "Ali",
  orgName: "FAST University",
  number: "BK-2026-0007",
  currency: "PKR",
  link: "https://battlekrypt.example/invoices/abc",
  dueDate: new Date("2026-12-05T00:00:00Z"),
  lines: [
    { description: "Pro plan — 30 days", amount: 5000 },
    { description: "Discount (10%)", amount: -500 },
    { description: "Security fee (refundable)", amount: 2000 },
  ],
  taxLabel: "GST",
  taxAmount: 450,
  gatewayFee: 0,
  total: 6950,
  issuerName: "BattleKrypt",
  footerNote: "Thank you for your business",
};

const issued = invoiceIssuedEmail(base);
ok("goes to the owner", issued.to === "owner@example.com");
ok("subject has the number and the total", issued.subject.includes("BK-2026-0007") && /6,?950/.test(issued.subject));
ok("body links to the invoice page", issued.html.includes(base.link) && issued.text.includes(base.link));
ok("body lists the lines, tax and total", issued.text.includes("Pro plan") && issued.text.includes("GST") && /Total: .*6,?950/.test(issued.text));
ok("mentions the due date", issued.text.includes("5 December 2026"));
ok("no due date means no due sentence", !invoiceIssuedEmail({ ...base, dueDate: null }).text.includes("It is due on"));
ok("includes the footer note and warns to pay only to the page's details", issued.text.includes("Thank you for your business") && /only pay/i.test(issued.text));
ok("renewal wording", /renew/i.test(invoiceIssuedEmail(base, "renewal").subject));
ok("upgrade wording", /upgrade/i.test(invoiceIssuedEmail(base, "upgrade").subject));
ok("waived lines are shown as waived", invoiceIssuedEmail({ ...base, lines: [{ description: "Security fee", amount: 2000, waived: true }] }).text.includes("Waived"));

const evil = invoiceIssuedEmail({ ...base, orgName: '<script>alert(1)</script>', recipientName: '"><img src=x>' });
ok("an organization name can't inject HTML", !evil.html.includes("<script>") && !evil.html.includes("<img src=x>"));

const paid = invoicePaidEmail({ ...base, paidAt: new Date("2026-11-20T00:00:00Z"), method: "Meezan Bank", reference: "TX123", planText: "Your Pro plan is active until 20 December 2026." });
ok("receipt says payment received with method and reference", paid.subject.includes("Payment received") && paid.text.includes("Meezan Bank") && paid.text.includes("TX123") && paid.text.includes("20 November 2026"));
ok("receipt carries the plan sentence", paid.text.includes("active until 20 December 2026"));
ok("receipt without a plan sentence is fine", !invoicePaidEmail({ ...base, paidAt: new Date(), method: null, reference: null, planText: null }).text.includes("undefined"));

const rej = invoiceProofRejectedEmail({ ...base, reason: "The amount doesn't match" });
ok("rejection explains why", rej.text.includes("The amount doesn't match") && rej.subject.includes("not accepted"));
ok("rejection reason is escaped in the HTML", invoiceProofRejectedEmail({ ...base, reason: "<b>x</b>" }).html.includes("&lt;b&gt;"));

if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log("all passed");
