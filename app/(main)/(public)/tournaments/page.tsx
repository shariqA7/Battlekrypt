import { listTournaments } from "@/lib/services/tournaments";
import { formatMoney } from "@/lib/money";
import Link from "next/link";
import { Suspense } from "react";
import FilterBar from "./FilterBar";

import AdSlot from "@/components/ui/AdSlot";
export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const { data: tournaments, total } = await listTournaments({
    game: params.game || undefined,
    search: params.search || undefined,
    type: (params.type || undefined) as never,
    mode: (params.mode || undefined) as never,
    entryType: (params.entryType || undefined) as never,
    audienceScope: (params.audienceScope || undefined) as never,
    venueType: (params.venueType || undefined) as never,
    page: params.page ? Number(params.page) : undefined,
  });

  return (
    <>
      <main className="flex-1 px-6 py-10 max-w-5xl mx-auto w-full">
        <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-1">
          Tournaments
        </h1>
        <p className="font-sans text-bk-body text-sm mb-4">
          {total} tournament{total !== 1 ? "s" : ""} found
        </p>

        <Suspense fallback={null}>
          <FilterBar />
        </Suspense>

        {tournaments.length === 0 ? (
          <p className="text-bk-muted font-sans text-sm">
            No tournaments yet — once organizers start publishing, they&apos;ll
            show up here.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {tournaments.map((t) => (
              <Link
                key={t.id}
                href={`/tournaments/${t.slug}`}
                className="bg-bk-surface border border-bk-border p-4 flex items-center justify-between hover:border-bk-gold-light transition-colors"
              >
                <div>
                  <p className="font-sans font-medium text-bk-heading text-sm">
                    {t.name}
                  </p>
                  <p className="font-sans text-bk-muted text-xs mt-1">
                    {t.game.name} · {t.type} · {t.mode}
                    {t.venueType === "hybrid" && (
                      <span className="ml-2 text-bk-gold-light uppercase tracking-[0.5px] text-[10px]">Hybrid</span>
                    )}
                    {t.venueType === "lan" && (
                      <span className="ml-2 text-bk-gold-light uppercase tracking-[0.5px] text-[10px]">
                        LAN{t.venueCity ? ` · ${t.venueCity}` : ""}
                      </span>
                    )}
                    {t.audienceScope === "institution" && (
                      <span className="ml-2 text-bk-gold-light uppercase tracking-[0.5px] text-[10px]">
                        Students only
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  {t.prizePoolAmount ? (
                    <p className="font-mono text-bk-gold-light text-sm">
                      {formatMoney(t.prizePoolAmount, t.prizePoolCurrency ?? "PKR")}
                    </p>
                  ) : (
                    <p className="font-sans text-bk-muted text-xs uppercase tracking-[0.5px]">
                      Free
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
        <AdSlot placement="browse" />
      </main>
    </>
  );
}
