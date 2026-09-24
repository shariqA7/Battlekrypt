"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";

interface CustomField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
}

interface TournamentForJoin {
  entryType: string;
  mode: string;
  customFields: unknown;
  paymentInstructions: string | null;
}

export default function JoinForm({
  tournamentId,
  tournament,
}: {
  tournamentId: string;
  tournament: TournamentForJoin;
}) {
  const router = useRouter();
  const [paymentProofUrl, setPaymentProofUrl] = useState("");
  const [teamName, setTeamName] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const customFields: CustomField[] = Array.isArray(tournament.customFields)
    ? (tournament.customFields as CustomField[])
    : [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (tournament.entryType === "paid" && !paymentProofUrl) {
      setError("Please upload proof of payment before submitting.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/tournaments/${tournamentId}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customFieldResponses: fieldValues,
        paymentProofUrl: paymentProofUrl || undefined,
        teamName: tournament.mode !== "solo" ? teamName : undefined,
      }),
    });

    if (!res.ok) {
      const { error } = await res.json();
      setError(error.message);
      setSubmitting(false);
      return;
    }

    router.push("/dashboard");
  }

  const inputClass =
    "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]";
  const labelClass =
    "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5 mt-4";

  return (
    <form onSubmit={handleSubmit}>
      {tournament.mode !== "solo" && (
        <>
          <label className={labelClass}>Team name</label>
          <input
            required
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            className={inputClass}
          />
        </>
      )}

      {customFields.map((field) => (
        <div key={field.key}>
          <label className={labelClass}>{field.label}</label>
          <input
            required={field.required}
            value={fieldValues[field.key] ?? ""}
            onChange={(e) =>
              setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
            }
            className={inputClass}
          />
        </div>
      ))}

      {tournament.entryType === "paid" && (
        <>
          {tournament.paymentInstructions && (
            <div className="bg-bk-bg border border-bk-gold-light/40 px-3 py-2.5 mt-4">
              <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-gold-light mb-1">
                How to pay
              </p>
              <p className="font-sans text-[13px] text-bk-heading whitespace-pre-wrap">
                {tournament.paymentInstructions}
              </p>
            </div>
          )}

          <label className={labelClass}>Proof of payment</label>
          <FileUpload
            bucket="tournament-assets"
            pathPrefix="payment-proofs"
            label="Upload payment screenshot"
            onUploaded={setPaymentProofUrl}
          />
        </>
      )}

      {error && <p className="text-bk-live text-[12px] font-sans mt-4">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-white text-bk-bg font-sans font-bold text-[12px] tracking-[0.8px] uppercase py-3 mt-6 disabled:opacity-50"
      >
        {submitting ? "Submitting..." : "Submit registration"}
      </button>
    </form>
  );
}
