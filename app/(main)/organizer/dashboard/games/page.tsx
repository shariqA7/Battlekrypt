import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getMyGameRequests } from "@/lib/services/tournaments";
import { redirect } from "next/navigation";
import RequestGameForm from "./RequestGameForm";
import { Badge } from "@/components/ui/Badge";
import { SectionHeading } from "@/components/ui/Panel";

const STATUS_TONE = { pending: "amber", approved: "teal", rejected: "danger" } as const;

export default async function OrganizerGamesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/organizer/dashboard/games");

  const organizerProfile = await prisma.organizerProfile.findUnique({
    where: { userId: user.id },
  });
  if (!organizerProfile) redirect("/organizer/onboard");

  const requests = await getMyGameRequests(organizerProfile.id);

  return (
    <main className="flex-1 px-5 sm:px-6 py-10 max-w-lg mx-auto w-full">
      <SectionHeading className="mb-3">Request a game</SectionHeading>
      <p className="font-sans text-bk-body text-sm mb-6 pl-[19px]">
        Don&apos;t see your game in the list? Request it here — an admin will
        review it.
      </p>

      <RequestGameForm />

      <p className="font-sans font-bold text-[11px] uppercase tracking-[1.6px] text-bk-muted mt-10 mb-3">
        Your requests
      </p>
      {requests.length === 0 ? (
        <p className="text-bk-muted font-sans text-sm">No requests yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {requests.map((r) => (
            <div
              key={r.id}
              className="bg-bk-surface border border-bk-border p-3 flex flex-wrap items-center justify-between gap-2"
            >
              <span className="font-sans text-bk-heading text-sm">{r.gameName}</span>
              <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "neutral"}>{r.status}</Badge>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
