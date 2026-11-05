"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SideSheet from "@/components/admin/SideSheet";
import SearchPicker from "@/components/admin/SearchPicker";
import FileUpload from "@/components/ui/FileUpload";
import { buttonClass } from "@/components/ui/Button";
import type { TournamentHit } from "@/lib/services/admin-lists";

const input = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[40px]";
const label = "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1 mt-4";
const area = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2";

const blank = {
  title: "", description: "", prizeKind: "physical", prizeTitle: "", prizeValueUsd: "", prizeImageUrl: "", winnersCount: "1",
  startsAt: "", endsAt: "", sponsorName: "", sponsorLogoUrl: "", sponsorUrl: "", verifiedOnly: false, draft: false,
};

// One form for both hosts. An admin also picks a sponsor and who may enter; an organizer doesn't
// (who may enter follows the platform setting), and its prize value is required.
export default function GiveawayForm({
  mode,
  ownTournaments = [],
  defaultVerifiedOnly,
  reviewAboveUsd,
}: {
  mode: "admin" | "organizer";
  ownTournaments?: { id: string; name: string }[];
  defaultVerifiedOnly: boolean;
  reviewAboveUsd: number;
}) {
  const router = useRouter();
  const admin = mode === "admin";
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ ...blank, verifiedOnly: defaultVerifiedOnly });
  const [tournamentId, setTournamentId] = useState("");
  const [picked, setPicked] = useState<TournamentHit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const set = (patch: Partial<typeof blank>) => setF((x) => ({ ...x, ...patch }));
  const iso = (v: string) => (v ? new Date(v).toISOString() : undefined);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch(admin ? "/api/admin/giveaways" : "/api/organizer/giveaways", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...f,
        winnersCount: Number(f.winnersCount),
        prizeValueUsd: f.prizeValueUsd === "" ? undefined : Number(f.prizeValueUsd),
        startsAt: iso(f.startsAt),
        endsAt: iso(f.endsAt),
        tournamentId: admin ? picked?.id : tournamentId || undefined,
        ...(admin ? {} : { sponsorName: undefined, verifiedOnly: undefined }),
      }),
    });
    setBusy(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error?.message ?? "Something went wrong.");
    setDone(body.status === "pending_review" ? "Sent for review. It goes live as soon as an admin approves it." : body.status === "draft" ? "Saved as a draft." : "It's live. Players can enter now.");
    setF({ ...blank, verifiedOnly: defaultVerifiedOnly });
    setPicked(null);
    setTournamentId("");
    router.refresh();
  }

  const close = () => {
    setOpen(false);
    setDone(null);
    setError(null);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("primary", "md")}>+ New giveaway</button>
      <SideSheet
        open={open}
        onClose={close}
        title="New giveaway"
        subtitle={admin ? "Run it for a brand or for the community." : "Players enter, you draw the winners and deliver the prize."}
        footer={
          done ? (
            <div className="flex justify-end"><button type="button" onClick={close} className={buttonClass("primary", "md")}>Done</button></div>
          ) : (
            <div className="flex justify-between gap-3">
              <button type="button" onClick={close} className={buttonClass("outline", "md")}>Cancel</button>
              <button type="button" onClick={submit} disabled={busy} className={buttonClass("primary", "md")}>{busy ? "Saving…" : admin && f.draft ? "Save draft" : "Start giveaway"}</button>
            </div>
          )
        }
      >
        {done ? (
          <p role="status" className="font-sans text-[14px] text-bk-teal">{done}</p>
        ) : (
          <div>
            {!admin && (
              <p className="font-sans text-[12px] text-bk-body bg-bk-surface border border-bk-border px-3 py-2">
                {defaultVerifiedOnly ? "Only verified members (on a paid plan) can enter your giveaways right now." : "Anyone can enter your giveaways right now."} An admin sets this for the whole platform. A prize worth more than ${reviewAboveUsd} is checked by an admin before it goes live.
              </p>
            )}
            <label htmlFor="g-title" className={label}>Title</label>
            <input id="g-title" value={f.title} onChange={(e) => set({ title: e.target.value })} maxLength={100} className={input} placeholder="Win a gaming headset" />
            <label htmlFor="g-desc" className={label}>Details and rules</label>
            <textarea id="g-desc" value={f.description} onChange={(e) => set({ description: e.target.value })} rows={4} maxLength={3000} className={area} />

            <div className="grid sm:grid-cols-2 gap-x-3">
              <div>
                <label htmlFor="g-kind" className={label}>Kind of prize</label>
                <select id="g-kind" value={f.prizeKind} onChange={(e) => set({ prizeKind: e.target.value })} className={input}>
                  <option value="physical">A physical item (we ship it)</option>
                  <option value="code">A digital code or gift card</option>
                  <option value="cash">Cash (18+ only)</option>
                </select>
              </div>
              <div>
                <label htmlFor="g-value" className={label}>Worth (US dollars){admin ? " (optional)" : ""}</label>
                <input id="g-value" inputMode="decimal" value={f.prizeValueUsd} onChange={(e) => set({ prizeValueUsd: e.target.value })} className={input} />
              </div>
            </div>
            <label htmlFor="g-prize" className={label}>What do they win?</label>
            <input id="g-prize" value={f.prizeTitle} onChange={(e) => set({ prizeTitle: e.target.value })} maxLength={120} className={input} placeholder="RTX gaming laptop" />
            <div className="mt-3">
              <FileUpload bucket="tournament-assets" pathPrefix="giveaway-prizes" label="Prize photo (optional)" onUploaded={(u) => set({ prizeImageUrl: u })} />
              {f.prizeImageUrl && <p className="font-sans text-[11px] text-bk-teal mt-1">✓ photo uploaded</p>}
            </div>

            <div className="grid sm:grid-cols-3 gap-x-3">
              <div>
                <label htmlFor="g-winners" className={label}>Winners</label>
                <input id="g-winners" inputMode="numeric" value={f.winnersCount} onChange={(e) => set({ winnersCount: e.target.value })} className={input} />
              </div>
              <div>
                <label htmlFor="g-start" className={label}>Starts (optional)</label>
                <input id="g-start" type="datetime-local" value={f.startsAt} onChange={(e) => set({ startsAt: e.target.value })} className={input} />
              </div>
              <div>
                <label htmlFor="g-end" className={label}>Ends</label>
                <input id="g-end" type="datetime-local" value={f.endsAt} onChange={(e) => set({ endsAt: e.target.value })} className={input} />
              </div>
            </div>

            {admin ? (
              <>
                <p className={label}>Only people who took part in a tournament (optional)</p>
                {picked ? (
                  <p className="font-sans text-[13px] text-bk-heading">{picked.name} <span className="text-bk-muted">· {picked.organizer}</span> <button type="button" onClick={() => setPicked(null)} className="text-bk-gold-light underline text-[11px] uppercase">Change</button></p>
                ) : (
                  <SearchPicker<TournamentHit>
                    endpoint="/api/admin/giveaways/tournaments"
                    label="Find a tournament"
                    placeholder="Search tournament or organizer"
                    onPick={setPicked}
                    renderItem={(t) => (<span className="block"><span className="block font-sans text-[13px] text-bk-heading truncate">{t.name}</span><span className="block font-sans text-[11px] text-bk-muted truncate">{t.organizer}</span></span>)}
                  />
                )}

                <p className="font-sans font-bold text-[13px] text-bk-heading mt-6 pt-4 border-t border-bk-border">Sponsor (optional)</p>
                <label htmlFor="g-sponsor" className={label}>Brand or partner name</label>
                <input id="g-sponsor" value={f.sponsorName} onChange={(e) => set({ sponsorName: e.target.value })} maxLength={80} className={input} />
                <label htmlFor="g-sponsor-url" className={label}>Brand link</label>
                <input id="g-sponsor-url" value={f.sponsorUrl} onChange={(e) => set({ sponsorUrl: e.target.value })} placeholder="https://" className={input} />
                <div className="mt-3">
                  <FileUpload bucket="tournament-assets" pathPrefix="giveaway-sponsors" label="Brand logo (optional)" onUploaded={(u) => set({ sponsorLogoUrl: u })} />
                  {f.sponsorLogoUrl && <p className="font-sans text-[11px] text-bk-teal mt-1">✓ logo uploaded</p>}
                </div>

                <label className="flex items-start gap-2 font-sans text-[13px] text-bk-body mt-6 cursor-pointer">
                  <input type="checkbox" checked={f.verifiedOnly} onChange={(e) => set({ verifiedOnly: e.target.checked })} className="mt-0.5" />
                  <span>Verified members only<span className="block text-[12px] text-bk-muted">Only users and organizations on a paid plan can enter. Everyone else is asked to get verified first.</span></span>
                </label>
                <label className="flex items-center gap-2 font-sans text-[13px] text-bk-body mt-3 cursor-pointer">
                  <input type="checkbox" checked={f.draft} onChange={(e) => set({ draft: e.target.checked })} />
                  Save as a draft (not public yet)
                </label>
              </>
            ) : (
              ownTournaments.length > 0 && (
                <>
                  <label htmlFor="g-tour" className={label}>Only players of one of your tournaments (optional)</label>
                  <select id="g-tour" value={tournamentId} onChange={(e) => setTournamentId(e.target.value)} className={input}>
                    <option value="">Anyone can enter</option>
                    {ownTournaments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </>
              )
            )}
            {error && <p role="alert" className="text-bk-live text-[12px] font-sans mt-4">{error}</p>}
          </div>
        )}
      </SideSheet>
    </>
  );
}
