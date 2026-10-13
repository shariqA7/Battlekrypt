"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { InstitutionProofLink } from "../../../tournaments/[id]/RegistrationQueue";

interface Row {
  id: string;
  status: string;
  name: string;
  institutionProofPath: string | null;
  awaitingHostPayment: boolean;
}

export default function CoHostQueue({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, action: "approve" | "reject") {
    setError(null);
    const res = await fetch(`/api/registrations/${id}/${action}`, { method: "POST" });
    if (!res.ok) {
      setError((await res.json()).error?.message ?? "Something went wrong.");
      return;
    }
    const updated = await res.json();
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status: updated.status, awaitingHostPayment: !!updated.awaitingHostPayment }
          : r
      )
    );
  }

  return (
    <div>
      {error && <p className="text-bk-live text-[12px] mb-3">{error}</p>}
      {rows.length === 0 && (
        <p className="font-sans text-[12px] text-bk-muted">No players from your institute yet.</p>
      )}
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="bg-bk-surface border border-bk-border p-4 font-sans text-[13px]">
            <p className="text-bk-heading font-bold break-words">{r.name}</p>
            <p className="text-bk-muted text-[12px] mt-1 flex flex-wrap items-center gap-2">
              <Badge tone={r.status === "approved" ? "teal" : r.status === "rejected" ? "danger" : "amber"}>{r.status}</Badge>
              {r.awaitingHostPayment && <span>Approved by you, waiting for the host&apos;s payment check</span>}
            </p>
            {r.institutionProofPath && (
              <div className="mt-1">
                <InstitutionProofLink path={r.institutionProofPath} />
              </div>
            )}
            {r.status === "pending" && !r.awaitingHostPayment && (
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={() => act(r.id, "approve")}>
                  Approve
                </Button>
                <Button size="sm" variant="danger" onClick={() => act(r.id, "reject")}>
                  Reject
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
