import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClubByUserId } from "@/lib/services/clubs";
import ClubRegisterForm from "./ClubRegisterForm";

export default async function ClubRegisterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/club/register");

  const existing = await getClubByUserId(user.id);
  if (existing && existing.status !== "disbanded") redirect("/club/dashboard");

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <ClubRegisterForm />
    </main>
  );
}
