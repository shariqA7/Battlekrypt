"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ChannelView = {
  key: string;
  label: string;
  description: string;
  kind: "manual" | "gateway";
  enabled: boolean;
  ready: boolean;
  note: string;
  currencies: readonly string[] | null;
};

// One on/off switch per way to pay. A switch saves straight away.
export default function PaymentChannels({ channels, webhookUrl }: { channels: ChannelView[]; webhookUrl: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function flip(c: ChannelView, enabled: boolean) {
    // Warn before switching off the last thing that can take a payment.
    const others = channels.some((o) => o.key !== c.key && o.enabled && o.ready);
    if (!enabled && !others && !confirm("This is the last way to pay that is switched on and ready. Organizations won't be able to pay new invoices until you switch another one on. Continue?")) return;
    setBusy(c.key);
    setError(null);
    const res = await fetch("/api/admin/payment-channels", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: c.key, enabled }) });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(body.error?.message ?? "Could not change it.");
    router.refresh();
  }

  return (
    <section>
      <p className="font-sans font-medium text-bk-heading text-sm mb-1">Ways to pay</p>
      <p className="font-sans text-[12px] text-bk-muted mb-3">
        Each way to pay has its own switch, and a change takes effect straight away. Organizations only see the ones that are switched on and ready. Switching one off
        stops new payments through it; a payment already in progress still completes, and you can always mark an invoice paid yourself.
      </p>
      <ul className="space-y-2">
        {channels.map((c) => (
          <li key={c.key} className="bg-bk-surface border border-bk-border p-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 max-w-xl">
              <p className="font-sans text-[13px] text-bk-heading font-medium">
                {c.label}
                <span className={`ml-2 text-[10px] uppercase tracking-[0.8px] ${c.enabled ? "text-bk-teal" : "text-bk-muted"}`}>{c.enabled ? "On" : "Off"}</span>
              </p>
              <p className="font-sans text-[12px] text-bk-muted">{c.description}</p>
              <p className={`font-sans text-[11px] mt-1 ${c.ready ? "text-bk-muted" : "text-bk-live"}`}>
                {c.ready ? "Ready" : "Not ready"}: {c.note}
                {c.currencies ? ` · ${c.currencies.join(", ")} invoices only` : ""}
              </p>
              {c.kind === "gateway" && (
                <p className="font-sans text-[11px] text-bk-muted mt-0.5">
                  Notification (IPN) address to set in the provider&apos;s dashboard: <span className="font-mono break-all">{webhookUrl}</span>
                </p>
              )}
              {c.enabled && !c.ready && <p className="font-sans text-[11px] text-bk-live mt-0.5">It is on, but organizations won&apos;t see it until it is ready.</p>}
            </div>
            <label className="flex items-center gap-2 font-sans text-[12px] text-bk-heading cursor-pointer shrink-0">
              <input type="checkbox" checked={c.enabled} disabled={busy !== null} onChange={(e) => flip(c, e.target.checked)} />
              {busy === c.key ? "Saving…" : c.enabled ? "Switched on" : "Switched off"}
            </label>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="font-sans text-[12px] text-bk-live mt-2">{error}</p>}
    </section>
  );
}
