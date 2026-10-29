"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import BanUserButton from "../BanUserButton";
import { REPORT_KIND_LABEL, type ReportKindT } from "@/lib/report-kinds";

interface Report {
  id: string;
  kind: string;
  description: string;
  status: string;
  adminNote: string | null;
  createdAt: string;
  reporter: string;
  tournament: string;
}
interface Org {
  id: string;
  userId: string;
  orgName: string;
  email: string;
  pausedAt: string | null;
  pauseReason: string | null;
  reports: Report[];
}

export default function ReportsManager({ orgs }: { orgs: Org[] }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function post(url: string, body: object) {
    setError(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
    router.refresh();
  }

  if (orgs.length === 0) return <p className="font-sans text-[13px] text-bk-muted">No open reports and no paused organizers.</p>;

  const area = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[12px] font-sans px-2 py-1.5";

  return (
    <div className="space-y-4">
      {error && <p className="text-bk-live text-[12px] font-sans">{error}</p>}
      {orgs.map((o) => {
        const open = o.reports.filter((r) => r.status === "open");
        const orgNote = notes[`org-${o.id}`] ?? "";
        return (
          <Panel key={o.id} className="p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <p className="font-sans text-[14px] text-bk-heading font-bold">
                  {o.orgName} <span className="font-normal text-bk-muted text-[12px]">· {o.email}</span>
                </p>
                <p className="font-sans text-[12px] text-bk-muted">
                  {open.length} open report{open.length === 1 ? "" : "s"} · {o.reports.filter((r) => r.status === "upheld").length} upheld
                </p>
              </div>
              <span
                className={`font-sans text-[11px] uppercase tracking-[0.8px] ${o.pausedAt ? "text-bk-live" : "text-bk-muted"}`}
              >
                {o.pausedAt ? "Paused" : "Not paused"}
              </span>
            </div>
            {o.pausedAt && o.pauseReason && <p className="font-sans text-[12px] text-bk-body mt-1">{o.pauseReason}</p>}

            <div className="mt-3 space-y-2">
              {o.reports.map((r) => (
                <div key={r.id} className="border border-bk-border px-3 py-2">
                  <p className="font-sans text-[11px] uppercase tracking-[0.8px] text-bk-muted">
                    {r.reporter} · {r.tournament} · {new Date(r.createdAt).toLocaleDateString("en-GB")} ·{" "}
                    <span className={r.status === "open" ? "text-bk-amber" : r.status === "upheld" ? "text-bk-teal" : ""}>{r.status}</span>
                  </p>
                  <p className="font-sans text-[12px] text-bk-heading font-bold mt-1">{REPORT_KIND_LABEL[r.kind as ReportKindT]}</p>
                  <p className="font-sans text-[12px] text-bk-body whitespace-pre-wrap">{r.description}</p>
                  {r.adminNote && <p className="font-sans text-[11px] text-bk-muted mt-1">Decision: {r.adminNote}</p>}
                  {r.status === "open" && (
                    <div className="mt-2">
                      <textarea
                        rows={2}
                        value={notes[r.id] ?? ""}
                        onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                        placeholder="Decision note (the reporter sees this)"
                        className={area}
                      />
                      <div className="flex gap-3 mt-1.5">
                        <button
                          disabled={!(notes[r.id] ?? "").trim()}
                          onClick={() => post(`/api/admin/reports/${r.id}/decide`, { outcome: "upheld", note: notes[r.id] })}
                          className="bg-white text-bk-bg font-sans font-bold text-[11px] tracking-[0.8px] uppercase px-3 py-1.5 disabled:opacity-50"
                        >
                          Uphold
                        </button>
                        <button
                          disabled={!(notes[r.id] ?? "").trim()}
                          onClick={() => post(`/api/admin/reports/${r.id}/decide`, { outcome: "dismissed", note: notes[r.id] })}
                          className="border border-bk-border text-bk-body font-sans font-bold text-[11px] tracking-[0.8px] uppercase px-3 py-1.5 disabled:opacity-50"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-3 border-t border-bk-border pt-3">
              <textarea
                rows={2}
                value={orgNote}
                onChange={(e) => setNotes({ ...notes, [`org-${o.id}`]: e.target.value })}
                placeholder={o.pausedAt ? "Why are you resuming this organizer? (they see this)" : "Why are you pausing this organizer? (they see this)"}
                className={area}
              />
              <div className="flex flex-wrap items-center gap-3 mt-1.5">
                <button
                  disabled={!orgNote.trim()}
                  onClick={() => post(`/api/admin/organizers/${o.id}/pause`, { paused: !o.pausedAt, note: orgNote })}
                  className="bg-white text-bk-bg font-sans font-bold text-[11px] tracking-[0.8px] uppercase px-3 py-1.5 disabled:opacity-50"
                >
                  {o.pausedAt ? "Resume organizer" : "Pause organizer"}
                </button>
                <BanUserButton userId={o.userId} name={o.orgName} />
              </div>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
