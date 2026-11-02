"use client";

import { useState } from "react";

// Opens the NOWPayments page for this invoice, where the organization picks a coin and pays.
export default function CryptoPay({ invoiceId, amountLabel }: { invoiceId: string; amountLabel: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/invoices/${invoiceId}/crypto-checkout`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.url) {
      setBusy(false);
      return setError(body.error?.message ?? "Could not open the payment page.");
    }
    window.location.href = body.url;
  }

  return (
    <section className="bg-bk-surface border border-bk-gold-light/40 p-4">
      <h2 className="font-sans font-bold text-[15px] text-bk-heading mb-1">Pay online with crypto</h2>
      <p className="font-sans text-[12px] text-bk-muted mb-3">
        You&apos;ll be taken to NOWPayments to choose a coin and pay {amountLabel}. The network and processing fee is added there, before you pay, and your invoice is
        marked paid automatically once the payment is complete. Don&apos;t also pay by another method.
      </p>
      <button type="button" onClick={go} disabled={busy} className="bg-bk-primary text-bk-on-primary font-sans font-bold text-[11px] tracking-[0.8px] uppercase px-4 py-2 disabled:opacity-50">
        {busy ? "Opening…" : "Pay with crypto"}
      </button>
      {error && <p role="alert" className="font-sans text-[12px] text-bk-live mt-2">{error}</p>}
    </section>
  );
}
