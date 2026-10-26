import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getTrustConfig } from "@/lib/services/organizer-trust";
import { getIdentityForOrganizer } from "@/lib/services/identity";
import { Panel, SectionHeading } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import IdentityForm from "./IdentityForm";

export const metadata = { title: "Verify your identity" };

export default async function OrganizerVerificationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/organizer/dashboard/verification");

  const organizer = await prisma.organizerProfile.findUnique({ where: { userId: user.id } });
  if (!organizer) redirect("/organizer/register");

  const [record, identity, cfg] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { kycStatus: true } }),
    getIdentityForOrganizer(organizer.id),
    getTrustConfig(),
  ]);
  const approved = record?.kycStatus === "approved";
  const state = identity?.state ?? "none";
  const canSubmit = approved && (state === "none" || state === "rejected" || state === "expired");
  const fmt = (d: Date | null) => (d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

  return (
    <main className="flex-1 px-5 sm:px-6 py-10 max-w-2xl mx-auto w-full">
      <Link href="/organizer/dashboard" className="font-sans text-[12px] text-bk-muted hover:text-bk-gold-light">
        ← Dashboard
      </Link>
      <SectionHeading className="mt-3 mb-2">Verify your identity</SectionHeading>
      <p className="font-sans text-[13px] text-bk-body mb-6 pl-[19px]">
        A quick check that a real adult runs this organization. It earns your Verified badge (with a paid plan) and lifts the new-organizer
        limits on paid and prized events.
      </p>

      {!approved && (
        <p className="bg-bk-amber/[0.12] text-bk-amber font-sans text-[12px] px-3 py-2 mb-6">
          Your organization application has to be approved first. You can verify your identity as soon as it is.
        </p>
      )}

      {state === "pending" && (
        <Panel className="p-4 mb-6">
          <div className="flex items-center gap-3">
            <Badge tone="amber">In review</Badge>
            <p className="font-sans text-[13px] text-bk-body">
              Submitted {fmt(identity!.submittedAt)}. An admin will look at it soon and you&apos;ll get a notification.
            </p>
          </div>
        </Panel>
      )}

      {state === "approved" && (
        <Panel className="p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="teal">Verified</Badge>
            <p className="font-sans text-[13px] text-bk-body">
              Your identity is verified until {fmt(identity!.validUntil)}. We&apos;ll ask you to verify again after that.
            </p>
          </div>
        </Panel>
      )}

      {state === "expired" && (
        <Panel className="p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="amber">Expired</Badge>
            <p className="font-sans text-[13px] text-bk-body">Your verification ran out on {fmt(identity!.validUntil)}. Submit your documents again to renew it.</p>
          </div>
        </Panel>
      )}

      {state === "rejected" && (
        <Panel className="p-4 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Badge tone="danger">Not approved</Badge>
            <p className="font-sans text-[13px] text-bk-body">Please fix this and submit again.</p>
          </div>
          <p className="font-sans text-[13px] text-bk-heading">{identity!.rejectionNote}</p>
        </Panel>
      )}

      {canSubmit && <IdentityForm userId={user.id} />}

      <Panel className="p-4 mt-8">
        <p className="font-sans font-bold text-[13px] text-bk-heading mb-2">How we handle your documents</p>
        <ul className="font-sans text-[12px] text-bk-body space-y-1.5 list-disc pl-4">
          <li>The photos are stored privately. Only platform admins can open them, and every time one is opened it is logged.</li>
          <li>
            Once you have run enough events whose winners confirmed they were paid, your photos are deleted. If that hasn&apos;t happened, they are deleted
            after at most {cfg.idRetentionDays} days, and never while a payout problem, a ban or a dispute is open. If a check is rejected, the photos
            and details are deleted after {cfg.idRejectedRetentionDays} days.
          </li>
          <li>
            After an approval we keep your verified name, address and document number (the number and address are encrypted) for as long as your account
            exists, plus a set period after it closes. We keep them so that, if someone is cheated, we can report it to the authorities and stop the same
            person opening another organizer account.
          </li>
          <li>We never use your documents for anything else, and we never show them to players or other organizers.</li>
        </ul>
      </Panel>
    </main>
  );
}
