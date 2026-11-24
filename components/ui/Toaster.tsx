"use client";

import { useEffect, useState } from "react";
import { TOAST_EVENT, type ToastDetail } from "@/lib/toast";

const tone: Record<ToastDetail["kind"], string> = {
  info: "border-bk-border",
  success: "border-bk-teal",
  warning: "border-bk-gold-light",
  error: "border-bk-live",
};

// Shows toasts from lib/toast.ts. Mounted once in the root layout. Sits above the phone tab bar
// and the home indicator, centred, newest at the bottom; each one clears itself after a few seconds.
export default function Toaster() {
  const [items, setItems] = useState<ToastDetail[]>([]);

  useEffect(() => {
    const timers = new Map<number, number>();
    const dismiss = (id: number) => {
      setItems((prev) => prev.filter((t) => t.id !== id));
      const h = timers.get(id);
      if (h) window.clearTimeout(h);
      timers.delete(id);
    };
    const onToast = (e: Event) => {
      const t = (e as CustomEvent<ToastDetail>).detail;
      setItems((prev) => [...prev.slice(-3), t]);
      timers.set(t.id, window.setTimeout(() => dismiss(t.id), t.ms));
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      timers.forEach((h) => window.clearTimeout(h));
    };
  }, []);

  if (items.length === 0) return null;
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[100] flex flex-col items-center gap-2 px-4"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 84px)" }}
    >
      {items.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className={`pointer-events-auto w-full max-w-md flex items-start gap-3 rounded-xl border bg-bk-surface px-4 py-3 shadow-lg ${tone[t.kind]}`}
        >
          <p className="flex-1 font-sans text-[13px] leading-snug text-bk-heading">{t.message}</p>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
            className="shrink-0 -mr-1 w-6 h-6 flex items-center justify-center rounded-full text-bk-muted hover:text-bk-heading"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
