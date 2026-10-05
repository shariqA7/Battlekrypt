import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMyApplications } from "@/lib/services/challenge-applications";
import { prizeLabel } from "@/lib/challenge-format";

const STATUS_LABEL: Record<string, string> = {
  applied: "Waiting for the poster",
  selected: "Chosen — complete it!",
  not_selected: "Not selected",
  withdrawn: "Withdrawn",
};

export default async function MyApplicationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/challenges/applied");

  const apps = await listMyApplications(user.id);

  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
      <Link href="/challenges" className="font-sans text-[12px] text-bk-muted underline">← Challenges</Link>
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mt-3 mb-6">My applications</h1>
      {apps.length === 0 ? (
        <p className="font-sans text-[13px] text-bk-muted">You haven&apos;t applied to any challenges yet.</p>
      ) : (
        <ul className="border border-bk-border divide-y divide-bk-border">
          {apps.map((a) => (
            <li key={a.id}>
              <Link href={`/challenges/${a.challengeId}`} className="flex justify-between gap-4 px-4 py-3 hover:bg-bk-surface">
                <div>
                  <p className="font-sans text-[13px] text-bk-heading">{a.challenge.title}</p>
                  <p className="font-sans text-[12px] text-bk-muted">
                    {a.challenge.game.name} · as {a.entrantName} · {STATUS_LABEL[a.status]}
                  </p>
                </div>
                <p className="font-sans text-[13px] text-bk-gold-light shrink-0">{prizeLabel(a.challenge)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
