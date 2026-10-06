import { requireAdminPage } from "@/lib/admin-page";
import { createClient } from "@/lib/supabase/server";
import { INSTITUTION_BUCKET } from "@/lib/institution-constants";
import { institutionCounts, listPendingInstitutions } from "@/lib/services/institutions";
import { Stat } from "@/components/admin/charts";
import ReviewButtons from "./ReviewButtons";

export default async function AdminInstitutionsPage() {
  await requireAdminPage();
  const [counts, pending, supabase] = await Promise.all([
    institutionCounts(),
    listPendingInstitutions(),
    createClient(),
  ]);

  // ID photos are private: each gets a signed link that expires in 5 minutes.
  // Reading them uses the admin's own session, so the storage policy in
  // SETUP.md (admins only) is what actually protects them.
  const items = await Promise.all(
    pending.map(async (p) => {
      const { data } = await supabase.storage
        .from(INSTITUTION_BUCKET)
        .createSignedUrl(p.idImagePath, 300);
      return { ...p, imageUrl: data?.signedUrl ?? null };
    })
  );

  return (
    <div className="space-y-5">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading">Institution verification</h1>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Pending" value={counts.pending} />
        <Stat label="Approved" value={counts.approved} />
        <Stat label="Rejected" value={counts.rejected} />
      </div>

      {items.length === 0 && (
        <p className="font-sans text-[13px] text-bk-muted">Nothing waiting for review.</p>
      )}

      <div className="space-y-4">
        {items.map((p) => (
          <div key={p.id} className="border border-bk-border p-4 grid sm:grid-cols-[220px_1fr] gap-4">
            {p.imageUrl ? (
              <a href={p.imageUrl} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.imageUrl} alt="Student ID" className="w-full max-h-56 object-contain bg-bk-surface" />
              </a>
            ) : (
              <p className="font-sans text-[12px] text-bk-live">Couldn&apos;t load the ID image.</p>
            )}
            <div className="min-w-0 font-sans text-[13px]">
              <p className="text-bk-heading font-bold break-words">{p.institutionName}</p>
              <p className="text-bk-muted break-words">
                {[p.player.firstName, p.player.lastName].filter(Boolean).join(" ") || "Unnamed"} · {p.player.user.email}
              </p>
              {p.studentId && <p className="text-bk-muted">Student ID: {p.studentId}</p>}
              <p className="text-bk-muted text-[11px] mt-1">Submitted {p.createdAt.toLocaleString()}</p>
              <ReviewButtons id={p.id} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
