import { getPublicOrganizerProfile } from "@/lib/services/tournaments";
import { formatMoneyBreakdown } from "@/lib/money";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { notFound } from "next/navigation";
import Link from "next/link";
import InitialTile from "@/components/ui/InitialTile";
import Stat from "@/components/ui/Stat";
import { buttonClass } from "@/components/ui/Button";

export default async function OrganizerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organizer = await getPublicOrganizerProfile(id);
  if (!organizer) notFound();

  const socialLinks = (organizer.socialLinks ?? {}) as Record<string, string>;
  const totalVotes = organizer.likes + organizer.dislikes;

  return (
    <main className="flex-1 px-5 sm:px-6 py-10 max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-4 mb-5">
        <InitialTile name={organizer.orgName} size={64} />
        <div className="min-w-0">
          <p className="font-sans font-bold text-[11px] uppercase tracking-[1.6px] text-bk-muted mb-1">Organizer</p>
          <h1 className="font-sans font-extrabold text-2xl sm:text-3xl text-bk-heading flex items-center gap-2 flex-wrap">
            <span className="break-words min-w-0">{organizer.orgName}</span>
            {organizer.verified && <VerifiedBadge size={20} />}
          </h1>
        </div>
      </div>

      {organizer.bio && <p className="font-sans text-bk-body text-sm sm:text-base mb-5">{organizer.bio}</p>}

      <div className="flex flex-wrap gap-2 mb-8">
        {Object.entries(socialLinks).map(([platform, url]) =>
          url ? (
            <a
              key={platform}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass("outline", "sm")}
            >
              {platform}
            </a>
          ) : null
        )}
        <Link href={`/live?organizerId=${organizer.id}`} className={buttonClass("ghost", "sm")}>
          See live matches
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <Stat gold value={organizer.tournamentsHosted} label="Tournaments hosted" />
        <Stat value={formatMoneyBreakdown(organizer.prizeDistributed) || "—"} label="Prize pool distributed" />
      </div>

      {totalVotes > 0 && (
        <div className="bg-bk-surface border border-bk-border p-4 flex flex-wrap items-center gap-x-5 gap-y-1">
          <span className="font-mono text-lg text-bk-teal">👍 {organizer.likes}</span>
          <span className="font-mono text-lg text-bk-live">👎 {organizer.dislikes}</span>
          <span className="font-sans text-bk-muted text-[11px] uppercase tracking-[1.2px]">
            From players who joined their tournaments
          </span>
        </div>
      )}
    </main>
  );
}
