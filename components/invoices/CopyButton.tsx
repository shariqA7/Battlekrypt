"use client";

import { useState } from "react";

export default function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked: the value is still on screen to select */
        }
      }}
      className="font-sans text-[11px] text-bk-gold-light underline ml-2"
    >
      {done ? "Copied" : label}
    </button>
  );
}
