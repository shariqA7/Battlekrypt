import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getPosterRoles } from "@/lib/services/challenges";
import ChallengeForm from "./ChallengeForm";

export default async function NewChallengePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/challenges/new");

  const [roles, games] = await Promise.all([
    getPosterRoles(user.id),
    prisma.game.findMany({ where: { isApproved: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <main className="flex-1 px-6 py-10 max-w-xl mx-auto w-full">
      <Link href="/challenges" className="font-sans text-[12px] text-bk-muted underline">← Challenges</Link>
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mt-3 mb-1">Post a challenge</h1>
      <p className="font-sans text-bk-body text-[13px] mb-6">
        You pay the prize yourself, directly to the winner. The platform never holds the money.
      </p>
      {roles.length === 0 ? (
        <p className="font-sans text-[13px] text-bk-muted">
          Finish player onboarding, create a club, or register an organization to post challenges.
        </p>
      ) : (
        <ChallengeForm roles={roles} games={games} />
      )}
    </main>
  );
}
