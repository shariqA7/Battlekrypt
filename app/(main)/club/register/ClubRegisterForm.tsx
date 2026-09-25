"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";

const labelClass =
  "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5";

export default function ClubRegisterForm({
  paymentInstructions,
}: {
  paymentInstructions: string | null;
}) {
  const router = useRouter();
  const [clubName, setClubName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [feeProofUrl, setFeeProofUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!feeProofUrl) {
      setError("Please upload proof of your registration-fee payment.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/club/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubName, logoUrl, feeProofUrl }),
    });

    if (!res.ok) {
      const { error } = await res.json();
      setError(error.message);
      setSubmitting(false);
      return;
    }

    router.push("/club/dashboard");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-[340px] bg-bk-surface border border-bk-border p-6"
    >
      <p className="font-sans font-bold text-lg text-bk-heading mb-1">Register a club</p>
      <p className="font-sans text-bk-body text-[13px] mb-5">
        Clubs have a one-time registration fee. An admin reviews your payment proof
        before the club is activated.
      </p>

      <label className={labelClass}>Club name</label>
      <input
        required
        minLength={2}
        maxLength={60}
        value={clubName}
        onChange={(e) => setClubName(e.target.value)}
        className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px] mb-4"
        placeholder="Falcons"
      />

      <label className={labelClass}>Club logo (optional)</label>
      <div className="mb-4">
        <FileUpload
          bucket="tournament-assets"
          pathPrefix="club-logos"
          label="Upload logo"
          onUploaded={setLogoUrl}
        />
      </div>

      {paymentInstructions && (
        <div className="bg-bk-bg border border-bk-gold-light/40 px-3 py-2.5 mb-4">
          <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-gold-light mb-1">
            How to pay
          </p>
          <p className="font-sans text-[13px] text-bk-heading whitespace-pre-wrap">
            {paymentInstructions}
          </p>
        </div>
      )}

      <label className={labelClass}>Proof of payment</label>
      <div className="mb-4">
        <FileUpload
          bucket="tournament-assets"
          pathPrefix="club-fee-proofs"
          label="Upload payment screenshot"
          onUploaded={setFeeProofUrl}
        />
      </div>

      {error && <p className="text-bk-live text-[12px] font-sans mb-3">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-white text-bk-bg font-sans font-bold text-[12px] tracking-[0.8px] uppercase py-3 disabled:opacity-50"
      >
        {submitting ? "Submitting..." : "Submit for approval"}
      </button>
    </form>
  );
}
