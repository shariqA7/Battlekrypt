import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getMyRegistrations } from "@/lib/services/tournaments";
import Link from "next/link";
import { redirect } from "next/navigation";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending approval", color: "text-bk-text-muted" },
  approved: { label: "Approved", color: "text-bk-gold-light" },
  rejected: { label: "Rejected", color: "text-bk-live" },
  disqualified: { label: "Disqualified", color: "text-bk-live" },
};

export default async function PlayerDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/dashboard");

  const playerProfile = await prisma.playerProfile.findUnique({
    where: { userId: user.id },
    include: { user: { select: { displayName: true, avatarUrl: true } } },
  });

  const registrations = playerProfile
    ? await getMyRegistrations(playerProfile.id)
    : [];

  const initials =
    `${playerProfile?.firstName?.[0] ?? ""}${playerProfile?.lastName?.[0] ?? ""}`.toUpperCase() ||
    (playerProfile?.user.displayName?.[0]?.toUpperCase() ?? "?");

  return (
    <>
      <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full overflow-hidden bg-bk-surface border border-bk-border flex items-center justify-center flex-shrink-0">
              {playerProfile?.user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={playerProfile.user.avatarUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="font-sans font-bold text-sm text-bk-heading">{initials}</span>
              )}
            </div>
            <h1 className="font-sans font-extrabold text-2xl text-bk-heading">
              My matches
            </h1>
          </div>
          <Link
            href="/dashboard/profile"
            className="text-bk-gold-light font-sans text-[11px] uppercase tracking-[0.5px] underline"
          >
            Profile settings
          </Link>
        </div>
        <p className="font-sans text-bk-body text-sm mb-8">
          Everything you&apos;ve registered for, in one place.
        </p>

        {registrations.length === 0 ? (
          <p className="text-bk-muted font-sans text-sm">
            You haven&apos;t joined any tournaments yet.{" "}
            <Link href="/tournaments" className="text-bk-gold-light">
              Browse tournaments →
            </Link>
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {registrations.map((r) => {
              const status = STATUS_LABEL[r.status];
              return (
                <Link
                  key={r.id}
                  href={`/tournaments/${r.tournament.slug}`}
                  className="bg-bk-surface border border-bk-border p-4 flex items-center justify-between hover:border-bk-gold-light transition-colors"
                >
                  <div>
                    <p className="font-sans font-medium text-bk-heading text-sm">
                      {r.tournament.name}
                    </p>
                    <p className="font-sans text-bk-muted text-xs mt-1">
                      {r.tournament.game.name}
                    </p>
                  </div>
                  <span className={`font-sans text-xs ${status.color}`}>
                    {status.label}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
