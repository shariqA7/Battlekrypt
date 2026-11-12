"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";
import { Panel, SectionHeading } from "@/components/ui/Panel";
import { buttonClass } from "@/components/ui/Button";
import { LAUNCH_CURRENCIES } from "@/lib/money";
import { AD_AUDIENCES, AD_AUDIENCE_LABEL, AD_PLACEMENTS, AD_PLACEMENT_LABEL, type AdPlacement } from "@/lib/ad-rules";

interface Campaign {
  id: string; name: string; advertiser: string; imageUrl: string; linkUrl: string; altText: string;
  placements: string[]; audience: string; weight: number; active: boolean; live: boolean;
  startsAt: string; endsAt: string | null; paidAmount: number | null; paidCurrency: string | null;
  impressions: number; clicks: number; impressions30: number; clicks30: number;
}
type Adsense = { adsenseClientId: string; adsenseSlotBrowse: string; adsenseSlotTournament: string; adsenseSlotDashboard: string };

const field = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[36px]";
const label = "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1 mt-3";
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const ctr = (v: number, c: number) => (v ? `${((c / v) * 100).toFixed(2)}%` : "—");

const blank = { name: "", advertiser: "", imageUrl: "", linkUrl: "", altText: "", placements: [...AD_PLACEMENTS] as string[], audience: "all", startsAt: "", endsAt: "", weight: "1", paidAmount: "", paidCurrency: "PKR", active: true };

