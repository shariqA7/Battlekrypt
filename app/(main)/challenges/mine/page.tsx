import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMyChallenges } from "@/lib/services/challenges";
import { prizeLabel } from "@/lib/challenge-format";

const STATUS_LABEL: Record<string, string> = {
  pending_review: "Waiting for admin approval",
  open: "Open",
  in_progress: "In progress",
  completed: "Completed",
  expired: "Expired",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export default async function MyChallengesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/challenges/mine");

  const challenges = await listMyChallenges(user.id);

  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
      <Link href="/challenges" className="font-sans text-[12px] text-bk-muted underline">← Challenges</Link>
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mt-3 mb-6">My challenges</h1>
      {challenges.length === 0 ? (
        <p className="font-sans text-[13px] text-bk-muted">You haven&apos;t posted any challenges yet.</p>
      ) : (
        <ul className="border border-bk-border divide-y divide-bk-border">
          {challenges.map((c) => (
            <li key={c.id}>
              <Link href={`/challenges/${c.id}`} className="flex justify-between gap-4 px-4 py-3 hover:bg-bk-surface">
                <div>
                  <p className="font-sans text-[13px] text-bk-heading">{c.title}</p>
                  <p className="font-sans text-[12px] text-bk-muted">{c.game.name} · {STATUS_LABEL[c.status]} · {c._count.applications} applied</p>
                </div>
                <p className="font-sans text-[13px] text-bk-gold-light shrink-0">{prizeLabel(c)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
