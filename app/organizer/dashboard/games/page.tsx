import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getMyGameRequests } from "@/lib/services/tournaments";
import { redirect } from "next/navigation";
import RequestGameForm from "./RequestGameForm";

const STATUS_COLOR: Record<string, string> = {
  pending: "text-[#EF9F27]",
  approved: "text-[#1D9E75]",
  rejected: "text-bk-live",
};

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
    <main className="flex-1 px-6 py-10 max-w-lg mx-auto w-full">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-1">
        Request a game
      </h1>
      <p className="font-sans text-bk-body text-sm mb-6">
        Don&apos;t see your game in the list? Request it here — an admin will
        review it.
      </p>

      <RequestGameForm />

      <p className="font-sans font-medium text-bk-heading text-sm mt-10 mb-3">
        Your requests
      </p>
      {requests.length === 0 ? (
        <p className="text-bk-muted font-sans text-sm">No requests yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {requests.map((r) => (
            <div
              key={r.id}
              className="bg-bk-surface border border-bk-border p-3 flex items-center justify-between"
            >
              <span className="font-sans text-bk-heading text-sm">{r.gameName}</span>
              <span className={`font-sans text-[11px] uppercase tracking-[0.5px] ${STATUS_COLOR[r.status]}`}>
                {r.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
