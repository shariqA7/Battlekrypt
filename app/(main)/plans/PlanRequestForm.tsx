"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";

export default function PlanRequestForm({
  audience,
  planCode,
  planName,
  paymentInstructions,
}: {
  audience: "organizer" | "club" | "player";
  planCode: string;
  planName: string;
  paymentInstructions: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [proofUrl, setProofUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!proofUrl) {
      setError("Please upload your payment screenshot first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/plans/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audience, planCode, proofUrl }),
    });
    if (!res.ok) {
      const { error } = await res.json();
      setError(error.message);
      setSubmitting(false);
      return;
    }
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-white text-bk-bg font-sans font-bold text-[11px] tracking-[0.8px] uppercase px-4 py-2"
      >
        Get {planName}
      </button>
    );
  }

  return (
    <div className="mt-3 border-t border-bk-border pt-3">
      {paymentInstructions ? (
        <div className="bg-bk-bg border border-bk-gold-light/40 px-3 py-2.5 mb-3">
          <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-gold-light mb-1">
            How to pay
          </p>
          <p className="font-sans text-[13px] text-bk-heading whitespace-pre-wrap">
            {paymentInstructions}
          </p>
        </div>
      ) : (
        <p className="font-sans text-[12px] text-bk-muted mb-3">
          Payment instructions haven&apos;t been set yet — please contact support before paying.
        </p>
      )}
      <div className="mb-3">
        <FileUpload
          bucket="tournament-assets"
          pathPrefix="plan-proofs"
          label="Upload payment screenshot"
          onUploaded={setProofUrl}
        />
      </div>
      {error && <p className="text-bk-live text-[12px] font-sans mb-2">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="bg-white text-bk-bg font-sans font-bold text-[11px] tracking-[0.8px] uppercase px-4 py-2 disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit for approval"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="font-sans text-[12px] text-bk-muted underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
