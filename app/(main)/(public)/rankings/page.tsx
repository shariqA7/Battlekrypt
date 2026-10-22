import Link from "next/link";
import { prisma } from "@/lib/prisma";
import InitialTile from "@/components/ui/InitialTile";
import { Panel, SectionHeading } from "@/components/ui/Panel";
import { countryName } from "@/lib/geo-data";
import { gameVisibilityWhere } from "@/lib/game-region";
import { getViewerRegion } from "@/lib/services/viewer-region";
import { getClubTeamRanking, getPlayerRanking, modesWithPlayers, rankedCounts } from "@/lib/services/rankings";
import { defaultMode, modeLabel, modeTabs, parseMode, parsePage } from "@/lib/ranking-modes";

export const metadata = { title: "Rankings" };
// Reads the viewer's country (which games they can see) and live ratings.
export const dynamic = "force-dynamic";

type Search = { game?: string; view?: string; mode?: string; page?: string; as?: string };

function href(q: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `/rankings?${s}` : "/rankings";
}

const pill = (active: boolean) =>
  `inline-flex items-center min-h-[36px] px-4 rounded-full border font-sans text-[12px] uppercase tracking-[0.8px] transition-colors ${
    active ? "border-bk-gold-from bg-bk-gold-from/15 text-bk-gold-light" : "border-bk-border text-bk-muted hover:text-bk-heading hover:border-bk-gold-from"
  }`;

