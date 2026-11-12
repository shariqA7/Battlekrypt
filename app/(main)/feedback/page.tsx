import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import FeedbackForm from "./FeedbackForm";

export const metadata: Metadata = { title: "Send feedback", description: "Suggest a feature or tell us about a problem on BattleKrypt." };

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ type?: string; from?: string }> }) {
  const { type, from } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <main className="flex-1 px-6 py-10 max-w-lg mx-auto w-full">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-1">Send feedback</h1>
      <p className="font-sans text-bk-body text-[13px] mb-6">
        Got an idea for a new feature, or something isn&apos;t working? Tell us. A real person reads every message.
      </p>
      <FeedbackForm signedIn={!!user} initialKind={type === "issue" || type === "feature" ? type : "feature"} from={typeof from === "string" ? from : ""} />
    </main>
  );
}
