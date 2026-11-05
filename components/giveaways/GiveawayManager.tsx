"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ManagedGiveaway } from "@/lib/services/giveaways";

type Mode = "admin" | "organizer";

const PHASE_LABEL: Record<string, string> = {
  draft: "Draft", pending_review: "Waiting for review", rejected: "Rejected", cancelled: "Cancelled",
  upcoming: "Starts soon", open: "Open", closed: "Closed, ready to draw", drawn: "Drawn",
};
const WINNER_LABEL: Record<string, string> = {
  awaiting_details: "Waiting for their details", details_submitted: "Details received, ready to deliver", delivered: "Sent, waiting for them to confirm",
  confirmed: "Received", disputed: "Says it didn't arrive", replaced: "Replaced",
};
const KIND_LABEL: Record<string, string> = { physical: "Physical item", code: "Digital code", cash: "Cash" };
const date = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const btn = "font-sans text-[11px] uppercase tracking-[0.6px] px-3 min-h-[34px] border transition-colors disabled:opacity-50";
const primary = `${btn} bg-bk-primary text-bk-on-primary border-bk-primary font-bold`;
const ghost = `${btn} border-bk-border text-bk-heading hover:border-bk-gold-light`;

export default function GiveawayManager({ items, mode }: { items: ManagedGiveaway[]; mode: Mode }) {
  const router = useRouter();
  const admin = mode === "admin";
  const base = admin ? "/api/admin/giveaways" : "/api/organizer/giveaways";
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(key: string, url: string, method: string, body: object, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(key);
    setError(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(null);
    if (res.ok) return router.refresh();
    setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
    router.refresh();
  }
  const ask = (q: string) => prompt(q);

  if (items.length === 0) return <p className="font-sans text-[13px] text-bk-muted">No giveaways yet.</p>;

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="text-bk-live text-[12px] font-sans border border-bk-live/50 px-3 py-2">{error}</p>}
      {items.map((g) => {
        const live = g.status === "active";
        const drawable = live && g.phase === "closed";
        const cancellable = admin ? g.status !== "cancelled" && g.status !== "rejected" : g.status === "draft" || g.status === "pending_review" || g.status === "active";
        return (
          <article key={g.id} className="border border-bk-border bg-bk-surface p-4" aria-label={g.title}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-sans font-bold text-[15px] text-bk-heading">
                  <Link href={`/giveaways/${g.slug}`} className="hover:underline">{g.title}</Link>
                </h3>
                <p className="font-sans text-[12px] text-bk-body">
                  {g.prizeTitle} <span className="text-bk-muted">· {KIND_LABEL[g.prizeKind]}{g.prizeValueUsd !== null && ` · $${g.prizeValueUsd}`} · {g.winnersCount} winner{g.winnersCount === 1 ? "" : "s"}</span>
                </p>
                <p className="font-sans text-[11px] text-bk-muted mt-0.5">
                  {admin && <>{g.host.kind === "platform" ? "Run by BattleKrypt" : `Run by ${g.host.name}`}{g.host.sponsor && ` for ${g.host.sponsor.name}`} · </>}
                  {g.entries} entr{g.entries === 1 ? "y" : "ies"} · {date(g.startsAt)} → {date(g.endsAt)}
                  {g.tournament && ` · for ${g.tournament} players`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className={`font-sans text-[11px] border px-2 py-0.5 ${g.phase === "closed" ? "border-bk-gold-light text-bk-gold-light" : g.status === "rejected" || g.status === "cancelled" ? "border-bk-live/60 text-bk-live" : "border-bk-border text-bk-body"}`}>{PHASE_LABEL[g.phase]}</span>
                {admin ? (
                  <label className="flex items-center gap-2 font-sans text-[11px] text-bk-body cursor-pointer">
                    <input type="checkbox" checked={g.verifiedOnly} disabled={busy === `v${g.id}` || ["ended", "cancelled", "rejected"].includes(g.status)} onChange={(e) => call(`v${g.id}`, `${base}/${g.id}`, "POST", { action: "verified_only", value: e.target.checked })} />
                    Verified members only
                  </label>
                ) : (
                  <span className="font-sans text-[11px] text-bk-muted">{g.verifiedOnly ? "Verified members only" : "Open to everyone"}</span>
                )}
              </div>
            </div>

            {g.reviewNote && g.status === "rejected" && <p className="font-sans text-[12px] text-bk-live mt-2">Rejected: {g.reviewNote}</p>}
            {g.cancelledNote && <p className="font-sans text-[12px] text-bk-live mt-2">Cancelled: {g.cancelledNote}</p>}

            <div className="flex flex-wrap gap-2 mt-3">
              {admin && g.status === "pending_review" && (
                <>
                  <button type="button" className={primary} disabled={busy === g.id} onClick={() => call(g.id, `${base}/${g.id}`, "POST", { action: "approve" })}>Approve</button>
                  <button type="button" className={ghost} disabled={busy === g.id} onClick={() => { const n = ask("Why isn't this giveaway approved? The organizer will see this."); if (n !== null) call(g.id, `${base}/${g.id}`, "POST", { action: "reject", note: n }); }}>Reject</button>
                </>
              )}
              {admin && g.status === "draft" && <button type="button" className={primary} disabled={busy === g.id} onClick={() => call(g.id, `${base}/${g.id}`, "POST", { action: "activate" })}>Go live</button>}
              {drawable && <button type="button" className={primary} disabled={busy === g.id} onClick={() => call(g.id, `${base}/${g.id}`, "POST", { action: "draw" }, `Draw ${g.winnersCount} winner${g.winnersCount === 1 ? "" : "s"} at random from ${g.entries} entr${g.entries === 1 ? "y" : "ies"}? This can't be undone.`)}>Draw winners</button>}
              {admin && live && !drawable && <button type="button" className={ghost} disabled={busy === g.id} onClick={() => call(g.id, `${base}/${g.id}`, "POST", { action: "draw", early: true }, "Close this giveaway now and draw the winners? Nobody can enter afterwards.")}>Close early and draw</button>}
              {cancellable && <button type="button" className={ghost} disabled={busy === g.id} onClick={() => { const r = ask("Why is this giveaway being cancelled? Everyone who entered will be told."); if (r !== null) call(g.id, `${base}/${g.id}`, "POST", { action: "cancel", reason: r }); }}>Cancel</button>}
            </div>

            {g.winners.length > 0 && (
              <div className="mt-4 border-t border-bk-border pt-3">
                <p className="font-sans font-bold text-[12px] text-bk-heading mb-2">Winners</p>
                <ul className="space-y-3">
                  {g.winners.map((w) => {
                    const lateAwaiting = w.status === "awaiting_details" && new Date(w.claimDeadline) <= new Date();
                    const canReplace = admin ? !["delivered", "confirmed", "replaced"].includes(w.status) : lateAwaiting;
                    return (
                      <li key={w.id} className={`font-sans text-[12px] ${w.status === "replaced" ? "opacity-60" : ""}`}>
                        <p className="text-bk-heading">{w.name} <span className="text-bk-muted">· {w.email}</span></p>
                        <p className="text-bk-body">{WINNER_LABEL[w.status]}{w.status === "awaiting_details" && <span className="text-bk-muted"> · until {date(w.claimDeadline)}</span>}</p>
                        {(w.deliveryName || w.deliveryPhone) && (
                          <dl className="mt-1 grid sm:grid-cols-2 gap-x-4 gap-y-0.5 bg-bk-bg border border-bk-border px-3 py-2">
                            <div><dt className="text-bk-muted inline">Name: </dt><dd className="inline text-bk-heading">{w.deliveryName}</dd></div>
                            <div><dt className="text-bk-muted inline">Phone: </dt><dd className="inline text-bk-heading">{w.deliveryPhone}</dd></div>
                            {w.deliveryAddress && <div className="sm:col-span-2"><dt className="text-bk-muted inline">Address: </dt><dd className="inline text-bk-heading">{w.deliveryAddress}</dd></div>}
                            {w.deliveryNote && <div className="sm:col-span-2"><dt className="text-bk-muted inline">{g.prizeKind === "cash" ? "Pay to: " : g.prizeKind === "code" ? "Send the code to: " : "Note: "}</dt><dd className="inline text-bk-heading">{w.deliveryNote}</dd></div>}
                          </dl>
                        )}
                        {w.hostNote && <p className="text-bk-muted mt-1">Delivery note: {w.hostNote}</p>}
                        {w.disputeNote && <p className="text-bk-live mt-1">Winner says: {w.disputeNote}</p>}
                        {w.replacedNote && <p className="text-bk-muted mt-1">Replaced: {w.replacedNote}</p>}
                        <div className="flex flex-wrap gap-2 mt-1.5">
                          {(w.status === "details_submitted" || w.status === "disputed") && (
                            <button type="button" className={primary} disabled={busy === w.id} onClick={() => { const n = ask(g.prizeKind === "physical" ? "Delivery note: courier and tracking number, or how it was sent." : "Delivery note: how and when it was sent. Don't put a gift-card code here unless the winner should see it."); if (n !== null) call(w.id, `${base}/winners/${w.id}`, "POST", { action: "deliver", note: n }); }}>
                              {w.status === "disputed" ? "I sent it again" : "Mark as sent"}
                            </button>
                          )}
                          {canReplace && (
                            <button type="button" className={ghost} disabled={busy === w.id} onClick={() => { const r = ask("Why is the winner being replaced? A new winner is drawn at random and both are told."); if (r !== null) call(w.id, `${base}/winners/${w.id}`, "POST", { action: "replace", reason: r }, "Replace this winner with a new random draw?"); }}>Replace winner</button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
