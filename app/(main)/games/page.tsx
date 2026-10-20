import Link from "next/link";
import { prisma } from "@/lib/prisma";
import InitialTile from "@/components/ui/InitialTile";
import { SectionHeading } from "@/components/ui/Panel";
import { describeRules, groupByGenre } from "@/lib/game-rules";
import { gameVisibilityWhere, regionalGroups, toCountryCode } from "@/lib/game-region";
import { countryName } from "@/lib/geo-data";
import { getViewerRegion } from "@/lib/services/viewer-region";

// See app/(auth)/login/page.tsx for why this is needed — this page also
// queries the DB with no cookies/auth call, so it's otherwise eligible for
// static prerendering at build time.
export const dynamic = "force-dynamic";

type GameRow = Awaited<ReturnType<typeof loadGames>>[number];

async function loadGames(where: object) {
  return prisma.game.findMany({
    where: { isApproved: true, ...where },
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: { tournaments: { where: { status: { in: ["registration_open", "in_progress"] } } } },
      },
    },
  });
}

function GameTile({ g, note }: { g: GameRow; note?: string | null }) {
  const active = g._count.tournaments;
  const rules = describeRules(g);
  return (
    <Link
      href={`/tournaments?game=${encodeURIComponent(g.name)}`}
      className="group flex items-center gap-3 bg-bk-surface border border-bk-border p-4 transition-colors hover:border-bk-gold-from hover:bg-bk-surface-hover"
    >
      <InitialTile name={g.name} />
      <div className="min-w-0">
        <p className="font-sans font-bold text-bk-heading text-sm break-words group-hover:text-bk-gold-light">{g.name}</p>
        {rules && <p className="font-mono text-bk-muted text-[11px] mt-0.5">{rules}</p>}
        {note && <p className="font-sans text-bk-amber text-[11px] mt-0.5">{note}</p>}
        <p className={`font-sans text-xs mt-0.5 ${active > 0 ? "text-bk-teal" : "text-bk-muted"}`}>
          {active > 0 ? `${active} open or live` : "No open events"}
        </p>
      </div>
    </Link>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">{children}</div>;
}

export default async function GamesPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const { as } = await searchParams;
  const region = await getViewerRegion({ asCountry: as });

  // Admins (not previewing) see every game; everyone else only games available in their country.
  const games = await loadGames(region.showAll ? {} : gameVisibilityWhere(region.country));

  // Admin view: ordinary games by genre, then each country's local versions under that country.
  const everyday = games.filter((g) => (g.onlyInCountries ?? []).length === 0);
  const groups = groupByGenre(region.showAll ? everyday : games);
  const regional = region.showAll ? regionalGroups(games) : [];
  const previewable = region.showAll ? regional : [];
  const hiddenIn = (g: GameRow) =>
    region.showAll && g.blockedInCountries.length > 0
      ? `Hidden in ${g.blockedInCountries.map((c) => countryName(c) ?? c).join(", ")}`
      : null;

  return (
    <main className="flex-1 px-5 sm:px-6 py-10 max-w-6xl mx-auto w-full">
      <SectionHeading className="mb-2">Games</SectionHeading>
      <p className="font-sans text-bk-body text-sm mb-8 pl-[19px]">Pick a game to see its tournaments.</p>

      {region.isAdmin && (
        <div className="mb-8 bg-bk-surface border border-bk-border p-4">
          <p className="font-sans text-bk-body text-[12px]">
            {region.showAll ? (
              <>Admin view: every game is shown. Local versions are listed under their country.</>
            ) : (
              <>
                Previewing as a visitor from <strong className="text-bk-heading">{countryName(toCountryCode(as)) ?? as}</strong>.
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {region.showAll ? (
              previewable.map((p) => (
                <Link key={p.code} href={`/games?as=${p.code}`} className="font-sans text-[11px] uppercase tracking-[0.8px] border border-bk-border px-3 min-h-[32px] inline-flex items-center hover:border-bk-gold-from">
                  Preview as {p.label}
                </Link>
              ))
            ) : (
              <Link href="/games" className="font-sans text-[11px] uppercase tracking-[0.8px] border border-bk-border px-3 min-h-[32px] inline-flex items-center hover:border-bk-gold-from">
                Back to admin view
              </Link>
            )}
          </div>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.genre} className="mb-10">
          <h2 className="font-sans font-bold text-[11px] uppercase tracking-[1.6px] text-bk-muted mb-3">{group.genre}</h2>
          <Grid>
            {group.games.map((g) => (
              <GameTile key={g.id} g={g} note={hiddenIn(g)} />
            ))}
          </Grid>
        </section>
      ))}

      {regional.map((r) => (
        <section key={r.code} className="mb-10">
          <h2 className="font-sans font-bold text-[11px] uppercase tracking-[1.6px] text-bk-gold-light mb-1">{r.label}: local versions</h2>
          <p className="font-sans text-bk-muted text-[12px] mb-3">Shown only to visitors in {r.label}, in place of the global version.</p>
          <Grid>
            {r.games.map((g) => (
              <GameTile key={g.id} g={g} note={g.localVersionOf ? `Local version of ${g.localVersionOf}` : null} />
            ))}
          </Grid>
        </section>
      ))}
    </main>
  );
}
