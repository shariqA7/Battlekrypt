"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

const REVIEW_FIELDS: [string, string][] = [
  ["orgName", "Organization name"],
  ["orgType", "Type"],
  ["description", "About"],
  ["registrationNumber", "Registration number"],
  ["website", "Website"],
  ["country", "Country"],
  ["city", "City"],
  ["address", "Address"],
  ["contactEmail", "Org email"],
  ["contactPhone", "Org phone"],
  ["handlerName", "Handler name"],
  ["handlerRole", "Handler role"],
  ["handlerPhone", "Handler phone"],
];

export default function OrgApplications({ initial }: { initial: AdminOrgApplication[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

      <div className="space-y-4">
        {items.map((a) => (
          <div key={a.id} className="bg-bk-surface border border-bk-border p-4">
            <div className="flex justify-between items-start gap-3">
              <div>
                <p className="font-sans font-bold text-bk-heading">{a.orgName}</p>
                <p className="font-sans text-[12px] text-bk-muted">
                  {a.email} · plan {a.plan} · attempt {a.attemptCount} · {new Date(a.submittedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  disabled={busy}
                  onClick={() => act(a.id, "approve")}
                  className="bg-white text-bk-bg font-sans font-bold text-[11px] uppercase tracking-[0.5px] px-3 py-1.5 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  disabled={busy}
                  onClick={() => setRejecting(rejecting === a.id ? null : a.id)}
                  className="border border-bk-live text-bk-live font-sans font-bold text-[11px] uppercase tracking-[0.5px] px-3 py-1.5"
                >
                  Reject
                </button>
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-[150px_1fr] gap-x-3 gap-y-1 font-sans text-[12px]">
              {REVIEW_FIELDS.map(([key, label]) => {
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

            {rejecting === a.id && (
              <div className="mt-4">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Overall message to the applicant (what to correct)"
                  className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2 mb-2"
                />
                <button
                  disabled={busy}
                  onClick={() => act(a.id, "reject")}
                  className="bg-bk-live text-white font-sans font-bold text-[11px] uppercase tracking-[0.5px] px-3 py-1.5 disabled:opacity-50"
                >
                  Send rejection
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
