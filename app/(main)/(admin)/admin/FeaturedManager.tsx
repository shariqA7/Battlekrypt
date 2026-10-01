"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";

interface Slide {
  id: string;
  imageUrl: string;
  title: string;
  isActive: boolean;
  ownerName: string | null;
  ownerKind: "organization" | "club" | null;
  eligible: boolean;
}
interface Owner { kind: "organization" | "club"; id: string; name: string }
interface FeaturedRow { tournamentId: string; name: string; status: string }
interface Featurable { id: string; name: string }

const input = "bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[34px] w-full";
const btn = "bg-white text-bk-bg font-sans font-bold text-[11px] uppercase px-3 py-1.5 disabled:opacity-50";

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.ok) return { ok: true as const };
  const err = await res.json().catch(() => null);
  return { ok: false as const, message: (err?.error?.message as string) ?? "Something went wrong." };
}

export default function FeaturedManager({
  slides,
  owners,
  featured,
  featurable,
}: {
  slides: Slide[];
  owners: Owner[];
  featured: FeaturedRow[];
  featurable: Featurable[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [owner, setOwner] = useState(""); // "organization:ID" | "club:ID" | ""
  const [pick, setPick] = useState("");

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setError(r.message ?? "Something went wrong.");
    router.refresh();
  }

  async function addSlide() {
    const [kind, id] = owner.split(":");
    await run(async () => {
      const r = await call("/api/admin/featured/slides", "POST", {
        imageUrl, title, text, linkUrl,
        organizerId: kind === "organization" ? id : undefined,
        clubId: kind === "club" ? id : undefined,
      });
      if (r.ok) { setImageUrl(""); setTitle(""); setText(""); setLinkUrl(""); setOwner(""); }
      return r;
    });
  }

  return (
    <div className="space-y-10">
      {error && <p className="font-sans text-[12px] text-bk-live">{error}</p>}

      <section>
        <p className="font-sans font-medium text-bk-heading text-sm mb-1">Dashboard carousel</p>
        <p className="font-sans text-bk-muted text-xs mb-3">
          Big slides at the top of every dashboard. A slide tied to an organization or club only shows
          while that account&apos;s plan includes the carousel perk.
        </p>

        <div className="flex flex-col gap-2 mb-5">
          {slides.length === 0 && <p className="font-sans text-bk-muted text-xs">No slides yet.</p>}
          {slides.map((s) => (
            <div key={s.id} className="bg-bk-surface border border-bk-border p-3 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.imageUrl} alt="" className="h-14 w-24 object-cover shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-sans text-[13px] text-bk-heading truncate">{s.title}</p>
                <p className="font-sans text-[11px] text-bk-muted">
                  {s.ownerName ? `${s.ownerKind}: ${s.ownerName}` : "Platform announcement"}
                  {!s.eligible && <span className="text-bk-live"> · hidden (plan lapsed)</span>}
                  {!s.isActive && <span> · switched off</span>}
                </p>
              </div>
              <button type="button" disabled={busy} className={btn}
                onClick={() => run(() => call(`/api/admin/featured/slides/${s.id}`, "PATCH", { isActive: !s.isActive }))}>
                {s.isActive ? "Hide" : "Show"}
              </button>
              <button type="button" disabled={busy}
                className="border border-bk-border text-bk-body font-sans text-[11px] uppercase px-3 py-1.5 disabled:opacity-50"
                onClick={() => run(() => call(`/api/admin/featured/slides/${s.id}`, "DELETE"))}>
                Delete
              </button>
            </div>
          ))}
        </div>

        <div className="bg-bk-surface border border-bk-border p-3 space-y-2">
          <p className="font-sans text-[12px] text-bk-heading">Add a slide</p>
          <FileUpload bucket="tournament-assets" pathPrefix="featured" label="Upload slide image (wide, e.g. 1600×600)" onUploaded={setImageUrl} />
          {imageUrl && <p className="font-sans text-[11px] text-bk-muted">Image uploaded.</p>}
          <input className={input} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
          <input className={input} placeholder="Short text (optional)" value={text} onChange={(e) => setText(e.target.value)} maxLength={200} />
          <input className={input} placeholder="Link (optional, https://…)" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
          <select className={input} value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Platform announcement (no owner)</option>
            {owners.map((o) => (
              <option key={`${o.kind}:${o.id}`} value={`${o.kind}:${o.id}`}>
                {o.kind === "organization" ? "Organization" : "Club"} — {o.name}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy} className={btn} onClick={addSlide}>Add slide</button>
        </div>
      </section>

      <section>
        <p className="font-sans font-medium text-bk-heading text-sm mb-1">Featured tournaments</p>
        <p className="font-sans text-bk-muted text-xs mb-3">
          Hand-picked upcoming tournaments shown under the carousel (up to 12). They drop off
          automatically once they start.
        </p>
        <div className="flex flex-col gap-2 mb-3">
          {featured.length === 0 && <p className="font-sans text-bk-muted text-xs">None picked.</p>}
          {featured.map((f) => (
            <div key={f.tournamentId} className="bg-bk-surface border border-bk-border p-3 flex items-center justify-between gap-3">
              <p className="font-sans text-[13px] text-bk-heading">{f.name}</p>
              <button type="button" disabled={busy}
                className="border border-bk-border text-bk-body font-sans text-[11px] uppercase px-3 py-1.5 disabled:opacity-50"
                onClick={() => run(() => call(`/api/admin/featured/tournaments?tournamentId=${f.tournamentId}`, "DELETE"))}>
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <select className={input} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Choose an upcoming tournament…</option>
            {featurable.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button type="button" disabled={busy || !pick} className={btn}
            onClick={() => run(async () => { const r = await call("/api/admin/featured/tournaments", "POST", { tournamentId: pick }); if (r.ok) setPick(""); return r; })}>
            Feature
          </button>
        </div>
      </section>
    </div>
  );
}
