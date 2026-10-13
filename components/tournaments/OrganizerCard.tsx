import Link from "next/link";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { TrophyIcon } from "@/components/ui/icons";

// "Organized by" card from the mockup: logo tile, name, verified mark and how
// many events they have completed.
export default function OrganizerCard({
  id,
  name,
  avatarUrl,
  verified,
  eventsHosted,
}: {
  id: string;
  name: string;
  avatarUrl: string | null;
  verified: boolean;
  eventsHosted: number;
}) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <Link href={`/organizers/${id}`} className="flex items-center gap-4 bg-bk-surface border border-bk-border p-5 hover:border-bk-gold-to transition-colors">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="w-16 h-16 object-cover border border-bk-border shrink-0" />
      ) : (
        <span aria-hidden className="w-16 h-16 shrink-0 bg-bk-gold-gradient text-bk-on-gold font-sans font-extrabold text-xl inline-flex items-center justify-center">
          {initials || "?"}
        </span>
      )}
      <div className="min-w-0">
        <p className="font-sans font-bold text-[11px] uppercase tracking-[1.6px] text-bk-body">Organized by</p>
        <p className="font-sans font-bold text-[22px] leading-tight text-bk-heading break-words">{name}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[13px] text-bk-body">
          {verified && (
            <span className="inline-flex items-center gap-1.5">
              <VerifiedBadge size={15} /> Verified
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <TrophyIcon size={14} className="text-bk-muted" /> {eventsHosted} {eventsHosted === 1 ? "Event" : "Events"}
          </span>
        </p>
      </div>
    </Link>
  );
}
