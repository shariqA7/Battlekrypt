"use client";

// The games list: search, a show/hide switch per game, and a link to edit. The switch saves
// straight away (same behaviour as Settings -> Features). Only people with edit access get it.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import InitialTile from "@/components/ui/InitialTile";
import { Panel } from "@/components/ui/Panel";
import { GAME_PLATFORM_LABELS, type GamePlatform } from "@/lib/game-details";
import type { AdminGameRow } from "@/lib/services/games-admin";

const input = "bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[34px] w-full sm:max-w-sm";

export default function GamesList({ initial, canEdit }: { initial: AdminGameRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [games, setGames] = useState(initial);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = games.filter((g) => `${g.name} ${g.genre ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));

  async function setVisible(g: AdminGameRow, next: boolean) {
    setBusy(g.id);
    setError(null);
    const res = await fetch(`/api/admin/games/${g.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isApproved: next }),
    });
    setBusy(null);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Couldn't save.");
    setGames((prev) => prev.map((x) => (x.id === g.id ? { ...x, isApproved: next } : x)));
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search games" aria-label="Search games" />
      {error && <p className="font-sans text-xs text-bk-live">{error}</p>}
      {shown.length === 0 && <p className="font-sans text-[13px] text-bk-muted">No games match that search.</p>}
      <div className="space-y-2">
        {shown.map((g) => (
          <Panel key={g.id} className="p-3 flex flex-wrap items-center gap-3">
            <InitialTile name={g.name} size={44} src={g.coverImageUrl} />
            <div className="min-w-0 flex-1">
              <p className="font-sans text-[13px] text-bk-heading font-bold break-words">
                {g.name}
                {g.isFeatured && <span className="ml-2 font-normal text-[10px] uppercase tracking-[0.8px] text-bk-gold-light">Featured</span>}
              </p>
              <p className="font-sans text-[11px] text-bk-muted">
                {[g.genre, g.platforms.map((p) => GAME_PLATFORM_LABELS[p as GamePlatform] ?? p).join(" / "), `${g.tournaments} tournaments`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <label className={`flex items-center gap-2 font-sans text-[11px] uppercase tracking-[0.8px] ${canEdit ? "cursor-pointer" : "opacity-60"}`}>
              <input
                type="checkbox"
                checked={g.isApproved}
                disabled={!canEdit || busy === g.id}
                onChange={(e) => setVisible(g, e.target.checked)}
              />
              <span className={g.isApproved ? "text-bk-teal" : "text-bk-muted"}>{g.isApproved ? "Visible" : "Hidden"}</span>
            </label>
            <Link href={`/admin/games/${g.id}`} className="font-sans font-bold text-[11px] uppercase tracking-[1.2px] border border-bk-border px-3 h-[34px] inline-flex items-center hover:border-bk-gold-from">
              {canEdit ? "Edit" : "View"}
            </Link>
          </Panel>
        ))}
      </div>
    </section>
  );
}
