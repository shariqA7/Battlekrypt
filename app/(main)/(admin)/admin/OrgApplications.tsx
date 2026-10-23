"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/Button";
import { Chip, ExpandAllBar, Expandable, useOpenSet } from "@/components/admin/Expandable";

export interface AdminOrgApplication {
  id: string;
  email: string | null;
  orgName: string;
  orgType: string;
  description: string;
  registrationNumber: string | null;
  website: string | null;
  country: string;
  city: string;
  address: string;
  contactEmail: string;
  contactPhone: string;
  handlerName: string;
  handlerRole: string;
  handlerPhone: string;
  plan: string;
  attemptCount: number;
  submittedAt: string;
}

// Shown in the expanded view, grouped so a long application is easy to read.
const REVIEW_GROUPS: { title: string; fields: [string, string][] }[] = [
  {
    title: "Organization",
    fields: [
      ["orgName", "Organization name"],
      ["orgType", "Type"],
      ["description", "About"],
      ["registrationNumber", "Registration number"],
      ["website", "Website"],
    ],
  },
  {
    title: "Location",
    fields: [
      ["country", "Country"],
      ["city", "City"],
      ["address", "Address"],
    ],
  },
  {
    title: "Organization contact",
    fields: [
      ["contactEmail", "Org email"],
      ["contactPhone", "Org phone"],
    ],
  },
  {
    title: "Handler",
    fields: [
      ["handlerName", "Handler name"],
      ["handlerRole", "Handler role"],
      ["handlerPhone", "Handler phone"],
    ],
  },
];

export default function OrgApplications({ initial }: { initial: AdminOrgApplication[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = useOpenSet();

  async function act(id: string, action: "approve" | "reject") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/org-applications/${id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: action === "reject" ? JSON.stringify({ note, fields }) : undefined,
    });
    if (!res.ok) {
      setError((await res.json()).error.message);
    } else {
      setItems((prev) => prev.filter((i) => i.id !== id));
      setRejecting(null);
      setNote("");
      setFields({});
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <section>
      <p className="font-sans font-medium text-bk-heading text-sm mb-3">
        Organization applications ({items.length})
      </p>
      {error && <p className="font-sans text-[12px] text-bk-live mb-3">{error}</p>}
      {items.length === 0 && <p className="font-sans text-[13px] text-bk-muted">Nothing waiting for review.</p>}

      <ExpandAllBar ids={items.map((i) => i.id)} set={set} />
      <div className="space-y-2">
        {items.map((a) => (
          <Expandable
            key={a.id}
            id={a.id}
            open={set.has(a.id)}
            onToggle={() => set.toggle(a.id)}
            summary={
              <>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-sans font-bold text-bk-heading">{a.orgName}</span>
                  <Chip>{a.orgType}</Chip>
                  <Chip tone="teal">plan {a.plan}</Chip>
                  {a.attemptCount > 1 && <Chip tone="amber">attempt {a.attemptCount}</Chip>}
                </span>
                <span className="block font-sans text-[12px] text-bk-muted truncate mt-0.5">
                  {a.email} · {a.city}, {a.country}
                </span>
              </>
            }
            aside={<span className="font-sans text-[12px] text-bk-muted">{new Date(a.submittedAt).toLocaleDateString()}</span>}
          >
            <p className="font-sans text-[12px] text-bk-muted mb-3">Submitted {new Date(a.submittedAt).toLocaleString()}</p>

            <div className="grid md:grid-cols-2 gap-x-8 gap-y-5">
              {REVIEW_GROUPS.map((g) => (
                <div key={g.title} className={g.title === "Organization" ? "md:col-span-2" : ""}>
                  <p className="font-sans font-bold text-[10px] uppercase tracking-[1.4px] text-bk-gold-light mb-1.5">{g.title}</p>
                  <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 font-sans text-[12px]">
                    {g.fields.map(([key, label]) => {
                      const value = (a as unknown as Record<string, string | null>)[key];
                      return (
                        <div key={key} className="contents">
                          <dt className="text-bk-muted">{label}</dt>
                          <dd className="text-bk-body break-words">
                            {value || "—"}
                            {rejecting === a.id && (
                              <input
                                value={fields[key] ?? ""}
                                onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
                                placeholder="What's wrong with this field? (optional)"
                                className="block w-full mt-1 bg-bk-bg border border-bk-border text-bk-heading text-[12px] px-2 h-[30px]"
                              />
                            )}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              ))}
            </div>

            {rejecting === a.id && (
              <div className="mt-4">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Overall message to the applicant (what to correct)"
                  className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2 mb-2"
                />
                <button disabled={busy} onClick={() => act(a.id, "reject")} className={buttonClass("danger", "sm", "")}>
                  Send rejection
                </button>
              </div>
            )}

            <div className="flex gap-2 mt-4 pt-3 border-t border-bk-border-soft">
              <button disabled={busy} onClick={() => act(a.id, "approve")} className={buttonClass("primary", "sm", "")}>
                Approve
              </button>
              <button
                disabled={busy}
                onClick={() => setRejecting(rejecting === a.id ? null : a.id)}
                className="border border-bk-live text-bk-live font-sans font-bold text-[11px] uppercase tracking-[0.5px] px-3 min-h-[40px] sm:min-h-[32px] inline-flex items-center justify-center"
              >
                {rejecting === a.id ? "Cancel" : "Reject"}
              </button>
            </div>
          </Expandable>
        ))}
      </div>
    </section>
  );
}
