"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";

const labelClass =
  "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5";

export default function ClubRegisterForm() {
  const router = useRouter();
  const [clubName, setClubName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [error, setError] = useState<{ message: string; canClaim: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Tell people about a taken name as soon as they leave the field.
  async function checkName() {
    if (clubName.trim().length < 2) return;
    const res = await fetch(`/api/club/name-available?name=${encodeURIComponent(clubName.trim())}`);
    if (!res.ok) return;
    const body = await res.json();
    setError(body.available ? null : { message: body.message ?? "That name isn't available.", canClaim: !!body.canClaim });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/club/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubName, logoUrl }),
    });

    if (!res.ok) {
      const { error } = await res.json();
      setError({ message: error.message, canClaim: !!error.canClaim });
      setSubmitting(false);
      return;
    }

    router.push("/club/dashboard");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-[340px] bg-bk-surface border border-bk-border p-6"
    >
      <p className="font-sans font-bold text-lg text-bk-heading mb-1">Create a club</p>
      <p className="font-sans text-bk-body text-[13px] mb-5">
        Clubs are free and go live straight away. Each club name can only be
        used once, so pick the name you want to be known by.
      </p>

      <label className={labelClass}>Club name</label>
      <input
        required
        minLength={2}
        maxLength={60}
        value={clubName}
        onChange={(e) => setClubName(e.target.value)}
        onBlur={checkName}
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

      {error && (
        <div className="mb-3">
          <p className="text-bk-live text-[12px] font-sans">{error.message}</p>
          {error.canClaim && (
            <p className="text-bk-body text-[12px] font-sans mt-1">
              Is this your name?{" "}
              <Link href="/club/claim-name" className="text-bk-gold-light underline">
                Report it
              </Link>{" "}
              and an admin will review.
            </p>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-bk-primary text-bk-on-primary font-sans font-bold text-[12px] tracking-[0.8px] uppercase py-3 disabled:opacity-50"
      >
        {submitting ? "Creating..." : "Create club"}
      </button>
    </form>
  );
}
