"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";

interface ProfileFormProps {
  email: string;
  initialAvatarUrl: string;
  initialFirstName: string;
  initialLastName: string;
  initialMobileNumber: string;
  initialRegion: string;
  initialCountry: string;
  initialCity: string;
  initialAge?: number;
  initialGender: string;
  initialHobbies: string;
  initialFavoriteGames: string[];
  // Onboarding-mode overrides. Omitted entirely on the settings page, so
  // that page's behavior (in-place "Saved!" message, no redirect) is
  // unchanged — only the dedicated /onboarding page passes these.
  submitLabel?: string;
  onSaved?: () => void;
}

export default function ProfileForm({
  email,
  initialAvatarUrl,
  initialFirstName,
  initialLastName,
  initialMobileNumber,
  initialRegion,
  initialCountry,
  initialCity,
  initialAge,
  initialGender,
  initialHobbies,
  initialFavoriteGames,
  submitLabel = "Save changes",
  onSaved,
}: ProfileFormProps) {
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [mobileNumber, setMobileNumber] = useState(initialMobileNumber);
  const [region, setRegion] = useState(initialRegion);
  const [country, setCountry] = useState(initialCountry);
  const [city, setCity] = useState(initialCity);
  const [age, setAge] = useState(initialAge ?? "");
  const [gender, setGender] = useState(initialGender);
  const [hobbies, setHobbies] = useState(initialHobbies);
  const [favoriteGamesText, setFavoriteGamesText] = useState(initialFavoriteGames.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase() || "?";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSaved(false);

    const res = await fetch("/api/players/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        avatarUrl: avatarUrl || undefined,
        mobileNumber: mobileNumber || undefined,
        region: region || undefined,
        country: country || undefined,
        city: city || undefined,
        age: age || undefined,
        gender: gender || undefined,
        hobbies: hobbies || undefined,
        favoriteGames: favoriteGamesText
          .split(",")
          .map((g) => g.trim())
          .filter(Boolean),
      }),
    });

    if (!res.ok) {
      const { error } = await res.json();
      setError(error.message);
      setSubmitting(false);
      return;
    }

    setSaved(true);
    setSubmitting(false);
    if (onSaved) {
      onSaved();
    } else {
      router.refresh();
    }
  }

  const inputClass =
    "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]";
  const labelClass =
    "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5 mt-4";

  return (
    <form onSubmit={handleSubmit}>
      {/* Round avatar — shows the uploaded photo, or initials as a placeholder */}
      <div className="w-20 h-20 rounded-full overflow-hidden bg-bk-surface mb-4 flex items-center justify-center border border-bk-border">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="font-sans font-bold text-lg text-bk-heading">{initials}</span>
        )}
      </div>

      <FileUpload
        bucket="tournament-assets"
        pathPrefix="avatars"
        label="Upload a photo"
        onUploaded={setAvatarUrl}
      />

      <p className={labelClass}>Email</p>
      <input value={email} disabled className={inputClass + " opacity-60"} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>First name *</label>
          <input
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Last name *</label>
          <input
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <label className={labelClass}>Mobile number</label>
      <input value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} className={inputClass} />

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelClass}>Country</label>
          <input value={country} onChange={(e) => setCountry(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Region</label>
          <input value={region} onChange={(e) => setRegion(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>City</label>
          <input value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Age</label>
          <input
            type="number"
            min={0}
            value={age}
            onChange={(e) => setAge(e.target.value ? Number(e.target.value) : "")}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Gender</label>
          <select value={gender} onChange={(e) => setGender(e.target.value)} className={inputClass}>
            <option value="">Prefer not to say</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      <label className={labelClass}>Favorite games</label>
      <input
        value={favoriteGamesText}
        onChange={(e) => setFavoriteGamesText(e.target.value)}
        placeholder="e.g. PUBG Mobile, Valorant, FIFA"
        className={inputClass}
      />

      <label className={labelClass}>Hobbies / interests</label>
      <textarea
        value={hobbies}
        onChange={(e) => setHobbies(e.target.value)}
        rows={2}
        className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2"
      />

      {error && <p className="text-bk-live text-[12px] font-sans mt-4">{error}</p>}
      {saved && <p className="text-bk-gold-light text-[12px] font-sans mt-4">Saved!</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-white text-bk-bg font-sans font-bold text-[12px] tracking-[0.8px] uppercase py-3 mt-6 disabled:opacity-50"
      >
        {submitting ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