export default async function RankingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const region = await getViewerRegion({ asCountry: sp.as });
  // The same rule as the Games page: only games available in the viewer's country.
  const visible = region.showAll ? {} : gameVisibilityWhere(region.country);
  const as = region.isAdmin && sp.as ? sp.as : undefined;

  // ---- step 1: pick a game -------------------------------------------------
  const selected = sp.game
    ? await prisma.game.findFirst({
        where: { id: sp.game, isApproved: true, ...visible },
        select: { id: true, name: true, genre: true, format: true, teamSizeMax: true },
      })
    : null;

  if (!selected) {
    const games = await prisma.game.findMany({
      where: { isApproved: true, ...visible },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    const counts = await rankedCounts(games.map((g) => g.id));
    const withData = (g: { id: string }) => (counts.players.get(g.id) ?? 0) + (counts.teams.get(g.id) ?? 0);
    // Games with ranked players first, then the rest A-Z.
    const sorted = [...games].sort((a, b) => withData(b) - withData(a) || a.name.localeCompare(b.name));

    return (
      <main className="flex-1 px-5 sm:px-6 py-10 max-w-6xl mx-auto w-full">
        <SectionHeading className="mb-2">Rankings</SectionHeading>
        <p className="font-sans text-bk-body text-sm mb-8 pl-[19px]">
          Pick a game to see its top players and club teams.
          {region.isAdmin && as && <> Previewing as a visitor from {countryName(as) ?? as}.</>}
        </p>
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {sorted.map((g) => {
            const p = counts.players.get(g.id) ?? 0;
            const t = counts.teams.get(g.id) ?? 0;
            return (
              <Link
                key={g.id}
                href={href({ game: g.id, as })}
                className="group flex items-center gap-3 bg-bk-surface border border-bk-border p-4 transition-colors hover:border-bk-gold-from hover:bg-bk-surface-hover"
              >
                <InitialTile name={g.name} />
                <div className="min-w-0">
                  <p className="font-sans font-bold text-bk-heading text-sm break-words group-hover:text-bk-gold-light">{g.name}</p>
                  <p className={`font-sans text-xs mt-0.5 ${p + t > 0 ? "text-bk-teal" : "text-bk-muted"}`}>
                    {p + t > 0 ? `${p} ranked ${p === 1 ? "player" : "players"}, ${t} club ${t === 1 ? "team" : "teams"}` : "No rankings yet"}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    );
  }

  // ---- step 2 and 3: players or clubs, then the mode ----------------------------
  const view = sp.view === "clubs" ? "clubs" : "players";
  const page = parsePage(sp.page);
  const base = { game: selected.id, as };

  const present = await modesWithPlayers(selected.id);
  const tabs = modeTabs(selected, present);
  const requested = parseMode(sp.mode);
  const mode = tabs.find((t) => t.mode === requested)?.mode ?? defaultMode(selected, present);

  const players = view === "players" && mode ? await getPlayerRanking(selected.id, mode, page) : null;
  const clubs = view === "clubs" ? await getClubTeamRanking(selected.id, page) : null;
  const data = players ?? clubs;
  const pages = data?.pages ?? 1;

  return (
    <main className="flex-1 px-5 sm:px-6 py-10 max-w-3xl mx-auto w-full">
      <Link href={href({ as })} className="font-sans text-[12px] text-bk-muted hover:text-bk-heading">&larr; All games</Link>
      <SectionHeading className="mt-3 mb-5">{selected.name} rankings</SectionHeading>

      <div className="flex flex-wrap gap-2 mb-3">
        <Link href={href({ ...base, view: "players", mode: mode ?? undefined })} className={pill(view === "players")}>Players</Link>
        <Link href={href({ ...base, view: "clubs" })} className={pill(view === "clubs")}>Clubs</Link>
      </div>

      {view === "players" && tabs.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6" aria-label="Mode">
          {tabs.map((t) => (
            <Link key={t.mode} href={href({ ...base, view: "players", mode: t.mode })} className={pill(t.mode === mode)}>
              {t.label}
            </Link>
          ))}
        </div>
      )}
      {view === "clubs" && (
        <p className="font-sans text-[12px] text-bk-muted mb-6">
          Club teams, ranked by team rating. A team appears after it has placed in a tournament.
        </p>
      )}

      {!data || data.rows.length === 0 ? (
        <Panel className="p-6 text-center">
          <p className="font-sans font-bold text-bk-heading mb-1">No rankings yet</p>
          <p className="font-sans text-[13px] text-bk-body">
            {view === "players"
              ? "Ratings are earned by placing in tournaments. Once players do, they appear here."
              : "No club team has placed in a tournament for this game yet."}
          </p>
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          <p className="px-4 pt-3 pb-1 font-sans text-[11px] uppercase tracking-[0.8px] text-bk-muted">
            {view === "players" && mode ? modeLabel(selected, mode) : "Club teams"} &middot; {data.total} ranked
          </p>
          <ol>
            {players?.rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3 border-t border-bk-border first:border-t-0">
                <span className="w-9 shrink-0 font-mono text-[13px] text-bk-gold-light">#{r.rank}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-sans text-[14px] text-bk-heading truncate">{r.name}</span>
                  {r.country && <span className="block font-sans text-[11px] text-bk-muted truncate">{r.country}</span>}
                </span>
                <span className="font-mono text-[14px] text-bk-heading">{r.rating}</span>
              </li>
            ))}
            {clubs?.rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3 border-t border-bk-border first:border-t-0">
                <span className="w-9 shrink-0 font-mono text-[13px] text-bk-gold-light">#{r.rank}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-sans text-[14px] text-bk-heading truncate">{r.team}</span>
                  <span className="block font-sans text-[11px] text-bk-muted truncate">{r.clubName}</span>
                </span>
                <span className="font-mono text-[14px] text-bk-heading">{r.rating}</span>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between mt-5 font-sans text-[12px]">
          {page > 1 ? (
            <Link href={href({ ...base, view, mode: mode ?? undefined, page: String(page - 1) })} className={pill(false)}>Previous</Link>
          ) : <span />}
          <span className="text-bk-muted">Page {Math.min(page, pages)} of {pages}</span>
          {page < pages ? (
            <Link href={href({ ...base, view, mode: mode ?? undefined, page: String(page + 1) })} className={pill(false)}>Next</Link>
          ) : <span />}
        </div>
      )}
    </main>
  );
}
