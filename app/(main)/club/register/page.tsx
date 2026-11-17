import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClubByUserId } from "@/lib/services/clubs";
import ClubRegisterForm from "./ClubRegisterForm";
import { safeRedirect } from "@/lib/safe-redirect";

export default async function ClubRegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeRedirect((await searchParams).next, "");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(next ? `/club/register?next=${encodeURIComponent(next)}` : "/club/register")}`);

  const existing = await getClubByUserId(user.id);
  if (existing && existing.status !== "disbanded") redirect(next ? `/club/dashboard?next=${encodeURIComponent(next)}` : "/club/dashboard");

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <ClubRegisterForm next={next} />
    </main>
  );
}
