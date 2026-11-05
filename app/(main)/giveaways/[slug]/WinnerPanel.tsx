"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/Button";
import LocalDate from "@/components/ui/LocalDate";
import type { GiveawayPage } from "@/lib/services/giveaways";

const input = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[40px]";
const label = "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1 mt-3";

// What a winner sees and does: send delivery details, then confirm (or report) the prize.
export default function WinnerPanel({ win }: { win: NonNullable<GiveawayPage["myWin"]>; slug: string }) {
  const router = useRouter();
  const [name, setName] = useState(win.deliveryName ?? "");
  const [phone, setPhone] = useState(win.deliveryPhone ?? "");
  const [address, setAddress] = useState(win.deliveryAddress ?? "");
  const [note, setNote] = useState(win.deliveryNote ?? "");
  const [editing, setEditing] = useState(win.status === "awaiting_details");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(body: object) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/giveaways/winners/${win.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (res.ok) { setEditing(false); return router.refresh(); }
    setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
  }

  const physical = win.prizeKind === "physical";
  const box = "mt-6 bg-bk-surface border border-bk-teal/50 px-4 py-4";
  if (win.status === "replaced") {
    return <div className={`${box} border-bk-border`}><p className="font-sans text-[13px] text-bk-body">The prize was given to someone else{win.replacedNote ? `: ${win.replacedNote}` : "."}</p></div>;
  }

  return (
    <div className={box} aria-label="Your prize">
      <p className="font-sans font-bold text-[15px] text-bk-teal">You won! 🎉</p>

      {(win.status === "awaiting_details" || (win.status === "details_submitted" && editing)) && (
        <form onSubmit={(e) => { e.preventDefault(); void act({ action: "details", name, phone, address, note }); }}>
          <p className="font-sans text-[12px] text-bk-body mt-1">
            Send your details so the host can get the prize to you. Only the host and BattleKrypt admins see them.
            {win.status === "awaiting_details" && <> Please do it before <LocalDate iso={win.claimDeadline} format="long" />, or the prize may go to someone else.</>}
          </p>
          <label htmlFor="w-name" className={label}>Full name</label>
          <input id="w-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={input} />
          <label htmlFor="w-phone" className={label}>Phone number</label>
          <input id="w-phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} className={input} />
          {physical && (
            <>
              <label htmlFor="w-addr" className={label}>Full delivery address</label>
              <textarea id="w-addr" value={address} onChange={(e) => setAddress(e.target.value)} rows={3} maxLength={300} className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2" />
            </>
          )}
          <label htmlFor="w-note" className={label}>{win.prizeKind === "cash" ? "How should we pay you? (bank, JazzCash or Easypaisa account)" : win.prizeKind === "code" ? "Where should the code be sent? (an email address)" : "Anything the courier should know (optional)"}</label>
          <input id="w-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={input} />
          {error && <p role="alert" className="text-bk-live text-[12px] font-sans mt-3">{error}</p>}
          <button type="submit" disabled={busy} className={`${buttonClass("primary", "md")} mt-4`}>{busy ? "Sending…" : "Send my details"}</button>
        </form>
      )}

      {win.status === "details_submitted" && !editing && (
        <>
          <p className="font-sans text-[13px] text-bk-body mt-1">We have your details. The host will send your prize soon, and you&apos;ll get a notification.</p>
          <button type="button" onClick={() => setEditing(true)} className="font-sans text-[11px] uppercase underline text-bk-muted mt-2">Change my details</button>
        </>
      )}

      {win.status === "delivered" && (
        <>
          <p className="font-sans text-[13px] text-bk-body mt-1">The host says your prize was sent{win.hostNote ? `: ${win.hostNote}` : "."}</p>
          <p className="font-sans text-[12px] text-bk-muted mt-1">Once you have it, please confirm. If it hasn&apos;t arrived, tell us.</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button type="button" disabled={busy} onClick={() => void act({ action: "confirm" })} className={buttonClass("primary", "md")}>I received it</button>
            <button type="button" disabled={busy} onClick={() => { const n = prompt("What happened? (for example: nothing has arrived after two weeks)"); if (n !== null) void act({ action: "dispute", note: n }); }} className={buttonClass("outline", "md")}>It hasn&apos;t arrived</button>
          </div>
          {error && <p role="alert" className="text-bk-live text-[12px] font-sans mt-3">{error}</p>}
        </>
      )}

      {win.status === "disputed" && <p className="font-sans text-[13px] text-bk-body mt-1">You told us it didn&apos;t arrive. The host has been told, and an admin can step in if it isn&apos;t sorted out.</p>}
      {win.status === "confirmed" && <p className="font-sans text-[13px] text-bk-body mt-1">You confirmed you received your prize. Enjoy!</p>}
    </div>
  );
}
