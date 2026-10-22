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
    label: "Live", href: "/live", match: (p) => p.startsWith("/live"),
    icon: svg(<><circle {...stroke} cx="12" cy="12" r="2.2" /><path {...stroke} d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" /></>),
  },
];

export default function MobileTabBar() {
  const pathname = usePathname();
  const item = "flex-1 min-w-0 flex flex-col items-center justify-center gap-1 pt-2 pb-1.5 font-sans text-[10px] tracking-[0.6px] uppercase transition-colors";

  return (
    <nav
      aria-label="Main"
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-bk-bg-nav/95 backdrop-blur border-t border-bk-border-nav"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex h-16">
        {TABS.map((t) => {
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
