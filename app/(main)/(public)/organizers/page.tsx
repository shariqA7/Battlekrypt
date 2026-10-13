import Link from "next/link";
import { listOrganizers } from "@/lib/services/tournaments";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import InitialTile from "@/components/ui/InitialTile";
import { SectionHeading } from "@/components/ui/Panel";

export default async function OrganizersPage() {
  const organizers = await listOrganizers();

  return (
    <main className="flex-1 px-5 sm:px-6 py-10 max-w-6xl mx-auto w-full">
      <SectionHeading className="mb-6">Organizers</SectionHeading>

      {organizers.length === 0 ? (
        <p className="text-bk-muted font-sans text-sm">No organizers yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {organizers.map((o) => (
            <Link
              key={o.id}
              href={`/organizers/${o.id}`}
              className="group flex items-center gap-3 bg-bk-surface border border-bk-border p-4 transition-colors hover:border-bk-gold-from hover:bg-bk-surface-hover"
            >
              <InitialTile name={o.orgName} />
              <div className="min-w-0">
                <p className="font-sans font-bold text-bk-heading text-sm flex items-center gap-1.5 group-hover:text-bk-gold-light">
                  <span className="break-words min-w-0">{o.orgName}</span>
                  {o.verified && <VerifiedBadge size={14} />}
                </p>
                <p className="font-mono text-bk-muted text-xs mt-0.5">
                  {o._count.tournaments} event{o._count.tournaments !== 1 ? "s" : ""}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
