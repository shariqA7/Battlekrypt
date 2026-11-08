"use client";

// Add or edit one game. Pictures upload straight to the public `game-assets` bucket (same
// FileUpload as the rest of the admin panel); the form only keeps their links and order.
// The server re-checks everything (lib/game-details.ts), so this is just the friendly layer.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { GENRES } from "@/lib/game-catalog";
import { GAME_BUCKET, GAME_LIMITS, GAME_PLATFORMS, GAME_PLATFORM_LABELS, type GamePlatform } from "@/lib/game-details";
import type { AdminGameDetail } from "@/lib/services/games-admin";

const input = "bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[34px] w-full disabled:opacity-60";
const area = "bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2 w-full disabled:opacity-60";
const label = "block font-sans font-bold text-[11px] uppercase tracking-[0.8px] text-bk-muted mb-1";
const small = "font-sans text-[11px] uppercase tracking-[0.8px] border border-bk-border px-2 h-[28px] disabled:opacity-40 hover:border-bk-gold-from";
const IMAGE_TYPES = "image/png,image/jpeg,image/webp";

export default function GameForm({
  mode,
  game,
  canEdit,
  canDelete,
}: {
  mode: "create" | "edit";
  game?: AdminGameDetail;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(game?.name ?? "");
  const [genre, setGenre] = useState(game?.genre ?? "");
  const [shortDescription, setShort] = useState(game?.shortDescription ?? "");
  const [description, setDescription] = useState(game?.description ?? "");
  const [developer, setDeveloper] = useState(game?.developer ?? "");
  const [websiteUrl, setWebsite] = useState(game?.websiteUrl ?? "");
  const [platforms, setPlatforms] = useState<GamePlatform[]>((game?.platforms ?? []) as GamePlatform[]);
  const [sortOrder, setSortOrder] = useState(String(game?.sortOrder ?? 0));
  const [isFeatured, setFeatured] = useState(game?.isFeatured ?? false);
  const [isApproved, setApproved] = useState(game?.isApproved ?? true);
  const [coverImageUrl, setCover] = useState<string | null>(game?.coverImageUrl ?? null);
  const [images, setImages] = useState<string[]>(game?.images ?? []);
  const [uploads, setUploads] = useState(0); // bumps to reset the upload boxes after each file

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const nameLocked = mode === "edit" && !!game?.seeded;
  const inUse = game ? Object.values(game.usage).some((n) => n > 0) : false;

  const togglePlatform = (p: GamePlatform) =>
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  function move(i: number, by: -1 | 1) {
    setImages((prev) => {
      const j = i + by;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const body = {
      ...(nameLocked ? {} : { name }),
      genre, shortDescription, description, developer, websiteUrl, platforms,
      sortOrder, isFeatured, isApproved, coverImageUrl, images,
    };
    const res = await fetch(mode === "create" ? "/api/admin/games" : `/api/admin/games/${game!.id}`, {
      method: mode === "create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error?.message ?? "Couldn't save.");
    if (mode === "create") return router.push(`/admin/games/${data.id}`);
    setSaved(true);
    router.refresh();
  }

  async function remove() {
    if (!game || !confirm(`Delete "${game.name}" for good? This can't be undone.`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/games/${game.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Couldn't delete.");
    router.push("/admin/games");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-4 max-w-3xl">
      {!canEdit && <p className="font-sans text-[12px] text-bk-muted">You can view this game but not change it.</p>}

      <fieldset disabled={!canEdit || busy} className="space-y-4 min-w-0">
        <Panel className="p-4 space-y-3">
          <div>
            <label className={label} htmlFor="g-name">Name</label>
            <input id="g-name" className={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={GAME_LIMITS.name} required disabled={nameLocked || !canEdit} />
            {nameLocked && <p className="font-sans text-[11px] text-bk-muted mt-1">Built-in game: the name is fixed. You can still hide it or change everything else.</p>}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="g-genre">Genre</label>
              <select id="g-genre" className={input} value={genre} onChange={(e) => setGenre(e.target.value)}>
                <option value="">None</option>
                {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="g-dev">Developer</label>
              <input id="g-dev" className={input} value={developer} onChange={(e) => setDeveloper(e.target.value)} maxLength={GAME_LIMITS.developer} />
            </div>
          </div>
          <div>
            <span className={label}>Platforms</span>
            <div className="flex flex-wrap gap-4">
              {GAME_PLATFORMS.map((p) => (
                <label key={p} className="flex items-center gap-2 font-sans text-[13px] text-bk-heading">
                  <input type="checkbox" checked={platforms.includes(p)} onChange={() => togglePlatform(p)} />
                  {GAME_PLATFORM_LABELS[p]}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className={label} htmlFor="g-web">Website</label>
            <input id="g-web" className={input} value={websiteUrl} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" maxLength={GAME_LIMITS.url} />
          </div>
        </Panel>

        <Panel className="p-4 space-y-3">
          <div>
            <label className={label} htmlFor="g-short">Short description <span className="normal-case font-normal">(shown on the game tile, {GAME_LIMITS.shortDescription} characters)</span></label>
            <input id="g-short" className={input} value={shortDescription} onChange={(e) => setShort(e.target.value)} maxLength={GAME_LIMITS.shortDescription} />
          </div>
          <div>
            <label className={label} htmlFor="g-desc">Description <span className="normal-case font-normal">(shown on the game page)</span></label>
            <textarea id="g-desc" className={area} rows={6} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={GAME_LIMITS.description} />
          </div>
        </Panel>

        <Panel className="p-4 space-y-4">
          <div>
            <span className={label}>Cover picture <span className="normal-case font-normal">(the tile on the Games page)</span></span>
            {coverImageUrl && (
              <div className="flex items-center gap-3 mb-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverImageUrl} alt="" className="w-32 h-20 object-cover border border-bk-border" />
                {canEdit && <button type="button" className={small} onClick={() => setCover(null)}>Remove</button>}
              </div>
            )}
            {canEdit && (
              <FileUpload
                key={`cover-${uploads}`}
                bucket={GAME_BUCKET}
                pathPrefix="covers"
                accept={IMAGE_TYPES}
                label={coverImageUrl ? "Replace cover picture" : "Upload cover picture"}
                onUploaded={(url) => { setCover(url); setUploads((n) => n + 1); }}
              />
            )}
          </div>

          <div>
            <span className={label}>Gallery <span className="normal-case font-normal">({images.length} of {GAME_LIMITS.maxImages}; shown in this order on the game page)</span></span>
            {images.length > 0 && (
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                {images.map((url, i) => (
                  <li key={url} className="border border-bk-border p-2 space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full h-24 object-cover" />
                    {canEdit && (
                      <div className="flex gap-1 flex-wrap">
                        <button type="button" className={small} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move earlier">←</button>
                        <button type="button" className={small} disabled={i === images.length - 1} onClick={() => move(i, 1)} aria-label="Move later">→</button>
                        <button type="button" className={`${small} text-bk-live`} onClick={() => setImages((prev) => prev.filter((x) => x !== url))}>Remove</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && images.length < GAME_LIMITS.maxImages && (
              <FileUpload
                key={`gallery-${uploads}`}
                bucket={GAME_BUCKET}
                pathPrefix="gallery"
                accept={IMAGE_TYPES}
                label="Add a picture to the gallery"
                onUploaded={(url) => { setImages((prev) => (prev.includes(url) ? prev : [...prev, url])); setUploads((n) => n + 1); }}
              />
            )}
            <p className="font-sans text-[11px] text-bk-muted mt-1">PNG, JPG or WebP, up to 5 MB each. Removing a picture here deletes it when you save.</p>
          </div>
        </Panel>

        <Panel className="p-4 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" className="mt-1" checked={isApproved} onChange={(e) => setApproved(e.target.checked)} />
            <span>
              <span className="font-sans text-[13px] text-bk-heading font-bold">Visible to players <span className={`font-normal text-[11px] uppercase tracking-[0.8px] ${isApproved ? "text-bk-teal" : "text-bk-muted"}`}>{isApproved ? "On" : "Off"}</span></span>
              <span className="block font-sans text-[12px] text-bk-body">{isApproved ? "Players can find this game and its page, and organizers can pick it." : "Hidden from the Games page and its own page. Existing tournaments keep their game."}</span>
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={isFeatured} onChange={(e) => setFeatured(e.target.checked)} />
            <span className="font-sans text-[13px] text-bk-heading">Featured <span className="text-bk-muted text-[12px]">(listed first in its genre)</span></span>
          </label>
          <div className="max-w-[160px]">
            <label className={label} htmlFor="g-order">Order</label>
            <input id="g-order" className={input} inputMode="numeric" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            <p className="font-sans text-[11px] text-bk-muted mt-1">Lower comes first. Games with the same number go A to Z.</p>
          </div>
        </Panel>
      </fieldset>

      {error && <p className="font-sans text-xs text-bk-live" role="alert">{error}</p>}
      {saved && <p className="font-sans text-xs text-bk-teal" role="status">Saved.</p>}

      <div className="flex flex-wrap items-center gap-3">
        {canEdit && <Button type="submit" disabled={busy}>{busy ? "Saving…" : mode === "create" ? "Add game" : "Save changes"}</Button>}
        <Link href="/admin/games" className="font-sans font-bold text-[11px] uppercase tracking-[1.2px] text-bk-body hover:text-bk-gold-light">Back to games</Link>
        {mode === "edit" && game?.slug && game.isApproved && (
          <Link href={`/games/${game.slug}`} className="font-sans font-bold text-[11px] uppercase tracking-[1.2px] text-bk-body hover:text-bk-gold-light">View public page</Link>
        )}
      </div>

      {mode === "edit" && canDelete && game && (
        <Panel className="p-4 space-y-2">
          <p className="font-sans font-bold text-[11px] uppercase tracking-[1.6px] text-bk-live">Delete game</p>
          <p className="font-sans text-[12px] text-bk-body">
            {game.seeded
              ? "This is a built-in game and would come back on the next update. Hide it instead."
              : inUse
              ? "This game is used by tournaments, challenges, clubs or ratings, so it can't be deleted. Hide it instead."
              : "Only super admins can delete a game. This can't be undone."}
          </p>
          <Button variant="danger" size="sm" disabled={busy || game.seeded || inUse} onClick={remove}>Delete game</Button>
        </Panel>
      )}
    </form>
  );
}
