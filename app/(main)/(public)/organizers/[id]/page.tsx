import { getPublicOrganizerProfile } from "@/lib/services/tournaments";
import { formatMoneyBreakdown } from "@/lib/money";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { notFound } from "next/navigation";

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
    <>
      <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="font-sans font-extrabold text-2xl text-bk-heading">
            {organizer.orgName}
          </h1>
          {organizer.verified && <VerifiedBadge size={18} />}
        </div>
        {organizer.bio && (
          <p className="font-sans text-bk-body text-sm mb-4">{organizer.bio}</p>
        )}

        {Object.keys(socialLinks).length > 0 && (
          <div className="flex gap-3 mb-6">
            {Object.entries(socialLinks).map(([platform, url]) =>
              url ? (
                <a
                  key={platform}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-bk-gold-light text-xs font-sans uppercase tracking-[0.5px]"
                >
                  {platform}
                </a>
              ) : null
            )}
          </div>
        )}

        <a
          href={`/live?organizerId=${organizer.id}`}
          className="inline-block text-bk-muted font-sans text-xs uppercase tracking-[0.5px] underline mb-6"
        >
          See live matches
        </a>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-bk-surface p-4">
            <p className="font-mono text-2xl text-bk-gold-light">
              {organizer.tournamentsHosted}
            </p>
            <p className="font-sans text-bk-muted text-xs uppercase tracking-[0.5px]">
              Tournaments hosted
            </p>
          </div>
          <div className="bg-bk-surface p-4">
            <p className="font-mono text-2xl text-bk-heading">
              {formatMoneyBreakdown(organizer.prizeDistributed)}
            </p>
            <p className="font-sans text-bk-muted text-xs uppercase tracking-[0.5px]">
              Prize pool distributed
            </p>
          </div>
        </div>

        {totalVotes > 0 && (
          <div className="bg-bk-surface p-4 mb-8 flex items-center gap-4">
            <span className="font-mono text-lg text-[#1D9E75]">👍 {organizer.likes}</span>
            <span className="font-mono text-lg text-bk-live">👎 {organizer.dislikes}</span>
            <span className="font-sans text-bk-muted text-xs uppercase tracking-[0.5px]">
              From players who joined their tournaments
            </span>
          </div>
        )}
      </main>
    </>
  );
}
