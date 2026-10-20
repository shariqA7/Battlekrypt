import { getViewerRegion } from "@/lib/services/viewer-region";
import { listTournaments } from "@/lib/services/tournaments";
import { Suspense } from "react";
import { isCountryCode, isRegionKey } from "@/lib/geo-data";
import FilterBar from "./FilterBar";

import AdSlot from "@/components/ui/AdSlot";
import TournamentCard from "@/components/tournaments/TournamentCard";
import { SectionHeading } from "@/components/ui/Panel";
export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const region = await getViewerRegion();
  const { data: tournaments, total } = await listTournaments({
    viewerCountry: region.showAll ? undefined : region.country,
    game: params.game || undefined,
    search: params.search || undefined,
    type: (params.type || undefined) as never,
    mode: (params.mode || undefined) as never,
    entryType: (params.entryType || undefined) as never,
    audienceScope: (params.audienceScope || undefined) as never,
    venueType: (params.venueType || undefined) as never,
    country: isCountryCode(params.country) ? params.country : undefined,
    region: isRegionKey(params.region) ? params.region : undefined,
    page: params.page ? Number(params.page) : undefined,
  });

  return (
    <>
      <main className="flex-1 px-5 sm:px-6 py-10 max-w-6xl mx-auto w-full">
        <SectionHeading className="mb-2">Tournaments</SectionHeading>
        <p className="font-sans text-bk-body text-sm mb-6 pl-[19px]">
          {total} tournament{total !== 1 ? "s" : ""} found
        </p>

        <Suspense fallback={null}>
          <FilterBar />
        </Suspense>

        {tournaments.length === 0 ? (
          <p className="text-bk-muted font-sans text-sm">
            No tournaments match. Try clearing a filter, or check back once organizers publish more.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tournaments.map((t) => (
              <TournamentCard key={t.id} t={t} />
            ))}
          </div>
        )}
        <AdSlot placement="browse" />
      </main>
    </>
  );
}
