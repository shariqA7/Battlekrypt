"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SearchPicker from "@/components/admin/SearchPicker";
import { buttonClass } from "@/components/ui/Button";
import type { OrgRow } from "@/lib/services/admin-organizations";

export type PlanOption = { code: string; name: string; priceAmount: number | null; priceCurrency: string | null; depositAmount: number | null; days: number };

const field = "bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[36px]";

// Create an invoice for any existing organization (the ones made automatically on
// add / approval don't need this).
export default function CreateInvoiceForm({
  plans,
  currencies,
  defaultTaxRate,
  taxLabel,
}: {
  plans: PlanOption[];
  currencies: string[];
  defaultTaxRate: number;
  taxLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [org, setOrg] = useState<OrgRow | null>(null);
  const [planCode, setPlanCode] = useState("");
  const [currency, setCurrency] = useState("PKR");
  const [planAmount, setPlanAmount] = useState("");
  const [secFee, setSecFee] = useState(false);
  const [secAmount, setSecAmount] = useState("");
  const [hasDue, setHasDue] = useState(false);
  const [due, setDue] = useState("");
  const [tax, setTax] = useState(String(defaultTaxRate));
  const [note, setNote] = useState("");
  const [discType, setDiscType] = useState<"amount" | "percent">("percent");
  const [discValue, setDiscValue] = useState("");
  const [discReason, setDiscReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = plans.find((p) => p.code === planCode);
  const planPriceHere = plan && plan.priceAmount !== null && plan.priceCurrency === currency ? plan.priceAmount : null;
  const depositHere = plan && plan.depositAmount !== null && plan.priceCurrency === currency ? plan.depositAmount : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!org) return setError("Choose the organization.");
    if (!plan && !secFee) return setError("Choose a plan, tick the security fee, or both.");
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizerId: org.id,
        currency,
        planCode: plan?.code ?? null,
        planAmount: plan && planPriceHere === null ? Number(planAmount) : null,
        includeSecurityFee: secFee,
        securityFeeAmount: secFee && depositHere === null ? Number(secAmount) : null,
        dueDate: hasDue ? due : null,
        discountType: discType,
        discountValue: plan && discValue.trim() !== "" ? Number(discValue) : null,
        discountReason: discReason,
        taxRate: tax.trim() === "" ? null : Number(tax),
        note,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error?.message ?? "Could not create the invoice.");
    router.push(`/admin/invoices/${body.id}`);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("primary", "md")}>
        Create an invoice
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="bg-bk-surface border border-bk-border p-4 space-y-3">
      <p className="font-sans font-bold text-[13px] text-bk-heading">New invoice</p>

      {org ? (
        <p className="font-sans text-[13px] text-bk-heading">
          {org.name} <button type="button" onClick={() => setOrg(null)} className="text-bk-gold-light underline text-[12px] ml-2">change</button>
        </p>
      ) : (
        <SearchPicker<OrgRow>
          endpoint="/api/admin/organizations"
          label="Find the organization"
          placeholder="Search organizations"
          onPick={setOrg}
          renderItem={(o) => (
            <span className="block">
              <span className="block font-sans text-[13px] text-bk-heading truncate">{o.name}</span>
              <span className="block font-sans text-[11px] text-bk-muted truncate">{o.ownerName} · {o.planName}</span>
            </span>
          )}
        />
      )}

      <div className="flex flex-wrap items-end gap-3 font-sans text-[12px] text-bk-muted">
        <label className="block">
          <span className="block mb-1">Currency</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={field}>
            {currencies.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block mb-1">Plan</span>
          <select value={planCode} onChange={(e) => setPlanCode(e.target.value)} className={`${field} min-w-44`}>
            <option value="">No plan (security fee only)</option>
            {plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </label>
        {plan && (
          <label className="block">
            <span className="block mb-1">Plan amount ({currency})</span>
            {planPriceHere !== null ? (
              <span className="block h-[36px] leading-[36px] font-mono text-bk-heading">{planPriceHere.toLocaleString()}</span>
            ) : (
              <input type="number" min={1} step="any" value={planAmount} onChange={(e) => setPlanAmount(e.target.value)} className={`${field} w-36`} />
            )}
          </label>
        )}
        <label className="block">
          <span className="block mb-1">{taxLabel} %</span>
          <input type="number" min={0} max={100} step="any" value={tax} onChange={(e) => setTax(e.target.value)} className={`${field} w-24`} />
        </label>
      </div>
      {plan && planPriceHere === null && (
        <p className="font-sans text-[11px] text-bk-muted">
          {plan.name} is priced in {plan.priceCurrency ?? "another currency"}; enter its amount in {currency}.
        </p>
      )}

      {plan && (
        <div className="flex flex-wrap items-end gap-3 font-sans text-[12px] text-bk-muted">
          <label className="block">
            <span className="block mb-1">Discount on the plan fee (optional)</span>
            <span className="flex gap-2">
              <select value={discType} onChange={(e) => setDiscType(e.target.value as "amount" | "percent")} className={field}>
                <option value="percent">Percent %</option>
                <option value="amount">Amount ({currency})</option>
              </select>
              <input type="number" min={0} step="any" value={discValue} onChange={(e) => setDiscValue(e.target.value)} className={`${field} w-28`} />
            </span>
          </label>
          <label className="block">
            <span className="block mb-1">Reason shown on the invoice</span>
            <input value={discReason} onChange={(e) => setDiscReason(e.target.value)} maxLength={120} placeholder="e.g. Launch offer" className={`${field} w-56`} />
          </label>
        </div>
      )}

      <div className="font-sans text-[13px] text-bk-heading space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={secFee} onChange={(e) => setSecFee(e.target.checked)} /> Include a refundable security fee
        </label>
        {secFee && (
          <div className="pl-6">
            {depositHere !== null ? (
              <span className="font-mono">{depositHere.toLocaleString()} {currency}</span>
            ) : (
              <input type="number" min={1} step="any" value={secAmount} onChange={(e) => setSecAmount(e.target.value)} placeholder={`Amount in ${currency}`} className={`${field} w-44`} />
            )}
          </div>
        )}
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={hasDue} onChange={(e) => setHasDue(e.target.checked)} /> Set a due date
        </label>
        {hasDue && <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${field} ml-6`} />}
      </div>

      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note on the invoice (optional)" className={`${field} w-full`} />

      {error && <p role="alert" className="font-sans text-[12px] text-bk-live">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={buttonClass("primary", "sm")}>{busy ? "Creating…" : "Create invoice"}</button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className={buttonClass("outline", "sm")}>Cancel</button>
      </div>
    </form>
  );
}
