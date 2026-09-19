import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getMyTournaments } from "@/lib/services/tournaments";
import Link from "next/link";
import { redirect } from "next/navigation";

const STATUS_DOT: Record<string, string> = {
  draft: "bg-bk-muted",
  published: "bg-bk-gold-light",
  registration_open: "bg-[#1D9E75]",
  registration_closed: "bg-[#EF9F27]",
  in_progress: "bg-[#1D9E75]",
  completed: "bg-bk-muted",
  cancelled: "bg-bk-live",
};

export default async function OrganizerDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/organizer/dashboard");

  const organizerProfile = await prisma.organizerProfile.findUnique({
    where: { userId: user.id },
  });

  if (!organizerProfile) redirect("/organizer/onboard");

  const userRecord = await prisma.user.findUnique({ where: { id: user.id } });
  const isApproved = userRecord?.kycStatus === "approved";

  const tournaments = await getMyTournaments(organizerProfile.id);

  return (
    <>
      <main className="flex-1 px-6 py-10 max-w-3xl mx-auto w-full">
        <div className="flex justify-between items-center mb-2">
          <h1 className="font-sans font-extrabold text-2xl text-bk-heading">
            {organizerProfile.orgName}
          </h1>
          <Link
            href="/organizer/dashboard/tournaments/new"
            className="bg-white text-bk-bg font-sans font-bold text-[12px] tracking-[0.6px] uppercase px-4 py-2.5"
          >
            + New tournament
          </Link>
        </div>

        {!isApproved && (
          <p className="bg-[rgba(239,159,39,0.12)] text-[#EF9F27] font-sans text-[12px] px-3 py-2 mb-6 inline-block">
            Your organizer account is pending admin approval. You can build
            drafts now, but publishing is locked until you&apos;re approved.
          </p>
        )}

        <p className="font-sans text-bk-body text-sm mb-6">
          {tournaments.length} tournament{tournaments.length !== 1 ? "s" : ""}
        </p>

        {tournaments.length === 0 ? (
          <p className="text-bk-muted font-sans text-sm">
            No tournaments yet — create your first one above.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {tournaments.map((t) => (
              <Link
                key={t.id}
                href={`/organizer/dashboard/tournaments/${t.id}`}
                className="bg-bk-surface border border-bk-border p-4 flex items-center gap-3 hover:border-bk-gold-light transition-colors"
              >
                <span className={`w-2 h-2 rounded-full ${STATUS_DOT[t.status]}`} />
                <div className="flex-1">
                  <p className="font-sans font-medium text-bk-heading text-sm">
                    {t.name}
                  </p>
                  <p className="font-sans text-bk-muted text-xs mt-1">
                    {t.game.name} · {t.status.replace("_", " ")} ·{" "}
                    {t._count.registrations}/{t.maxTeams} registered
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
