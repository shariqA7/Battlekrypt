"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/Button";

const field = "bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[36px]";

// The payment-gateway switch and the default tax on new invoices.
export default function BillingSettings({
  initial,
}: {
  initial: { paymentGatewayEnabled: boolean; invoiceTaxRate: number; invoiceTaxLabel: string; renewalInvoicesEnabled: boolean; renewalLeadDays: number };
}) {
  const router = useRouter();
  const [gateway, setGateway] = useState(initial.paymentGatewayEnabled);
  const [rate, setRate] = useState(String(initial.invoiceTaxRate));
  const [label, setLabel] = useState(initial.invoiceTaxLabel);
  const [renew, setRenew] = useState(initial.renewalInvoicesEnabled);
  const [lead, setLead] = useState(String(initial.renewalLeadDays));
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/invoice-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentGatewayEnabled: gateway, invoiceTaxRate: Number(rate), invoiceTaxLabel: label, renewalInvoicesEnabled: renew, renewalLeadDays: Number(lead) }),
    });
    const body = await res.json().catch(() => ({}));
    setMsg(res.ok ? { text: "Saved.", error: false } : { text: body.error?.message ?? "Could not save.", error: true });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  async function runNow() {
    setRunning(true);
    setRunMsg(null);
    const res = await fetch("/api/admin/invoices/renewals", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setRunning(false);
    if (!res.ok) return setRunMsg(body.error?.message ?? "Could not run the check.");
    if (body.disabled) return setRunMsg("Renewal invoices are switched off.");
    const created = body.created?.length ?? 0;
    const failed = body.failed?.length ?? 0;
    setRunMsg(`Checked ${body.checked} organization${body.checked === 1 ? "" : "s"}: ${created} invoice${created === 1 ? "" : "s"} created${failed ? `, ${failed} could not be created (${body.failed[0].orgName}: ${body.failed[0].message})` : ""}.`);
  }

  return (
    <section>
      <p className="font-sans font-medium text-bk-heading text-sm mb-3">Invoicing</p>
      <div className="bg-bk-surface border border-bk-border p-4 space-y-4">
        <div>
          <label className="flex items-center gap-2 font-sans text-[13px] text-bk-heading cursor-pointer">
            <input type="checkbox" checked={gateway} onChange={(e) => setGateway(e.target.checked)} />
            Payment gateway is on
          </label>
          <p className="font-sans text-[11px] text-bk-muted mt-1 pl-6">
            Off (now): organizations pay one of the methods below and upload a screenshot, and you mark the invoice paid. A gateway
            is not connected yet, so switching this on does not change how invoices are paid today.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block font-sans text-[12px] text-bk-muted">
            <span className="block mb-1">Default tax rate on new invoices (%)</span>
            <input type="number" min={0} max={100} step="any" value={rate} onChange={(e) => setRate(e.target.value)} className={`${field} w-32`} />
          </label>
          <label className="block font-sans text-[12px] text-bk-muted">
            <span className="block mb-1">Tax name on the invoice</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={30} className={`${field} w-40`} />
          </label>
          <button type="button" onClick={save} disabled={busy} className={buttonClass("primary", "sm")}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
        <p className="font-sans text-[11px] text-bk-muted">
          Tax is charged on the plan fee only, never on the refundable security fee. Each invoice keeps the rate it was issued with, so
          changing this never alters an old invoice. You can change the rate on a single invoice when you create it.
        </p>
        <div className="border-t border-bk-border pt-4 space-y-3">
          <label className="flex items-center gap-2 font-sans text-[13px] text-bk-heading cursor-pointer">
            <input type="checkbox" checked={renew} onChange={(e) => setRenew(e.target.checked)} />
            Create renewal invoices automatically
          </label>
          <label className="block font-sans text-[12px] text-bk-muted pl-6">
            <span className="block mb-1">Send the invoice this many days before the plan ends</span>
            <input type="number" min={1} max={60} step={1} value={lead} onChange={(e) => setLead(e.target.value)} className={`${field} w-24`} />
          </label>
          <p className="font-sans text-[11px] text-bk-muted pl-6">
            Runs every day. It applies to organizations with auto-renew on (switched on when an organization pays a plan invoice, and
            changeable on each organization&apos;s page). The invoice is for another period of the same plan at its current price, due the
            day the plan ends, with no security fee (the first one is still held). Paying it extends the plan from its end date.
          </p>
          <div className="pl-6 flex flex-wrap items-center gap-3">
            <button type="button" onClick={runNow} disabled={running} className={buttonClass("outline", "sm")}>{running ? "Checking…" : "Run the renewal check now"}</button>
            {runMsg && <span className="font-sans text-[12px] text-bk-body">{runMsg}</span>}
          </div>
        </div>
        {msg && <p className={`font-sans text-[12px] ${msg.error ? "text-bk-live" : "text-bk-teal"}`}>{msg.text}</p>}
      </div>
    </section>
  );
}
