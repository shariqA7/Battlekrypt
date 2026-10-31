"use client";

import { useState } from "react";
import Link from "next/link";
import FileUpload from "@/components/ui/FileUpload";
import { buttonClass } from "@/components/ui/Button";
import { SUPPORTED_CURRENCIES, formatMoney } from "@/lib/money";

type Campaign = { id: string; slug: string; title: string; description: string; currency: string; goal: number | null; raised: number; donors: number; endsAt: string | null; verifiedOnly: boolean };

const input = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[40px]";
const label = "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1 mt-4";

export default function DonateForm({
  campaigns,
  instructions,
  generalVerifiedOnly,
  viewer,
  initialCampaign,
}: {
  campaigns: Campaign[];
  instructions: string | null;
  generalVerifiedOnly: boolean;
  viewer: { loggedIn: boolean; verified: boolean };
  initialCampaign: string | null;
}) {
  const start = campaigns.find((c) => c.slug === initialCampaign)?.id ?? "";
  const [campaignId, setCampaignId] = useState(start);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(campaigns.find((c) => c.id === start)?.currency ?? "PKR");
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [proof, setProof] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const campaign = campaigns.find((c) => c.id === campaignId) ?? null;
  const verifiedOnly = campaign ? campaign.verifiedOnly : generalVerifiedOnly;
  const blocked = verifiedOnly && viewer.loggedIn && !viewer.verified;

  function choose(id: string) {
    setCampaignId(id);
    const c = campaigns.find((x) => x.id === id);
    if (c) setCurrency(c.currency);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!(Number(amount) > 0)) return setError("Enter an amount more than zero.");
    if (reference.replace(/[^a-z0-9]/gi, "").length < 6) return setError("Enter the transaction ID shown on your payment receipt (at least 6 letters or numbers).");
    if (!proof) return setError("Upload a screenshot of your payment.");
    setBusy(true);
    const res = await fetch("/api/donations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: campaignId || undefined, amount: Number(amount), currency, proofUrl: proof, reference, message, anonymous }),
    });
    setBusy(false);
    if (res.ok) return setDone(true);
    setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
  }

  if (done) {
    return (
      <div className="bg-bk-surface border border-bk-teal/50 px-4 py-5" role="status">
        <p className="font-sans font-bold text-[15px] text-bk-teal">Thank you!</p>
        <p className="font-sans text-[13px] text-bk-body mt-1">We got your donation. An admin will check the payment and you&apos;ll get a notification once it&apos;s approved.</p>
        <button type="button" onClick={() => { setDone(false); setAmount(""); setMessage(""); setProof(""); setReference(""); }} className="font-sans text-[12px] underline text-bk-muted mt-3">
          Give again
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="bg-bk-surface border border-bk-border px-4 py-5">
      <p className="font-sans font-bold text-[15px] text-bk-heading mb-3">Where should it go?</p>
      <div role="radiogroup" aria-label="Where the donation goes" className="grid gap-2">
        {[{ id: "", title: "General community fund", description: "Used wherever the community needs it most: prize pools, giveaways and running costs.", verifiedOnly: generalVerifiedOnly, goal: null as number | null, raised: 0, currency: "", endsAt: null as string | null, donors: 0 }, ...campaigns].map((c) => (
          <button
            key={c.id || "general"}
            type="button"
            role="radio"
            aria-checked={campaignId === c.id}
            onClick={() => choose(c.id)}
            className={`text-left p-3 border transition-colors ${campaignId === c.id ? "border-bk-gold-light bg-bk-surface-hover" : "border-bk-border hover:border-bk-border-nav"}`}
          >
            <span className="flex flex-wrap items-center gap-2 font-sans font-bold text-[13px] text-bk-heading">
              {c.title}
              {c.verifiedOnly && <span className="border border-bk-gold-light/60 text-bk-gold-light text-[10px] font-normal px-1.5 py-0.5">Verified members</span>}
            </span>
            <span className="block font-sans text-[12px] text-bk-body mt-0.5">{c.description}</span>
            {c.goal !== null && (
              <span className="block mt-2">
                <span className="block h-1.5 bg-bk-border"><span className="block h-1.5 bg-bk-gold-light" style={{ width: `${Math.min(100, (c.raised / c.goal) * 100)}%` }} /></span>
                <span className="block font-sans text-[11px] text-bk-muted mt-1">
                  {formatMoney(c.raised, c.currency)} of {formatMoney(c.goal, c.currency)} · {c.donors} donor{c.donors === 1 ? "" : "s"}
                  {c.endsAt && ` · ends ${new Date(c.endsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                </span>
              </span>
            )}
          </button>
        ))}
      </div>

      {!viewer.loggedIn ? (
        <p className="font-sans text-[13px] text-bk-body mt-5">
          <Link href="/login?redirectTo=/donate" className="text-bk-gold-light underline">Log in</Link> to donate.
        </p>
      ) : blocked ? (
        <div className="mt-5 border border-bk-gold-light/50 bg-bk-bg px-3 py-3" role="alert">
          <p className="font-sans font-bold text-[13px] text-bk-heading">This is for verified members</p>
          <p className="font-sans text-[12px] text-bk-body mt-1">
            Verified means being on a paid plan (player, organizer or club). <Link href="/plans" className="text-bk-gold-light underline">Get verified first</Link>, then come back to give.
          </p>
        </div>
      ) : (
        <>
          {instructions ? (
            <div className="bg-bk-bg border border-bk-gold-light/40 px-3 py-2.5 mt-5">
              <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-gold-light mb-1">How to pay</p>
              <p className="font-sans text-[13px] text-bk-heading whitespace-pre-wrap">{instructions}</p>
            </div>
          ) : (
            <p className="font-sans text-[12px] text-bk-muted mt-5">Payment instructions haven&apos;t been set yet. Please contact support before paying.</p>
          )}

          <div className="grid grid-cols-[1fr_120px] gap-3">
            <div>
              <label htmlFor="d-amount" className={label}>Amount</label>
              <input id="d-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={input} placeholder="500" />
            </div>
            <div>
              <label htmlFor="d-currency" className={label}>Currency</label>
              <select id="d-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={Boolean(campaign)} className={input}>
                {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <label htmlFor="d-ref" className={label}>Transaction ID</label>
          <input id="d-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} autoComplete="off" className={`${input} font-mono`} placeholder="From your payment receipt" />

          <label htmlFor="d-message" className={label}>Message (optional)</label>
          <textarea id="d-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={300} className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2" />

          <div className="mt-4">
            <FileUpload bucket="tournament-assets" pathPrefix="donation-proofs" label="Upload payment screenshot" onUploaded={setProof} />
            {proof && <p className="font-sans text-[11px] text-bk-teal mt-1">✓ screenshot uploaded</p>}
          </div>

          <label className="flex items-center gap-2 font-sans text-[12px] text-bk-body mt-4 cursor-pointer">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
            Don&apos;t show my name on the supporters list
          </label>

          {error && <p role="alert" className="text-bk-live text-[12px] font-sans mt-3">{error}</p>}
          <button type="submit" disabled={busy} className={`${buttonClass("primary", "md")} mt-5`}>{busy ? "Sending…" : "I've paid, send it for approval"}</button>
        </>
      )}
    </form>
  );
}
