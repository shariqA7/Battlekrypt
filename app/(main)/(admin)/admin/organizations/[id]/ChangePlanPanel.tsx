"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";

const field = "bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[36px]";

// Start a plan change for an organization on a paid plan: an upgrade creates the invoice (with the
// credit for unused time); a downgrade is scheduled for the end of the period.
export default function ChangePlanPanel({ organizerId, plans }: { organizerId: string; plans: { code: string; name: string }[] }) {
  const router = useRouter();
  const [code, setCode] = useState(plans[0]?.code ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean; href?: string } | null>(null);

  async function go() {
    if (!code || !confirm("Start this plan change for the organization?")) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/admin/organizations/${organizerId}/plan-change`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planCode: code }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ text: body.error?.message ?? "Could not change the plan.", error: true });
    if (body.kind === "upgrade") setMsg({ text: `Upgrade invoice ${body.invoiceNumber} created. The plan changes when it is paid.`, error: false, href: `/admin/invoices/${body.invoiceId}` });
    else setMsg({ text: `Scheduled: they keep their plan until ${new Date(body.effectiveOn).toLocaleDateString("en-GB", { timeZone: "UTC" })}, then move to the lower plan.`, error: false });
    router.refresh();
  }

  if (plans.length === 0) return null;
  return (
    <div className="font-sans text-[12px]">
      <p className="text-bk-muted mb-1">Change plan (upgrade with credit, or downgrade at renewal)</p>
      <div className="flex flex-wrap gap-2 items-center">
        <select value={code} onChange={(e) => setCode(e.target.value)} className={field}>
          {plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
        </select>
        <button type="button" onClick={go} disabled={busy} className={buttonClass("outline", "sm")}>{busy ? "…" : "Start change"}</button>
      </div>
      {msg && (
        <p className={`mt-1 ${msg.error ? "text-bk-live" : "text-bk-teal"}`}>
          {msg.text} {msg.href && <Link href={msg.href} className="underline">Open it</Link>}
        </p>
      )}
    </div>
  );
}
