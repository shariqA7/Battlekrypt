"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/Button";
import { LAUNCH_CURRENCIES } from "@/lib/money";
import { PAYMENT_METHOD_TYPES, type PaymentMethodTypeValue } from "@/lib/payment-method-rules";

export type MethodData = {
  id: string;
  type: PaymentMethodTypeValue;
  name: string;
  currencies: string[];
  bankName: string | null;
  accountTitle: string | null;
  accountNumber: string | null;
  iban: string | null;
  branch: string | null;
  swiftCode: string | null;
  walletNumber: string | null;
  cryptoAsset: string | null;
  cryptoNetwork: string | null;
  cryptoAddress: string | null;
  cryptoMemo: string | null;
  instructions: string | null;
  isActive: boolean;
};

const field = "bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[36px] w-full";
const typeLabel = (t: string) => PAYMENT_METHOD_TYPES.find((x) => x.value === t)?.label ?? t;

type Form = {
  type: PaymentMethodTypeValue;
  name: string;
  currencies: string[];
  bankName: string;
  accountTitle: string;
  accountNumber: string;
  iban: string;
  branch: string;
  swiftCode: string;
  walletNumber: string;
  cryptoAsset: string;
  cryptoNetwork: string;
  cryptoAddress: string;
  cryptoMemo: string;
  instructions: string;
};

const blank: Form = {
  type: "bank", name: "", currencies: ["PKR"], bankName: "", accountTitle: "", accountNumber: "", iban: "", branch: "",
  swiftCode: "", walletNumber: "", cryptoAsset: "USDT", cryptoNetwork: "", cryptoAddress: "", cryptoMemo: "", instructions: "",
};

const fromMethod = (m: MethodData): Form => ({
  type: m.type, name: m.name, currencies: m.currencies, bankName: m.bankName ?? "", accountTitle: m.accountTitle ?? "",
  accountNumber: m.accountNumber ?? "", iban: m.iban ?? "", branch: m.branch ?? "", swiftCode: m.swiftCode ?? "",
  walletNumber: m.walletNumber ?? "", cryptoAsset: m.cryptoAsset ?? "", cryptoNetwork: m.cryptoNetwork ?? "",
  cryptoAddress: m.cryptoAddress ?? "", cryptoMemo: m.cryptoMemo ?? "", instructions: m.instructions ?? "",
});

function summary(m: MethodData): string {
  if (m.type === "bank") return [m.bankName, m.accountTitle, m.iban ?? m.accountNumber].filter(Boolean).join(" · ");
  if (m.type === "wallet") return [m.accountTitle, m.walletNumber].filter(Boolean).join(" · ");
  if (m.type === "crypto") return [m.cryptoAsset, m.cryptoNetwork, m.cryptoAddress].filter(Boolean).join(" · ");
  return m.instructions?.slice(0, 80) ?? "";
}

function Labeled({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block font-sans text-[12px] text-bk-muted">
      <span className="block mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] mt-1">{hint}</span>}
    </label>
  );
}

