"use client";

import { useEffect, useState } from "react";

// Dark is the brand default (the look in the design mockup); the light theme
// is opt-in and remembered per browser. The <html data-theme> attribute is set
// before first paint by THEME_INIT_SCRIPT (see app/layout.tsx), so there is no
// flash of the wrong theme — this component only has to flip it.
export const THEME_STORAGE_KEY = "bk-theme";
export type Theme = "dark" | "light";

export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark")t="dark";document.documentElement.setAttribute("data-theme",t);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t==="light"?"#FBF8F1":"#16130B");}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`;

function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "light" ? "#FBF8F1" : "#16130B");
  try {
    localStorage.setItem(THEME_STORAGE_KEY, t);
  } catch {
    /* private mode etc.: the choice just won't persist */
  }
}

export default function ThemeToggle({ className = "" }: { className?: string }) {
  // null until mounted: the server can't know the theme, so render a neutral
  // placeholder of the same size to avoid a layout jump and hydration mismatch.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const t = document.documentElement.getAttribute("data-theme");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(t === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    applyTheme(next);
    setTheme(next);
  }

  const label = theme === "light" ? "Switch to dark theme" : "Switch to light theme";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme ? label : "Switch theme"}
      title={theme ? label : "Switch theme"}
      className={`w-11 h-11 sm:w-9 sm:h-9 inline-flex items-center justify-center text-bk-body hover:text-bk-gold-light transition-colors ${className}`}
    >
      {theme === "light" ? (
        // moon: shown in the light theme, click for dark
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      ) : (
        // sun: shown in the dark theme (and while loading), click for light
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 2v2.2M12 19.8V22M2 12h2.2M19.8 12H22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M19.1 4.9l-1.6 1.6M6.5 17.5l-1.6 1.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
