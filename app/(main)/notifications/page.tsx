import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NotificationsView from "./NotificationsView";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/notifications");

  return (
    <main className="flex-1 px-4 sm:px-6 py-8 sm:py-10 max-w-2xl mx-auto w-full">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-6">Notifications</h1>
      <NotificationsView />
    </main>
  );
}
