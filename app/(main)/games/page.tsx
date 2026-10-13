import Link from "next/link";
import { prisma } from "@/lib/prisma";
import InitialTile from "@/components/ui/InitialTile";
import { SectionHeading } from "@/components/ui/Panel";

// See app/(auth)/login/page.tsx for why this is needed — this page also
// queries the DB with no cookies/auth call, so it's otherwise eligible for
// static prerendering at build time.
export const dynamic = "force-dynamic";

export default async function GamesPage() {
  const games = await prisma.game.findMany({
    where: { isApproved: true },
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: { tournaments: { where: { status: { in: ["registration_open", "in_progress"] } } } },
      },
    },
  });

  return (
    <main className="flex-1 px-5 sm:px-6 py-10 max-w-6xl mx-auto w-full">
      <SectionHeading className="mb-2">Games</SectionHeading>
      <p className="font-sans text-bk-body text-sm mb-6 pl-[19px]">Pick a game to see its tournaments.</p>
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {games.map((g) => {
          const active = g._count.tournaments;
          return (
            <Link
              key={g.id}
              href={`/tournaments?game=${encodeURIComponent(g.name)}`}
              className="group flex items-center gap-3 bg-bk-surface border border-bk-border p-4 transition-colors hover:border-bk-gold-from hover:bg-bk-surface-hover"
            >
              <InitialTile name={g.name} />
              <div className="min-w-0">
                <p className="font-sans font-bold text-bk-heading text-sm break-words group-hover:text-bk-gold-light">{g.name}</p>
                <p className={`font-sans text-xs mt-0.5 ${active > 0 ? "text-bk-teal" : "text-bk-muted"}`}>
                  {active > 0 ? `${active} open or live` : g.category ?? "No open events"}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
