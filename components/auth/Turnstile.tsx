"use client";

// The "are you human" box (Cloudflare Turnstile). Shows nothing unless
// NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. A token works once, so forms bump `resetKey` after
// every attempt to get a fresh one; the server (lib/captcha.ts) is what actually checks it.
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
export const captchaRequired = SITE_KEY.length > 0;

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { scriptPromise = null; reject(new Error("failed to load")); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export default function Turnstile({ onToken, resetKey = 0 }: { onToken: (token: string) => void; resetKey?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const callback = useRef(onToken);
  const [failed, setFailed] = useState(false);

  useEffect(() => { callback.current = onToken; });

  useEffect(() => {
    if (!captchaRequired) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return;
        widget.current = window.turnstile.render(box.current, {
          sitekey: SITE_KEY,
          theme: "auto",
          callback: (t: string) => callback.current(t),
          "expired-callback": () => callback.current(""),
          "error-callback": () => callback.current(""),
        });
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetKey > 0 && widget.current && window.turnstile) {
      window.turnstile.reset(widget.current);
      callback.current("");
    }
  }, [resetKey]);

  if (!captchaRequired) return null;
  return (
    <div className="my-3">
      <div ref={box} className="flex justify-center min-h-[65px]" />
      {failed && (
        <p role="alert" className="font-sans text-[12px] text-bk-live text-center mt-1">
          Couldn&apos;t load the human check. Turn off any blocker for this site and refresh the page.
        </p>
      )}
    </div>
  );
}
