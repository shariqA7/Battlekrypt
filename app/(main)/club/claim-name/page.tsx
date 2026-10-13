import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMyClaims } from "@/lib/services/club-name-claims";
import ClaimForm from "./ClaimForm";
import { Badge } from "@/components/ui/Badge";
import LocalDate from "@/components/ui/LocalDate";
import { SectionHeading } from "@/components/ui/Panel";

const STATUS = {
  pending: { label: "Under review", tone: "amber" },
  upheld: { label: "Approved — the name is yours", tone: "teal" },
  dismissed: { label: "Dismissed", tone: "neutral" },
} as const;

export default async function ClaimNamePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/club/claim-name");

  const claims = await listMyClaims(user.id);

  return (
    <main className="flex-1 px-5 sm:px-6 py-12 max-w-xl mx-auto w-full">
      <SectionHeading className="mb-3">Report a club using your name</SectionHeading>
      <p className="font-sans text-bk-body text-[13px] mb-6 pl-[19px]">
        If a club took a name that belongs to you or your organization, tell us
        who you are and how we can verify it. If an admin agrees, that club is
        disbanded, its owner is banned, and the name is held for you.
      </p>
      <ClaimForm />

      {claims.length > 0 && (
        <div className="mt-10">
          <p className="font-sans font-bold text-[11px] uppercase tracking-[1.6px] text-bk-muted mb-3">Your claims</p>
          <ul className="bg-bk-surface border border-bk-border divide-y divide-bk-border">
            {claims.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-sans font-bold text-[14px] text-bk-heading break-words">{c.clubName}</p>
                  <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
                </div>
                <p className="font-mono text-[12px] text-bk-muted mt-1">
                  <LocalDate iso={c.createdAt.toISOString()} />
                </p>
                {c.adminNote && (
                  <p className="font-sans text-[12px] text-bk-body mt-1">Admin: {c.adminNote}</p>
                )}
                {c.status === "upheld" && !c.fulfilledAt && (
                  <p className="font-sans text-[12px] text-bk-gold-light mt-1">
                    Register this name as a club or organization — it&apos;s reserved for you.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
