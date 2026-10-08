import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { listOpenChallenges } from "@/lib/services/challenges";
import { prizeLabel, POSTER_LABEL, ENTRANT_LABEL } from "@/lib/challenge-format";

export default async function ChallengesPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const { game } = await searchParams;
  const [challenges, games] = await Promise.all([
    listOpenChallenges({ gameId: game }),
    prisma.game.findMany({ where: { isApproved: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <main className="flex-1 px-6 py-10 max-w-3xl mx-auto w-full">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-sans font-extrabold text-2xl text-bk-heading">Challenges</h1>
          <p className="font-sans text-bk-body text-[13px]">
            Beat a squad or hit a target and win the prize the poster offers.
          </p>
        </div>
        <div className="flex gap-3 shrink-0">
          <Link href="/challenges/applied" className="font-sans text-[12px] text-bk-muted underline self-center">
            My applications
          </Link>
          <Link href="/challenges/mine" className="font-sans text-[12px] text-bk-muted underline self-center">
            My challenges
          </Link>
          <Link
            href="/challenges/new"
            className="bg-bk-primary text-bk-on-primary font-sans font-bold text-[12px] uppercase tracking-[0.6px] px-4 py-2"
          >
            Post a challenge
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 font-sans text-[12px]">
        <Link href="/challenges" className={!game ? "text-bk-heading underline" : "text-bk-muted"}>All games</Link>
        {games.map((g) => (
          <Link key={g.id} href={`/challenges?game=${g.id}`} className={game === g.id ? "text-bk-heading underline" : "text-bk-muted"}>
            {g.name}
          </Link>
        ))}
      </div>

      {challenges.length === 0 ? (
        <p className="font-sans text-[13px] text-bk-muted">No open challenges right now.</p>
      ) : (
        <ul className="space-y-3">
          {challenges.map((c) => (
            <li key={c.id}>
              <Link href={`/challenges/${c.id}`} className="block bg-bk-surface border border-bk-border p-4 hover:border-bk-gold-light/60">
                <div className="flex justify-between gap-4">
                  <p className="font-sans font-bold text-bk-heading">{c.title}</p>
                  <p className="font-sans font-bold text-bk-gold-light shrink-0">{prizeLabel(c)}</p>
                </div>
                <p className="font-sans text-[12px] text-bk-muted mt-1">
                  {c.game.name} · {POSTER_LABEL[c.posterType]}: {c.posterName}
                </p>
                <p className="font-sans text-[12px] text-bk-body mt-2">
                  {c.slots} slot{c.slots === 1 ? "" : "s"}
                  {c.minRating ? ` · rating ${c.minRating}+` : ""}
                  {" · "}
                  {ENTRANT_LABEL[c.entrantType]}
                  {" · "}{c._count.applications}/{c.maxApplicants} applied
                  {" · "}closes {c.applicationsCloseAt.toLocaleDateString()}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
