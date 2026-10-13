import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { listMembers } from "@/lib/services/org-members";
import MembersManager from "./MembersManager";
import { SectionHeading } from "@/components/ui/Panel";

export default async function OrganizerMembersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/organizer/dashboard/members");

  const organizerProfile = await prisma.organizerProfile.findUnique({
    where: { userId: user.id },
  });
  if (!organizerProfile) redirect("/organizer/register");

  const members = await listMembers(organizerProfile.id);

  return (
    <main className="flex-1 px-5 sm:px-6 py-10 max-w-2xl mx-auto w-full">
      <Link href="/organizer/dashboard" className="font-sans text-[12px] text-bk-gold-light hover:underline">
        ← Dashboard
      </Link>
      <SectionHeading className="mt-3 mb-2">Members</SectionHeading>
      <p className="font-sans text-bk-body text-[13px] mb-6 pl-[19px]">
        People who help run {organizerProfile.orgName}.
      </p>
      <MembersManager
        initialMembers={members.map((m) => ({
          id: m.id,
          email: m.email,
          name: m.name,
          role: m.role,
          hasAccount: !!m.userId,
        }))}
      />
    </main>
  );
}
