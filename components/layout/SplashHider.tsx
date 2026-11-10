"use client";

import { useEffect } from "react";

// Keep the logo on screen at least this long after the navigation started, so a
// fast load does not flash it for a few milliseconds.
const MIN_VISIBLE_MS = 900;
const FADE_MS = 350;

// Fades the splash out once the page has hydrated. The overlay is hidden, never
// removed, so React's view of the DOM stays intact. In-app navigation does not
// re-run the root layout's effect, so the splash only appears on full loads.
export default function SplashHider() {
  useEffect(() => {
    const el = document.getElementById("bk-splash");
    if (!el || el.classList.contains("is-done")) return;

    // performance.now() counts from the start of this page load.
    const wait = Math.max(0, MIN_VISIBLE_MS - performance.now());
    let finish: ReturnType<typeof setTimeout>;
    const start = setTimeout(() => {
      el.classList.add("is-hiding");
      finish = setTimeout(() => el.classList.add("is-done"), FADE_MS);
    }, wait);

    return () => {
      clearTimeout(start);
      clearTimeout(finish);
    };
  }, []);

  return null;
}
