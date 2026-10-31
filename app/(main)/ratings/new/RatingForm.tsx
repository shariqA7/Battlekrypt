"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/Button";

const WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

export default function RatingForm({ tournamentId, initialStars, initialComment }: { tournamentId: string; initialStars: number; initialComment: string }) {
  const router = useRouter();
  const [stars, setStars] = useState(initialStars);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(initialComment);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = hover || stars;
  const low = stars > 0 && stars <= 2;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stars) return setError("Choose 1 to 5 stars.");
    setBusy(true);
    setError(null);
    const res = await fetch("/api/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentId, stars, comment }),
    });
    setBusy(false);
    if (res.ok) return router.push("/dashboard");
    setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
  }

  return (
    <form onSubmit={submit}>
      <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5">Your rating</p>
      <div role="radiogroup" aria-label="Rating out of 5 stars" className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}: ${WORDS[n]}`}
            onClick={() => setStars(n)}
            onMouseEnter={() => setHover(n)}
            className={`text-[34px] leading-none px-0.5 min-w-[44px] min-h-[44px] transition-colors ${n <= shown ? "text-bk-gold-light" : "text-bk-border"}`}
          >
            ★
          </button>
        ))}
        <span className="font-sans text-[13px] text-bk-body ml-2" aria-live="polite">
          {WORDS[shown]}
        </span>
      </div>

      <label htmlFor="rating-comment" className="block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5 mt-5">
        {low ? "What went wrong?" : "Comment (optional)"}
      </label>
      <textarea
        id="rating-comment"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={4}
        maxLength={500}
        placeholder={low ? "A few words help us look into it." : "How was the event?"}
        className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2"
      />
      <p className="font-sans text-[11px] text-bk-muted mt-1">
        {low ? "Needed for 1 or 2 stars. " : ""}Admins can see your name with the comment. Keep it about the event.
      </p>

      {error && (
        <p role="alert" className="text-bk-live text-[12px] font-sans mt-3">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={`${buttonClass("primary", "md")} mt-5`}>
        {busy ? "Saving…" : initialStars ? "Update rating" : "Submit rating"}
      </button>
    </form>
  );
}
