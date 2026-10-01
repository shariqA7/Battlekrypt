import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { listPlans } from "@/lib/services/plan-requests";
import OrgApplicationForm from "@/components/organizer/OrgApplicationForm";

export default async function RegisterOrganizationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const [org, application] = await Promise.all([
      prisma.organizerProfile.findUnique({ where: { userId: user.id } }),
      prisma.organizationApplication.findUnique({ where: { userId: user.id } }),
    ]);
    if (org) redirect("/organizer/dashboard");
    if (application) redirect("/organizer/application");
  }

  const plans = await listPlans({ audience: "organizer", activeOnly: true });

  return (
    <main className="flex-1 px-6 py-12 max-w-xl mx-auto w-full">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-2">
        Register as an organization
      </h1>
      <p className="font-sans text-bk-body text-[13px] mb-6">
        Tell us about your organization and who runs it. An admin reviews every
        request; you&apos;ll see the status on this site once it&apos;s submitted.
      </p>
      <OrgApplicationForm mode="create" loggedIn={!!user} plans={plans} />
    </main>
  );
}
