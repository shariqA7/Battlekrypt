"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OrganizerOnboardPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [bio, setBio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/organizer/onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgName, bio }),
    });

    if (!res.ok) {
      const { error } = await res.json();
      setError(error.message);
      setSubmitting(false);
      return;
    }

    router.push("/organizer/dashboard");
  }

  return (
    <>
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <form
          onSubmit={handleSubmit}
          className="w-[340px] bg-bk-surface border border-bk-border p-6"
        >
          <p className="font-sans font-bold text-lg text-bk-heading mb-1">
            Become an organizer
          </p>
          <p className="font-sans text-bk-body text-[13px] mb-5">
            You&apos;ll be able to create draft tournaments right away.
            Publishing requires admin approval.
          </p>

          <label className="block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5">
            Organization name
          </label>
          <input
            required
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px] mb-4"
            placeholder="Falcons Esports"
          />

          <label className="block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5">
            Bio (optional)
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2 mb-4"
            placeholder="Tell players who you are"
          />

          {error && (
            <p className="text-bk-live text-[12px] font-sans mb-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-white text-bk-bg font-sans font-bold text-[12px] tracking-[0.8px] uppercase py-3 disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit"}
          </button>
        </form>
      </main>
    </>
  );
}
