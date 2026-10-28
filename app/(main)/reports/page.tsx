import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMyReports } from "@/lib/services/organizer-reports";
import { REPORT_KIND_LABEL, type ReportKindT } from "@/lib/report-kinds";

const STATUS: Record<string, { label: string; color: string }> = {
  open: { label: "With an admin", color: "text-bk-amber" },
  upheld: { label: "Upheld", color: "text-bk-teal" },
  dismissed: { label: "Reviewed", color: "text-bk-muted" },
};

export default async function MyReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/reports");
  const reports = await listMyReports(user.id);

  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-1">My reports</h1>
      <p className="font-sans text-bk-body text-[13px] mb-6">Problems you reported about organizers. An admin reviews each one.</p>
      {reports.length === 0 ? (
        <p className="font-sans text-[13px] text-bk-muted">You haven&apos;t sent any reports.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {reports.map((r) => (
            <div key={r.id} className="bg-bk-surface border border-bk-border p-3">
              <div className="flex justify-between gap-3">
                <p className="font-sans text-[13px] text-bk-heading font-bold">
                  {r.tournament.name} <span className="font-normal text-bk-muted">· {r.organizer.orgName}</span>
                </p>
                <span className={`font-sans text-[11px] uppercase tracking-[0.8px] shrink-0 ${STATUS[r.status].color}`}>{STATUS[r.status].label}</span>
              </div>
              <p className="font-sans text-[12px] text-bk-muted mt-0.5">{REPORT_KIND_LABEL[r.kind as ReportKindT]}</p>
              {r.adminNote && <p className="font-sans text-[12px] text-bk-body mt-2">Admin: {r.adminNote}</p>}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
