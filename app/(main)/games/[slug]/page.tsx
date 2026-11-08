import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ButtonLink } from "@/components/ui/Button";
import InitialTile from "@/components/ui/InitialTile";
import { Panel, SectionHeading } from "@/components/ui/Panel";
import { GAME_PLATFORM_LABELS, type GamePlatform } from "@/lib/game-details";
import { gameVisibilityWhere } from "@/lib/game-region";
import { describeRules } from "@/lib/game-rules";
import { getViewerRegion } from "@/lib/services/viewer-region";
import GameGallery from "./GameGallery";

// Reads the visitor's country, so it can't be prerendered (same reason as /games).
export const dynamic = "force-dynamic";

async function loadGame(slug: string) {
  const region = await getViewerRegion();
  // Same rule as the list: hidden games and games not available in the visitor's country are not found.
  return prisma.game.findFirst({
    where: { slug, isApproved: true, ...(region.showAll ? {} : gameVisibilityWhere(region.country)) },
    include: { _count: { select: { tournaments: { where: { status: { in: ["registration_open", "in_progress"] } } } } } },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const game = await loadGame((await params).slug);
  return { title: game ? game.name : "Game not found", description: game?.shortDescription ?? undefined };
}

export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const game = await loadGame((await params).slug);
  if (!game) notFound();

  const rules = describeRules(game);
  const open = game._count.tournaments;
  const facts = [
    game.developer && ["Developer", game.developer],
    game.platforms.length > 0 && ["Platforms", game.platforms.map((p) => GAME_PLATFORM_LABELS[p as GamePlatform] ?? p).join(", ")],
    game.genre && ["Genre", game.genre],
    rules && ["Teams", rules],
  ].filter(Boolean) as [string, string][];

  return (
    <main className="flex-1 px-5 sm:px-6 py-10 max-w-4xl mx-auto w-full space-y-8">
      <Link href="/games" className="font-sans font-bold text-[11px] uppercase tracking-[1.2px] text-bk-body hover:text-bk-gold-light">
        ← All games
      </Link>

      <header className="flex items-start gap-4">
        <InitialTile name={game.name} size={72} src={game.coverImageUrl} />
        <div className="min-w-0">
          <SectionHeading>{game.name}</SectionHeading>
          {game.shortDescription && <p className="font-sans text-bk-body text-sm mt-2 pl-[19px]">{game.shortDescription}</p>}
        </div>
      </header>

      <GameGallery images={game.images} name={game.name} />

      {game.description && (
        <section>
          <h2 className="font-sans font-bold text-[11px] uppercase tracking-[1.6px] text-bk-muted mb-2">About</h2>
          <p className="font-sans text-bk-body text-sm leading-relaxed whitespace-pre-line break-words">{game.description}</p>
        </section>
      )}

      {facts.length > 0 && (
        <Panel className="p-4">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="font-sans font-bold text-[10px] uppercase tracking-[1.6px] text-bk-muted">{k}</dt>
                <dd className="font-sans text-[13px] text-bk-heading">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <ButtonLink href={`/tournaments?game=${encodeURIComponent(game.name)}`}>
          {open > 0 ? `See ${open} open or live tournament${open === 1 ? "" : "s"}` : "See tournaments"}
        </ButtonLink>
        {game.websiteUrl && (
          <a href={game.websiteUrl} target="_blank" rel="noopener noreferrer" className="font-sans font-bold text-[11px] uppercase tracking-[1.2px] text-bk-body hover:text-bk-gold-light">
            Official website ↗
          </a>
        )}
      </div>
    </main>
  );
}
