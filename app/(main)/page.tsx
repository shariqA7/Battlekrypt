import { getViewerRegion } from "@/lib/services/viewer-region";
import { listTournaments } from "@/lib/services/tournaments";
import TournamentCard from "@/components/tournaments/TournamentCard";
import { ButtonLink } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/Panel";
import Link from "next/link";

export default async function Home() {
  // Hide tournaments of games that aren't available where this visitor is.
  const region = await getViewerRegion();
  const viewerCountry = region.showAll ? undefined : region.country;
  const [{ data: live }, { data: upcoming }] = await Promise.all([
    listTournaments({ status: "in_progress", limit: 3, viewerCountry }),
    listTournaments({ status: "published", limit: 6, viewerCountry }),
  ]);

  return (
    <main className="flex-1">
      <section className="relative overflow-hidden border-b border-bk-border-soft">
        {/* soft gold glow behind the headline; decorative only */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-24 h-72 opacity-60"
          style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(244,200,66,0.18), transparent 70%)" }}
        />
        <div className="relative px-5 sm:px-6 py-16 sm:py-24 max-w-3xl mx-auto text-center">
          <p className="text-bk-gold-light font-sans font-bold text-[11px] tracking-[1.6px] uppercase mb-4">
            Tournaments · Leagues · Daily Scrims
          </p>
          <h1 className="font-sans font-extrabold text-[34px] sm:text-5xl leading-[1.1] text-bk-heading mb-4">
            Compete. Get paid. <span className="text-bk-gold-light">Get verified.</span>
          </h1>
          <p className="font-sans text-bk-body text-base sm:text-lg mb-8">
            Join tournaments across your favorite games, or host your own, from casual daily scrims to prize-backed
            championships.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <ButtonLink href="/tournaments" size="lg">
              Browse tournaments
            </ButtonLink>
            <ButtonLink href="/organizer/register" variant="outline" size="lg">
              Host a tournament
            </ButtonLink>
          </div>
        </div>
      </section>

      {live.length > 0 && (
        <section className="px-5 sm:px-6 pt-12 max-w-6xl mx-auto w-full">
          <div className="flex items-center justify-between gap-3 mb-5">
            <SectionHeading className="!text-[20px] sm:!text-[22px]">
              <span className="inline-flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-bk-live animate-pulse" />
                Live now
              </span>
            </SectionHeading>
            <Link href="/live" className="shrink-0 text-bk-gold-light font-sans font-bold text-[12px] uppercase tracking-[0.8px]">
              Watch →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {live.map((t) => (
              <TournamentCard key={t.id} t={t} />
            ))}
          </div>
        </section>
      )}

      <section className="px-5 sm:px-6 py-12 max-w-6xl mx-auto w-full">
        <div className="flex items-center justify-between gap-3 mb-5">
          <SectionHeading className="!text-[20px] sm:!text-[22px]">Upcoming events</SectionHeading>
          <Link href="/tournaments" className="shrink-0 text-bk-gold-light font-sans font-bold text-[12px] uppercase tracking-[0.8px]">
            View all →
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-bk-muted font-sans text-sm">No tournaments published yet. Check back soon.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {upcoming.map((t) => (
              <TournamentCard key={t.id} t={t} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
