import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { listMembers } from "@/lib/services/org-members";
import MembersManager from "./MembersManager";

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
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
      <Link href="/organizer/dashboard" className="font-sans text-[12px] text-bk-muted underline">
        ← Dashboard
      </Link>
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mt-3 mb-1">
        Members
      </h1>
      <p className="font-sans text-bk-body text-[13px] mb-6">
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
