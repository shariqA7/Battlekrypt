import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMyClaims } from "@/lib/services/club-name-claims";
import ClaimForm from "./ClaimForm";

const STATUS_LABEL = {
  pending: "Under review",
  upheld: "Approved — the name is yours",
  dismissed: "Dismissed",
} as const;

export default async function ClaimNamePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/club/claim-name");

  const claims = await listMyClaims(user.id);

  return (
    <main className="flex-1 px-6 py-12 max-w-xl mx-auto w-full">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-2">
        Report a club using your name
      </h1>
      <p className="font-sans text-bk-body text-[13px] mb-6">
        If a club took a name that belongs to you or your organization, tell us
        who you are and how we can verify it. If an admin agrees, that club is
        disbanded, its owner is banned, and the name is held for you.
      </p>
      <ClaimForm />

      {claims.length > 0 && (
        <div className="mt-10">
          <p className="font-sans font-medium text-bk-heading text-sm mb-3">Your claims</p>
          <ul className="border border-bk-border divide-y divide-bk-border">
            {claims.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <p className="font-sans text-[13px] text-bk-heading">{c.clubName}</p>
                <p className="font-sans text-[12px] text-bk-muted">
                  {STATUS_LABEL[c.status]} · {c.createdAt.toLocaleDateString()}
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
