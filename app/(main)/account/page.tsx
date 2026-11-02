import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDeletionOverview } from "@/lib/services/account-deletion";
import AccountDeletion from "./AccountDeletion";

export const metadata = { title: "Account & privacy" };

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/account");
  const overview = await getDeletionOverview(user.id);
  if (!overview || overview.state.state === "erased") redirect("/");

  return (
    <main className="flex-1 px-6 py-10 max-w-xl mx-auto w-full space-y-8">
      <div>
        <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-1">Account &amp; privacy</h1>
        <p className="font-sans text-[13px] text-bk-muted">Signed in as {user.email}</p>
      </div>
      <section className="space-y-3">
        <h2 className="font-sans font-bold text-[16px] text-bk-heading">Delete my account</h2>
        {overview.state.state === "scheduled" ? (
          <AccountDeletion state="scheduled" dueAtIso={overview.state.dueAt.toISOString()} daysLeft={overview.state.daysLeft} />
        ) : (
          <AccountDeletion state="none" blockers={overview.blockers} />
        )}
      </section>
    </main>
  );
}
