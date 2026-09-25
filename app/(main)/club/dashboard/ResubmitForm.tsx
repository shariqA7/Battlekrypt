"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";

export default function ResubmitForm() {
  const router = useRouter();
  const [feeProofUrl, setFeeProofUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!feeProofUrl) {
      setError("Please upload a new payment proof first.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/club/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feeProofUrl }),
    });

    if (!res.ok) {
      const { error } = await res.json();
      setError(error.message);
      setSubmitting(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <FileUpload
        bucket="tournament-assets"
        pathPrefix="club-fee-proofs"
        label="Upload new payment screenshot"
        onUploaded={setFeeProofUrl}
      />
      {error && <p className="text-bk-live text-[12px] font-sans">{error}</p>}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="bg-white text-bk-bg font-sans font-bold text-[12px] tracking-[0.8px] uppercase py-2.5 disabled:opacity-50"
      >
        {submitting ? "Submitting..." : "Resubmit for approval"}
      </button>
    </div>
  );
}