export default function PaymentMethodsManager({ methods }: { methods: MethodData[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [f, setF] = useState<Form>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const toggleCur = (c: string) => setF({ ...f, currencies: f.currencies.includes(c) ? f.currencies.filter((x) => x !== c) : [...f.currencies, c] });

  function open(m?: MethodData) {
    setError(null);
    setF(m ? fromMethod(m) : blank);
    setEditing(m ? m.id : "new");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const isNew = editing === "new";
    const res = await fetch(isNew ? "/api/admin/payment-methods" : `/api/admin/payment-methods/${editing}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error?.message ?? "Could not save.");
    setEditing(null);
    router.refresh();
  }

  async function flip(m: MethodData) {
    await fetch(`/api/admin/payment-methods/${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !m.isActive }) });
    router.refresh();
  }

  async function remove(m: MethodData) {
    if (!confirm(`Delete “${m.name}”? This can't be undone.`)) return;
    const res = await fetch(`/api/admin/payment-methods/${m.id}`, { method: "DELETE" });
    if (!res.ok) alert((await res.json().catch(() => ({}))).error?.message ?? "Could not delete.");
    router.refresh();
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="font-sans font-medium text-bk-heading text-sm">Payment methods</p>
        {editing === null && (
          <button type="button" onClick={() => open()} className={buttonClass("primary", "sm")}>Add a method</button>
        )}
      </div>
      <p className="font-sans text-[12px] text-bk-muted mb-3">
        Organizations see the active methods that match an invoice&apos;s currency, with every detail below, and pay one of them. Only you can see this page.
      </p>

      {editing !== null && (
        <form onSubmit={save} className="bg-bk-surface border border-bk-gold-light/40 p-4 mb-4 space-y-3">
          <p className="font-sans font-bold text-[13px] text-bk-heading">{editing === "new" ? "New payment method" : "Edit payment method"}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <Labeled label="Kind">
              <select value={f.type} onChange={set("type")} disabled={editing !== "new"} className={field}>
                {PAYMENT_METHOD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Labeled>
            <Labeled label="Name shown to organizations" hint={f.type === "wallet" ? "e.g. JazzCash, Easypaisa" : f.type === "crypto" ? "e.g. USDT on BNB Chain" : "e.g. Meezan Bank"}>
              <input value={f.name} onChange={set("name")} maxLength={60} className={field} />
            </Labeled>
          </div>

          <div>
            <p className="font-sans text-[12px] text-bk-muted mb-1">Invoice currencies it accepts (none ticked = any)</p>
            <div className="flex flex-wrap gap-3 font-sans text-[13px] text-bk-heading">
              {LAUNCH_CURRENCIES.map((c) => (
                <label key={c} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={f.currencies.includes(c)} onChange={() => toggleCur(c)} /> {c}
                </label>
              ))}
            </div>
          </div>

          {f.type === "bank" && (
            <div className="grid sm:grid-cols-2 gap-3">
              <Labeled label="Bank name"><input value={f.bankName} onChange={set("bankName")} className={field} /></Labeled>
              <Labeled label="Account title"><input value={f.accountTitle} onChange={set("accountTitle")} className={field} /></Labeled>
              <Labeled label="Account number"><input value={f.accountNumber} onChange={set("accountNumber")} className={`${field} font-mono`} /></Labeled>
              <Labeled label="IBAN"><input value={f.iban} onChange={set("iban")} className={`${field} font-mono`} /></Labeled>
              <Labeled label="Branch"><input value={f.branch} onChange={set("branch")} className={field} /></Labeled>
              <Labeled label="SWIFT / BIC (for international payments)"><input value={f.swiftCode} onChange={set("swiftCode")} className={`${field} font-mono`} /></Labeled>
            </div>
          )}
          {f.type === "wallet" && (
            <div className="grid sm:grid-cols-2 gap-3">
              <Labeled label="Name on the wallet account"><input value={f.accountTitle} onChange={set("accountTitle")} className={field} /></Labeled>
              <Labeled label="Wallet number"><input value={f.walletNumber} onChange={set("walletNumber")} placeholder="03XX-XXXXXXX" className={`${field} font-mono`} /></Labeled>
            </div>
          )}
          {f.type === "crypto" && (
            <div className="grid sm:grid-cols-2 gap-3">
              <Labeled label="Coin"><input value={f.cryptoAsset} onChange={set("cryptoAsset")} placeholder="USDT" className={field} /></Labeled>
              <Labeled label="Network" hint="The wrong network loses the money, so be exact.">
                <input value={f.cryptoNetwork} onChange={set("cryptoNetwork")} placeholder="BNB Smart Chain (BEP20)" className={field} />
              </Labeled>
              <div className="sm:col-span-2">
                <Labeled label="Wallet address" hint="Checked against the network (0x… for BEP20/ERC20, T… for TRC20).">
                  <input value={f.cryptoAddress} onChange={set("cryptoAddress")} className={`${field} font-mono`} />
                </Labeled>
              </div>
              <Labeled label="Memo / tag (only if the network needs one)"><input value={f.cryptoMemo} onChange={set("cryptoMemo")} className={`${field} font-mono`} /></Labeled>
            </div>
          )}

          <Labeled label={f.type === "other" ? "Instructions (required)" : "Instructions shown to the organization (optional)"}>
            <textarea value={f.instructions} onChange={set("instructions")} rows={3} maxLength={1500} className="bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2 w-full" />
          </Labeled>

          {error && <p role="alert" className="font-sans text-[12px] text-bk-live">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={buttonClass("primary", "sm")}>{busy ? "Saving…" : "Save method"}</button>
            <button type="button" onClick={() => setEditing(null)} disabled={busy} className={buttonClass("outline", "sm")}>Cancel</button>
          </div>
        </form>
      )}

      <ul className="space-y-2">
        {methods.length === 0 && <li className="font-sans text-[12px] text-bk-muted">No payment methods yet. Add one so organizations know where to pay.</li>}
        {methods.map((m) => (
          <li key={m.id} className="bg-bk-surface border border-bk-border p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-sans text-[13px] text-bk-heading">
                {m.name}{" "}
                <span className="text-bk-muted text-[11px]">
                  · {typeLabel(m.type)} · {m.currencies.length ? m.currencies.join(", ") : "any currency"}
                </span>
                {!m.isActive && <span className="ml-2 text-bk-muted text-[11px] uppercase tracking-[0.8px]">Off</span>}
              </p>
              <p className="font-mono text-[11px] text-bk-muted break-all">{summary(m)}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => open(m)} className={buttonClass("outline", "sm")}>Edit</button>
              <button type="button" onClick={() => flip(m)} className={buttonClass("ghost", "sm")}>{m.isActive ? "Switch off" : "Switch on"}</button>
              <button type="button" onClick={() => remove(m)} className={buttonClass("ghost", "sm")}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
