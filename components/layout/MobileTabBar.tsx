"use client";

// Fixed bottom tab bar for phones (hidden from the md breakpoint up, where the top nav
// has room). Four destinations plus "More", which opens the same drawer as the top-bar
// menu button. Highlights the current section and respects the iPhone home indicator.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement } from "react";

const stroke = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const svg = (children: ReactElement) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">{children}</svg>
);

const TABS: { label: string; href: string; icon: ReactElement; match: (p: string) => boolean }[] = [
  {
    label: "Home", href: "/", match: (p) => p === "/",
    icon: svg(<path {...stroke} d="M4 11l8-7 8 7v8.5a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19.5V11z" />),
  },
  {
    label: "Tournaments", href: "/tournaments", match: (p) => p.startsWith("/tournaments"),
    icon: svg(<><path {...stroke} d="M8 4h8v5a4 4 0 0 1-8 0V4z" /><path {...stroke} d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7" /></>),
  },
  {
    label: "Challenges", href: "/challenges", match: (p) => p.startsWith("/challenges"),
    icon: svg(<><path {...stroke} d="M5 19L19 5M14 5h5v5M5 5l4 4M15 19l4-4" /></>),
  },
  {
    // Live stays one tap away in the More menu.
    label: "Ranking", href: "/rankings", match: (p) => p.startsWith("/rankings"),
    icon: svg(<><path {...stroke} d="M4 8l3.5 3L12 5l4.5 6L20 8l-1.5 9h-13L4 8z" /><path {...stroke} d="M6 20h12" /></>),
  },
];

export default function MobileTabBar({ showChallenges = true }: { showChallenges?: boolean }) {
  const pathname = usePathname();
  const item = "flex-1 min-w-0 flex flex-col items-center justify-center gap-1 pt-2 pb-1.5 font-sans text-[10px] tracking-[0.6px] uppercase transition-colors";

  return (
    <nav
      aria-label="Main"
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-bk-bg-nav/95 backdrop-blur border-t border-bk-border-nav"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex h-16">
        {TABS.filter((t) => showChallenges || t.href !== "/challenges").map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`${item} ${active ? "text-bk-gold-light" : "text-bk-muted active:text-bk-heading"}`}
            >
              <span className={`relative flex items-center justify-center w-12 h-7 rounded-full transition-colors ${active ? "bg-bk-gold-from/15" : ""}`}>
                {t.icon}
              </span>
              <span className="truncate max-w-full px-0.5">{t.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("bk:open-menu"))}
          className={`${item} text-bk-muted active:text-bk-heading`}
        >
          <span className="flex items-center justify-center w-12 h-7">
            {svg(<><circle cx="5.5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="18.5" cy="12" r="1.6" fill="currentColor" /></>)}
          </span>
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
