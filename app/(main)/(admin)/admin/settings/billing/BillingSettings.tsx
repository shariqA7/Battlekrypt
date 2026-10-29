"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/Button";

const field = "bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[36px]";

// The payment-gateway switch and the default tax on new invoices.
export default function BillingSettings({
  initial,
}: {
  initial: { paymentGatewayEnabled: boolean; invoiceTaxRate: number; invoiceTaxLabel: string };
}) {
  const router = useRouter();
  const [gateway, setGateway] = useState(initial.paymentGatewayEnabled);
  const [rate, setRate] = useState(String(initial.invoiceTaxRate));
  const [label, setLabel] = useState(initial.invoiceTaxLabel);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/invoice-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentGatewayEnabled: gateway, invoiceTaxRate: Number(rate), invoiceTaxLabel: label }),
    });
    const body = await res.json().catch(() => ({}));
    setMsg(res.ok ? { text: "Saved.", error: false } : { text: body.error?.message ?? "Could not save.", error: true });
    setBusy(false);
    if (res.ok) router.refresh();
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
        {msg && <p className={`font-sans text-[12px] ${msg.error ? "text-bk-live" : "text-bk-teal"}`}>{msg.text}</p>}
      </div>
    </section>
  );
}
