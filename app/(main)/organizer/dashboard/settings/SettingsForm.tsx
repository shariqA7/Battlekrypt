"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Spec §10: "Organizer profile: social links (YouTube, Twitch, Discord,
// Instagram, Facebook, TikTok)". Fixed set — matches what the Live Matches
// tab looks for when deep-linking to an organizer's stream.
const PLATFORMS = ["youtube", "twitch", "discord", "instagram", "facebook", "tiktok"] as const;

export default function SettingsForm({
  orgName: initialOrgName,
  bio: initialBio,
  socialLinks: initialSocialLinks,
}: {
  orgName: string;
  bio: string;
  socialLinks: Record<string, string>;
}) {
  const router = useRouter();
  const [orgName, setOrgName] = useState(initialOrgName);
  const [bio, setBio] = useState(initialBio);
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>(initialSocialLinks);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSaved(false);

    // Drop blank entries so an emptied field actually clears instead of
    // saving "".
    const cleanLinks = Object.fromEntries(
      Object.entries(socialLinks).filter(([, v]) => v.trim())
    );

    const res = await fetch("/api/organizer/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgName, bio, socialLinks: cleanLinks }),
    });

    setSubmitting(false);
    if (!res.ok) {
      const { error } = await res.json();
      setError(error?.message ?? "Something went wrong.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-bk-surface border border-bk-border p-6">
      <label className="block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5">
        Organization name
      </label>
      <input
        required
        value={orgName}
        onChange={(e) => setOrgName(e.target.value)}
        className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px] mb-4"
      />

      <label className="block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5">
        Bio
      </label>
      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        rows={3}
        className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2 mb-4"
        placeholder="Tell players who you are"
      />

      <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5">
        Social links
      </p>
      <div className="flex flex-col gap-2 mb-5">
        {PLATFORMS.map((platform) => (
          <div key={platform} className="flex items-center gap-2">
            <span className="w-[70px] font-sans text-[12px] text-bk-body capitalize shrink-0">
              {platform}
            </span>
            <input
              value={socialLinks[platform] ?? ""}
              onChange={(e) =>
                setSocialLinks((prev) => ({ ...prev, [platform]: e.target.value }))
              }
              placeholder={`https://${platform}.com/...`}
              className="flex-1 bg-bk-bg border border-bk-border text-bk-heading text-[12px] font-sans px-3 h-[34px]"
            />
          </div>
        ))}
      </div>

      {error && <p className="text-bk-live text-[12px] font-sans mb-3">{error}</p>}
      {saved && !error && (
        <p className="text-bk-teal text-[12px] font-sans mb-3">Saved.</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-bk-primary text-bk-on-primary font-sans font-bold text-[12px] tracking-[0.8px] uppercase py-3 disabled:opacity-50"
      >
        {submitting ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}
