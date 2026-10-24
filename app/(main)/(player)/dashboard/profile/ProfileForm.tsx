"use client";

import { latestAllowedBirthDate } from "@/lib/age";
import GamePicker, { type PickerGame } from "@/components/onboarding/GamePicker";
import { useState } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";

interface ProfileFormProps {
  email: string;
  initialAvatarUrl: string;
  initialFirstName: string;
  initialLastName: string;
  // Empty until chosen (Google/Discord/Twitch sign-ins). Once set it is shown, not editable.
  initialUsername?: string;
  initialMobileNumber: string;
  initialRegion: string;
  initialCountry: string;
  initialCity: string;
  // YYYY-MM-DD or empty. Locked once saved.
  initialBirthDate?: string;
  initialGender: string;
  initialHobbies: string;
  initialFavoriteGames: string[];
  initialPlayStyle?: string;
  // The catalog the player can pick from (filtered to their country).
  games: PickerGame[];
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
  initialUsername = "",
  initialMobileNumber,
  initialRegion,
  initialCountry,
  initialCity,
  initialBirthDate = "",
  initialGender,
  initialHobbies,
  initialFavoriteGames,
  initialPlayStyle = "",
  games,
  submitLabel = "Save changes",
  onSaved,
}: ProfileFormProps) {
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [username, setUsername] = useState(initialUsername);
  const [mobileNumber, setMobileNumber] = useState(initialMobileNumber);
  const [region, setRegion] = useState(initialRegion);
  const [country, setCountry] = useState(initialCountry);
  const [city, setCity] = useState(initialCity);
  const [birthDate, setBirthDate] = useState(initialBirthDate);
  const [gender, setGender] = useState(initialGender);
  const [hobbies, setHobbies] = useState(initialHobbies);
  const [favoriteGames, setFavoriteGames] = useState(initialFavoriteGames);
  const [playStyle, setPlayStyle] = useState(initialPlayStyle);
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
        username: initialUsername ? undefined : username.trim() || undefined,
        mobileNumber: mobileNumber || undefined,
        region: region || undefined,
        country: country || undefined,
        city: city || undefined,
        birthDate: initialBirthDate ? undefined : birthDate || undefined,
        gender: gender || undefined,
        hobbies: hobbies || undefined,
        favoriteGames,
        playStyle: playStyle || undefined,
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      <label className={labelClass}>Username{initialUsername ? "" : " *"}</label>
      {initialUsername ? (
        <p className="font-sans text-[14px] text-bk-heading mb-1">
          @{initialUsername} <span className="text-bk-muted text-[12px]">(shown on rankings. It can&apos;t be changed.)</span>
        </p>
      ) : (
        <>
          <input
            required
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
            maxLength={20}
            autoCapitalize="none"
            spellCheck={false}
            placeholder="3 to 20 letters, numbers or _"
            className={inputClass}
          />
          <p className="font-sans text-[12px] text-bk-muted mt-1.5 mb-1">
            Shown on rankings instead of your real name. You can&apos;t change it later.
          </p>
        </>
      )}

      <label className={labelClass}>Mobile number</label>
      <input value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} className={inputClass} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Date of birth</label>
          <input
            type="date"
            required={!initialBirthDate}
            disabled={!!initialBirthDate}
            min="1900-01-01"
            max={latestAllowedBirthDate()}
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className={`${inputClass} disabled:opacity-60`}
          />
          <p className="font-sans text-bk-muted text-[11px] mt-1">
            {initialBirthDate
              ? "Locked once saved. Contact support to correct a mistake."
              : "You must be 13 or over. It can't be changed after you save, and it decides which tournaments you can join."}
          </p>
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

      <label className={labelClass}>Play style</label>
      <select value={playStyle} onChange={(e) => setPlayStyle(e.target.value)} className={inputClass}>
        <option value="">Not set</option>
        <option value="casual">Casual</option>
        <option value="competitive">Competitive</option>
      </select>

      <label className={labelClass}>Favorite games</label>
      <GamePicker games={games} selected={favoriteGames} onChange={setFavoriteGames} max={10} />

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
        className="w-full bg-bk-primary text-bk-on-primary font-sans font-bold text-[12px] tracking-[0.8px] uppercase py-3 mt-6 disabled:opacity-50"
      >
        {submitting ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
