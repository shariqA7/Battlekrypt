import Link from "next/link";
import { listTournaments } from "@/lib/services/tournaments";

export default async function Home() {
  const [{ data: live }, { data: upcoming }] = await Promise.all([
    listTournaments({ status: "in_progress", limit: 3 }),
    listTournaments({ status: "published", limit: 6 }),
  ]);

  return (
    <main className="flex-1">
      <section className="px-6 py-20 max-w-3xl mx-auto text-center">
        <p className="text-bk-gold-light font-sans text-[11px] tracking-[1.5px] uppercase mb-4">
          Tournaments · Leagues · Daily Scrims
        </p>
        <h1 className="font-sans font-extrabold text-4xl text-bk-heading mb-4">
          Compete. Get paid. Get verified.
        </h1>
        <p className="font-sans text-bk-body text-base mb-8">
          Join tournaments across your favorite games, or host your own —
          from casual daily scrims to prize-backed championships.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/tournaments"
            className="bg-white text-bk-bg font-sans font-bold text-[13px] tracking-[0.5px] uppercase px-6 py-3"
          >
            Browse tournaments
          </Link>
          <Link
            href="/organizer/onboard"
            className="border border-bk-gold-light text-bk-gold-light font-sans font-bold text-[13px] tracking-[0.5px] uppercase px-6 py-3"
          >
            Host a tournament
          </Link>
        </div>
      </section>

      {live.length > 0 && (
        <section className="px-6 py-10 max-w-5xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-bk-live" />
            <h2 className="font-sans font-bold text-lg text-bk-heading">Live now</h2>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {live.map((t) => (
              <Link
                key={t.id}
                href={`/tournaments/${t.id}`}
                className="bg-bk-surface border border-bk-border p-4 hover:border-bk-gold-light transition-colors"
              >
                <p className="font-sans font-medium text-bk-heading text-sm">{t.name}</p>
                <p className="font-sans text-bk-muted text-xs mt-1">{t.game.name}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="px-6 py-10 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-sans font-bold text-lg text-bk-heading">Upcoming events</h2>
          <Link href="/tournaments" className="text-bk-gold-light font-sans text-[12px] uppercase tracking-[0.5px]">
            View all →
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-bk-muted font-sans text-sm">
            No tournaments published yet — check back soon.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {upcoming.map((t) => (
              <Link
                key={t.id}
                href={`/tournaments/${t.id}`}
                className="bg-bk-surface border border-bk-border p-4 hover:border-bk-gold-light transition-colors"
              >
                <p className="font-sans font-medium text-bk-heading text-sm">{t.name}</p>
                <p className="font-sans text-bk-muted text-xs mt-1">
                  {t.game.name} · {t.type}
                </p>
                {t.prizePoolAmount && (
                  <p className="font-mono text-bk-gold-light text-xs mt-2">
                    {t.prizePoolCurrency} {t.prizePoolAmount.toString()}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
