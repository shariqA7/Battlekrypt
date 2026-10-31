"use client";

// Paid-plan upgrade: the owner pays the fee, uploads proof, and an admin
// verifies it. Clubs work on the free plan without any of this.
import { useState } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";
import { buttonClass } from "@/components/ui/Button";

export default function UpgradeForm({ paymentInstructions }: { paymentInstructions: string | null }) {
  const router = useRouter();
  const [feeProofUrl, setFeeProofUrl] = useState("");
  const [feeReference, setFeeReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!feeProofUrl) {
      setError("Please upload your payment screenshot first.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/club/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feeProofUrl, feeReference }),
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
      {paymentInstructions && (
        <div className="bg-bk-bg border border-bk-gold-light/40 px-3 py-2.5">
          <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-gold-light mb-1">
            How to pay
          </p>
          <p className="font-sans text-[13px] text-bk-heading whitespace-pre-wrap">
            {paymentInstructions}
          </p>
        </div>
      )}
      <FileUpload
        bucket="payment-proofs"
        isPrivate
        ownerFolder
        pathPrefix="club-fee-proofs"
        label="Upload payment screenshot"
        onUploaded={setFeeProofUrl}
      />
      <input
        type="text"
        value={feeReference}
        onChange={(e) => setFeeReference(e.target.value)}
        maxLength={120}
        autoComplete="off"
        placeholder="Transaction ID from your receipt"
        aria-label="Transaction ID"
        className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] px-3 h-[36px]"
      />
      {error && <p className="text-bk-live text-[12px] font-sans">{error}</p>}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className={buttonClass("primary", "md", "w-full sm:w-auto")}
      >
        {submitting ? "Submitting..." : "Submit payment for review"}
      </button>
    </div>
  );
}
