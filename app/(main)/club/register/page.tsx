import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClubByUserId, getClubPaymentInstructions } from "@/lib/services/clubs";
import ClubRegisterForm from "./ClubRegisterForm";

export default async function ClubRegisterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/club/register");

  const existing = await getClubByUserId(user.id);
  if (existing) redirect("/club/dashboard");

  const paymentInstructions = await getClubPaymentInstructions();

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <ClubRegisterForm paymentInstructions={paymentInstructions} />
    </main>
  );
}
