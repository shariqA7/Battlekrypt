import Link from "next/link";
import { listOrganizers } from "@/lib/services/tournaments";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";

export default async function OrganizersPage() {
  const organizers = await listOrganizers();

  return (
    <main className="flex-1 px-6 py-10 max-w-3xl mx-auto w-full">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-6">
        Organizers
      </h1>

      {organizers.length === 0 ? (
        <p className="text-bk-muted font-sans text-sm">No organizers yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {organizers.map((o) => (
            <Link
              key={o.id}
              href={`/organizers/${o.id}`}
              className="bg-bk-surface border border-bk-border p-4 flex items-center justify-between hover:border-bk-gold-light transition-colors"
            >
              <span className="font-sans font-medium text-bk-heading text-sm flex items-center gap-1.5">
                {o.orgName}
                {o.user.kycStatus === "approved" && <VerifiedBadge size={13} />}
              </span>
              <span className="font-sans text-bk-muted text-xs">
                {o._count.tournaments} tournament{o._count.tournaments !== 1 ? "s" : ""}
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
