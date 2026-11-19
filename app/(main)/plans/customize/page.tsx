import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { resolvePlan } from "@/lib/plans";
import { getMyCustomRequests } from "@/lib/services/custom-plans";
import { organizerPlanDefaults } from "@/lib/custom-plan-rules";
import { SectionHeading } from "@/components/ui/Panel";
import CustomPlanForm from "./CustomPlanForm";

export const metadata = { title: "Customize your plan" };

export default async function CustomizePlanPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/plans/customize");
  const org = await prisma.organizerProfile.findUnique({ where: { userId: user.id } });
  if (!org) redirect("/plans");

  const [account, plan, waiting] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { displayName: true, email: true, phone: true } }),
    resolvePlan("organizer", org),
    getMyCustomRequests(user.id),
  ]);
  const name = account?.displayName && !account.displayName.includes("@") ? account.displayName : "";
  // The form starts from what a typical paid plan has; "Now" shows what their current plan gives.
  const start = { ...organizerPlanDefaults(), ...(plan.limits as unknown as Record<string, number | boolean | null>) };

  return (
    <main className="flex-1 px-5 sm:px-6 py-10 max-w-3xl mx-auto w-full">
      <Link href="/plans" className="font-sans text-[12px] text-bk-gold-light hover:underline">← Plans</Link>
      <div className="mt-3 mb-2"><SectionHeading>Customize your plan</SectionHeading></div>
      <p className="font-sans text-[13px] text-bk-body pl-[19px] mb-6">
        Tell us what you need in a plan. Set every option the way you want it, then send it to our sales team. We&apos;ll reply with a price. If you like it, you&apos;ll find your custom plan on the Plans page and can buy it there.
      </p>
      {waiting.length > 0 && (
        <p className="font-sans text-[13px] text-bk-gold-light border border-bk-gold-light/40 px-4 py-3 mb-6">
          You have {waiting.length} request{waiting.length === 1 ? "" : "s"} with our team already. We&apos;ll reply on the Plans page and in your notifications.
        </p>
      )}
      <CustomPlanForm
        initial={{ name, email: account?.email ?? user.email ?? "", phone: account?.phone ?? "" }}
        start={start}
        current={plan.limits as unknown as Record<string, number | boolean | null>}
        currentName={plan.name}
      />
    </main>
  );
}
