import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import SettingsForm from "./SettingsForm";
import { SectionHeading } from "@/components/ui/Panel";

export default async function OrganizerSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/organizer/dashboard/settings");

  const organizerProfile = await prisma.organizerProfile.findUnique({
    where: { userId: user.id },
  });
  if (!organizerProfile) redirect("/organizer/onboard");

  return (
    <main className="flex-1 px-5 sm:px-6 py-10 max-w-lg mx-auto w-full">
      <SectionHeading className="mb-3">Profile settings</SectionHeading>
      <p className="font-sans text-bk-body text-[13px] mb-6 pl-[19px]">
        Shown on your public organizer page — social links let players find
        your streams from the Live Matches tab.
      </p>
      <SettingsForm
        orgName={organizerProfile.orgName}
        bio={organizerProfile.bio ?? ""}
        socialLinks={(organizerProfile.socialLinks as Record<string, string>) ?? {}}
      />
    </main>
  );
}
