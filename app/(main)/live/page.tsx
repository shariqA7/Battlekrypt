import Link from "next/link";
import { Suspense } from "react";
import { listTournaments } from "@/lib/services/tournaments";
import { prisma } from "@/lib/prisma";
import LiveFilterBar from "./LiveFilterBar";

// Prefer a livestream-first platform when deep-linking to an organizer's
// stream (spec §10) — Discord/Instagram/etc. aren't "watch this live" links.
const STREAM_PLATFORMS = ["twitch", "youtube"] as const;

export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const organizerId = params.organizerId || undefined;

  const [{ data: tournaments }, organizer] = await Promise.all([
    listTournaments({ status: "in_progress", game: params.game || undefined, organizerId, limit: 50 }),
    organizerId
      ? prisma.organizerProfile.findUnique({ where: { id: organizerId }, select: { orgName: true } })
      : Promise.resolve(null),
  ]);

  return (
    <main className="flex-1 px-6 py-10 max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-2 mb-6">
        <span className="w-2 h-2 rounded-full bg-bk-live" />
        <h1 className="font-sans font-extrabold text-2xl text-bk-heading">Live now</h1>
      </div>

      <Suspense fallback={null}>
        <LiveFilterBar organizerName={organizer?.orgName} />
      </Suspense>

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
          {tournaments.map((t) => {
            const socialLinks = (t.organizer.socialLinks ?? {}) as Record<string, string>;
            const streamUrl = STREAM_PLATFORMS.map((p) => socialLinks[p]).find(Boolean);

            return (
              <div
                key={t.id}
                className="bg-bk-surface border border-bk-border p-4 flex items-center justify-between hover:border-bk-gold-light transition-colors"
              >
                <Link href={`/tournaments/${t.slug}`} className="flex-1">
                  <p className="font-sans font-medium text-bk-heading text-sm">{t.name}</p>
                  <p className="font-sans text-bk-muted text-xs mt-1">
                    {t.game.name} ·{" "}
                    {t.organizer.orgName}
                  </p>
                </Link>
                <div className="flex items-center gap-3">
                  {streamUrl && (
                    <a
                      href={streamUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-bk-gold-light text-[11px] font-sans uppercase tracking-[0.5px] underline whitespace-nowrap"
                    >
                      Watch stream ↗
                    </a>
                  )}
                  <span className="bg-[rgba(239,68,68,0.15)] text-bk-live text-[10px] font-sans uppercase tracking-[0.5px] px-2 py-1 whitespace-nowrap">
                    Live
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
