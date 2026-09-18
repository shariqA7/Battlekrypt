import Nav from "@/components/layout/Nav";
import { getPublicOrganizerProfile } from "@/lib/services/tournaments";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import Link from "next/link";
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

  return (
    <>
      <Nav />
      <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="font-sans font-extrabold text-2xl text-bk-heading">
            {organizer.orgName}
          </h1>
          {organizer.user.kycStatus === "approved" && <VerifiedBadge size={18} />}
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

        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="bg-bk-surface p-4">
            <p className="font-mono text-2xl text-bk-gold-light">
              {organizer._count.tournaments}
            </p>
            <p className="font-sans text-bk-muted text-xs uppercase tracking-[0.5px]">
              Tournaments hosted
            </p>
          </div>
          <div className="bg-bk-surface p-4">
            <p className="font-mono text-2xl text-bk-heading">
              {organizer.completedTournaments.length}
            </p>
            <p className="font-sans text-bk-muted text-xs uppercase tracking-[0.5px]">
              Completed
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