export default function AdsManager({ adsEnabled, adsense, euConsentReady, campaigns }: { adsEnabled: boolean; adsense: Adsense; euConsentReady: boolean; campaigns: Campaign[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(blank);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [as, setAs] = useState(adsense);
  const [asMsg, setAsMsg] = useState<string | null>(null);
  const [euReady, setEuReady] = useState(euConsentReady);

  const set = (k: keyof typeof blank, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const togglePlacement = (p: string) => set("placements", form.placements.includes(p) ? form.placements.filter((x) => x !== p) : [...form.placements, p]);

  function startEdit(c: Campaign) {
    setErr(null);
    setEditing(c.id);
    setForm({ name: c.name, advertiser: c.advertiser, imageUrl: c.imageUrl, linkUrl: c.linkUrl, altText: c.altText, placements: c.placements, audience: c.audience, startsAt: day(c.startsAt), endsAt: day(c.endsAt), weight: String(c.weight), paidAmount: c.paidAmount === null ? "" : String(c.paidAmount), paidCurrency: c.paidCurrency ?? "PKR", active: c.active });
  }

  async function call(url: string, method: string, body?: object) {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (res.ok) return null;
    return (await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.";
  }

  async function save() {
    setBusy(true); setErr(null);
    const msg = await call(editing === "new" ? "/api/admin/ads" : `/api/admin/ads/${editing}`, editing === "new" ? "POST" : "PATCH", { ...form, paidAmount: form.paidAmount === "" ? null : form.paidAmount });
    setBusy(false);
    if (msg) return setErr(msg);
    setEditing(null);
    router.refresh();
  }

  async function saveAdsense() {
    setAsMsg("Saving…");
    const msg = await call("/api/admin/ad-settings", "PATCH", { ...as, adsenseEuConsentReady: euReady });
    setAsMsg(msg ?? "Saved.");
    if (!msg) router.refresh();
  }

  return (
    <div className="space-y-8">
      <div>
        <SectionHeading>Ads</SectionHeading>
        <p className="font-sans text-[13px] text-bk-body pl-[19px]">
          Ads are shown to visitors and to players and organizers on a free plan. Paid-plan accounts never see them, and they never appear on payment or room ID screens.
          Ads are currently <strong className={adsEnabled ? "text-bk-live" : "text-bk-muted"}>{adsEnabled ? "ON" : "OFF"}</strong> for the whole site.{" "}
          <Link href="/admin/settings/plans" className="underline text-bk-gold-light">Switch them on or off in Plans &amp; ads</Link>.
        </p>
      </div>

      {/* ---- sponsor campaigns ---- */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-sans font-bold text-bk-heading text-[15px]">Sponsor banners</h2>
          {editing === null && <button onClick={() => { setForm(blank); setErr(null); setEditing("new"); }} className={buttonClass("primary", "sm", "")}>New banner</button>}
        </div>
        <p className="font-sans text-[12px] text-bk-muted mb-3">Banners you sell directly to advertisers. They come first; Google AdSense below only fills places with no banner. Use a wide image, about 1200 × 300 px.</p>

        {editing !== null && (
          <Panel className="p-4 mb-4">
            <div className="grid sm:grid-cols-2 gap-x-4">
              <div><label className={label}>Campaign name (internal)</label><input className={field} value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={80} /></div>
              <div><label className={label}>Advertiser</label><input className={field} value={form.advertiser} onChange={(e) => set("advertiser", e.target.value)} maxLength={80} /></div>
              <div className="sm:col-span-2"><label className={label}>Link (opens when the banner is clicked)</label><input className={field} value={form.linkUrl} onChange={(e) => set("linkUrl", e.target.value)} placeholder="https://" /></div>
              <div className="sm:col-span-2"><label className={label}>Banner description (for screen readers)</label><input className={field} value={form.altText} onChange={(e) => set("altText", e.target.value)} maxLength={120} /></div>
            </div>
            <label className={label}>Banner image</label>
            <div className="flex flex-wrap items-center gap-3">
              {form.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.imageUrl} alt="" className="h-16 border border-bk-border" />
              )}
              <FileUpload bucket="tournament-assets" pathPrefix="ads" preset="photo" label={form.imageUrl ? "Replace image" : "Upload image"} onUploaded={(u) => set("imageUrl", u)} />
            </div>
            <label className={label}>Where to show it</label>
            <div className="flex flex-wrap gap-4">
              {AD_PLACEMENTS.map((p) => (
                <label key={p} className="flex items-center gap-2 font-sans text-[13px] text-bk-body">
                  <input type="checkbox" checked={form.placements.includes(p)} onChange={() => togglePlacement(p)} /> {AD_PLACEMENT_LABEL[p as AdPlacement]}
                </label>
              ))}
            </div>
            <div className="grid sm:grid-cols-3 gap-x-4">
              <div><label className={label}>Who sees it</label>
                <select className={field} value={form.audience} onChange={(e) => set("audience", e.target.value)}>{AD_AUDIENCES.map((a) => <option key={a} value={a}>{AD_AUDIENCE_LABEL[a]}</option>)}</select></div>
              <div><label className={label}>Starts</label><input type="date" className={field} value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} /></div>
              <div><label className={label}>Ends (empty = no end)</label><input type="date" className={field} value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} /></div>
              <div><label className={label}>Weight (1–10)</label><input type="number" min={1} max={10} className={field} value={form.weight} onChange={(e) => set("weight", e.target.value)} /></div>
              <div><label className={label}>Amount paid (optional)</label><input type="number" min={0} step="0.01" className={field} value={form.paidAmount} onChange={(e) => set("paidAmount", e.target.value)} /></div>
              <div><label className={label}>Currency</label>
                <select className={field} value={form.paidCurrency} onChange={(e) => set("paidCurrency", e.target.value)}>{LAUNCH_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></div>
            </div>
            <label className="flex items-center gap-2 font-sans text-[13px] text-bk-body mt-4"><input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} /> Active</label>
            {err && <p className="text-bk-live text-[12px] font-sans mt-3" role="alert">{err}</p>}
            <div className="flex gap-3 mt-4">
              <button disabled={busy} onClick={save} className={buttonClass("primary", "sm", "")}>{busy ? "Saving…" : "Save banner"}</button>
              <button disabled={busy} onClick={() => setEditing(null)} className={buttonClass("outline", "sm", "")}>Cancel</button>
            </div>
          </Panel>
        )}

        {campaigns.length === 0 && editing === null && <p className="font-sans text-[13px] text-bk-muted">No banners yet.</p>}
        <div className="space-y-3">
          {campaigns.map((c) => (
            <Panel key={c.id} className="p-4">
              <div className="flex flex-wrap gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.imageUrl} alt={c.altText} className="h-16 w-64 object-cover border border-bk-border" />
                <div className="flex-1 min-w-[220px]">
                  <p className="font-sans font-bold text-bk-heading text-[14px]">{c.name} <span className="font-normal text-bk-muted">· {c.advertiser}</span></p>
                  <p className="font-sans text-[12px] text-bk-muted mt-0.5">
                    {c.live ? <span className="text-bk-live">Showing now</span> : c.active ? "Scheduled or ended" : "Switched off"}
                    {" · "}{c.placements.map((p) => AD_PLACEMENT_LABEL[p as AdPlacement]?.split(" (")[0] ?? p).join(", ")}
                    {" · "}{AD_AUDIENCE_LABEL[c.audience as keyof typeof AD_AUDIENCE_LABEL] ?? c.audience}
                    {" · "}{day(c.startsAt)} → {c.endsAt ? day(c.endsAt) : "no end"}
                    {c.paidAmount !== null && ` · paid ${c.paidAmount} ${c.paidCurrency}`}
                  </p>
                  <p className="font-mono text-[12px] text-bk-body mt-1">
                    Last 30 days: {c.impressions30} views, {c.clicks30} clicks ({ctr(c.impressions30, c.clicks30)}) · All time: {c.impressions} views, {c.clicks} clicks ({ctr(c.impressions, c.clicks)})
                  </p>
                </div>
                <div className="flex gap-2 items-start">
                  <button onClick={async () => { const m = await call(`/api/admin/ads/${c.id}`, "PATCH", { active: !c.active }); if (m) setErr(m); else router.refresh(); }} className={buttonClass("outline", "sm", "")}>{c.active ? "Switch off" : "Switch on"}</button>
                  <button onClick={() => startEdit(c)} className={buttonClass("outline", "sm", "")}>Edit</button>
                  <button onClick={async () => { if (!confirm("Delete this banner and its counts for good?")) return; const m = await call(`/api/admin/ads/${c.id}`, "DELETE"); if (m) setErr(m); else router.refresh(); }} className="text-bk-live text-[11px] font-sans uppercase tracking-[0.5px] px-2">Delete</button>
                </div>
              </div>
            </Panel>
          ))}
        </div>
        {editing === null && err && <p className="text-bk-live text-[12px] font-sans mt-3" role="alert">{err}</p>}
      </section>

      {/* ---- AdSense ---- */}
      <section>
        <h2 className="font-sans font-bold text-bk-heading text-[15px] mb-1">Google AdSense (optional)</h2>
        <p className="font-sans text-[12px] text-bk-muted mb-3">
          Earns money automatically where no sponsor banner fits. You need an approved AdSense account for your live domain.
          Once you save a publisher ID, the site publishes <a href="/ads.txt" target="_blank" rel="noreferrer" className="underline text-bk-gold-light">/ads.txt</a> and
          adds the verification tag AdSense looks for on every page. Then create three display ad units in AdSense and paste their IDs below.
          Leave the publisher ID empty to keep AdSense off. Name AdSense in your Privacy Policy before using it.
        </p>
        <Panel className="p-4">
          <div className="grid sm:grid-cols-2 gap-x-4">
            <div className="sm:col-span-2"><label className={label}>Publisher ID</label><input className={field} value={as.adsenseClientId} onChange={(e) => setAs({ ...as, adsenseClientId: e.target.value })} placeholder="ca-pub-1234567890123456" /></div>
            <div><label className={label}>Ad unit: browse pages</label><input className={field} value={as.adsenseSlotBrowse} onChange={(e) => setAs({ ...as, adsenseSlotBrowse: e.target.value })} inputMode="numeric" /></div>
            <div><label className={label}>Ad unit: tournament page</label><input className={field} value={as.adsenseSlotTournament} onChange={(e) => setAs({ ...as, adsenseSlotTournament: e.target.value })} inputMode="numeric" /></div>
            <div><label className={label}>Ad unit: dashboards</label><input className={field} value={as.adsenseSlotDashboard} onChange={(e) => setAs({ ...as, adsenseSlotDashboard: e.target.value })} inputMode="numeric" /></div>
          </div>
          <label className="flex items-start gap-2 font-sans text-[13px] text-bk-body mt-4">
            <input type="checkbox" className="mt-1" checked={euReady} onChange={(e) => setEuReady(e.target.checked)} />
            <span>
              <strong className="text-bk-heading">Show AdSense in Europe too.</strong> Tick this only after you have a consent message live for visitors in the EU, UK and Switzerland
              (in AdSense: Privacy &amp; messaging, then publish a European regulations message). Google requires one for personalised ads there. Until then AdSense stays off for those visitors; sponsor banners are not affected.
            </span>
          </label>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={saveAdsense} className={buttonClass("primary", "sm", "")}>Save AdSense settings</button>
            {asMsg && <span className="font-sans text-[12px] text-bk-muted" role="status">{asMsg}</span>}
          </div>
        </Panel>
      </section>
    </div>
  );
}
