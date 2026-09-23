import Link from "next/link";
import { listTournaments } from "@/lib/services/tournaments";

export default async function LivePage() {
  const { data: tournaments } = await listTournaments({ status: "in_progress", limit: 50 });

  return (
    <main className="flex-1 px-6 py-10 max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-2 mb-6">
        <span className="w-2 h-2 rounded-full bg-bk-live" />
        <h1 className="font-sans font-extrabold text-2xl text-bk-heading">Live now</h1>
      </div>

      {tournaments.length === 0 ? (
        <p className="text-bk-muted font-sans text-sm">
          Nothing is live right now — check{" "}
          <Link href="/tournaments" className="text-bk-gold-light underline">
            all tournaments
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {tournaments.map((t) => (
            <Link
              key={t.id}
              href={`/tournaments/${t.slug}`}
              className="bg-bk-surface border border-bk-border p-4 flex items-center justify-between hover:border-bk-gold-light transition-colors"
            >
              <div>
                <p className="font-sans font-medium text-bk-heading text-sm">{t.name}</p>
                <p className="font-sans text-bk-muted text-xs mt-1">
                  {t.game.name} · by {t.organizer.orgName}
                </p>
              </div>
              <span className="bg-[rgba(239,68,68,0.15)] text-bk-live text-[10px] font-sans uppercase tracking-[0.5px] px-2 py-1">
                Live
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
