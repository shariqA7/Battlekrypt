"use client";

// Type something and press Enter (or comma) and it becomes a tag with a cross to remove it.
// Backspace on an empty box removes the last tag. Text left in the box when it loses focus
// (for example when the player taps Finish) is added too, so nothing typed is lost.
import { useId, useRef, useState, type KeyboardEvent } from "react";

export default function TagInput({
  value,
  onChange,
  max,
  maxLength,
  placeholder = "Write here...",
  ariaLabel,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  max: number;
  maxLength: number;
  placeholder?: string;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const full = value.length >= max;

  function commit(text: string) {
    const parts = text.split(/[,;\n]/).map((t) => t.replace(/\s+/g, " ").trim().slice(0, maxLength).trim()).filter(Boolean);
    if (parts.length === 0) { setDraft(""); return; }
    const next = [...value];
    for (const t of parts) {
      if (next.length >= max) break;
      if (!next.some((x) => x.toLowerCase() === t.toLowerCase())) next.push(t);
    }
    onChange(next);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex flex-wrap items-center gap-2 min-h-[50px] w-full bg-bk-surface border border-bk-border rounded-xl px-3 py-2 cursor-text transition-all focus-within:border-bk-gold-light focus-within:shadow-[0_0_0_3px_rgba(244,200,66,0.12)]"
      >
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 max-w-full rounded-full border border-bk-gold-from/40 bg-bk-gold-from/10 pl-3 pr-1 py-1 font-sans text-[13px] text-bk-heading">
            <span className="truncate">{tag}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(value.filter((t) => t !== tag)); inputRef.current?.focus(); }}
              aria-label={`Remove ${tag}`}
              className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-bk-muted hover:text-bk-heading hover:bg-bk-gold-from/20 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => (e.target.value.includes(",") ? commit(e.target.value) : setDraft(e.target.value))}
          onKeyDown={onKeyDown}
          onBlur={() => commit(draft)}
          maxLength={maxLength}
          disabled={full}
          enterKeyHint="done"
          autoComplete="off"
          aria-label={ariaLabel}
          aria-describedby={hintId}
          placeholder={full ? "" : value.length === 0 ? placeholder : "Add another..."}
          className="flex-1 min-w-[120px] bg-transparent outline-none border-0 font-sans text-[14px] text-bk-heading placeholder:text-bk-muted disabled:cursor-not-allowed py-1"
        />
      </div>
      <p id={hintId} className="font-sans text-[12px] text-bk-muted mt-1.5" aria-live="polite">
        {full
          ? `${max} of ${max} added. Remove one to add another.`
          : `Press Enter to add. ${value.length} of ${max} added, up to ${maxLength} characters each.`}
      </p>
    </div>
  );
}
