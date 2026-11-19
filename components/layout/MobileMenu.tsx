"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isGroup, itemIsActive, pathMatches, type NavItem } from "@/components/layout/nav-config";
import { BrandLogo } from "@/components/ui/BannerImage";

// The navigation drawer for phones and small tablets. The desktop bar in
// Nav.tsx is hidden below the xl breakpoint, so everything it offers has to be
// reachable from here.
export default function MobileMenu({
  items,
  signedIn,
}: {
  items: NavItem[];
  signedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Groups the person has expanded; the one holding the current page starts open.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (label: string, current: boolean) =>
    setExpanded((e) => ({ ...e, [label]: !current }));

  // Close after navigating, and lock page scroll while the drawer is open.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);
  // The bottom tab bar's "More" button opens this same drawer.
  useEffect(() => {
    const openMenu = () => setOpen(true);
    window.addEventListener("bk:open-menu", openMenu);
    return () => window.removeEventListener("bk:open-menu", openMenu);
  }, []);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const item =
    "block px-5 py-4 font-sans font-medium text-[13px] tracking-[1.2px] uppercase text-bk-body border-b border-bk-border-nav border-l-2 border-l-transparent active:bg-bk-heading/[0.05]";

  return (
    <div className="xl:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-11 h-11 -mr-2 flex items-center justify-center text-bk-heading"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          )}
        </svg>
      </button>

      {open && (
        <>
          {/* tap outside to close */}
          <div
            className="fixed inset-0 z-40 bg-black/60"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            className="fixed top-0 right-0 bottom-0 z-50 w-[min(320px,85vw)] bg-bk-bg-nav border-l border-bk-border-nav overflow-y-auto flex flex-col"
            style={{
              paddingTop: "env(safe-area-inset-top)",
              paddingRight: "env(safe-area-inset-right)",
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
          >
            <div className="flex items-center justify-between px-5 h-14 border-b border-bk-border-nav shrink-0">
              <BrandLogo className="h-9 w-auto max-w-[200px]" textFallback="BattleKrypt" />
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="w-11 h-11 -mr-3 flex items-center justify-center text-bk-heading"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <nav className="flex-1">
              {items.map((it) => {
                const active = itemIsActive(pathname, it);
                if (!isGroup(it)) {
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      aria-current={active ? "page" : undefined}
                      className={`${item} ${active ? "text-bk-gold-light border-l-2 border-l-bk-gold-from" : ""}`}
                    >
                      {it.label}
                    </Link>
                  );
                }
                const isOpen = expanded[it.label] ?? active;
                return (
                  <div key={it.label}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => toggle(it.label, isOpen)}
                      className={`${item} w-full flex items-center justify-between text-left ${active ? "text-bk-gold-light border-l-2 border-l-bk-gold-from" : ""}`}
                    >
                      <span>{it.label}</span>
                      <span aria-hidden="true" className="font-mono text-[16px] leading-none">
                        {isOpen ? "−" : "+"}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="bg-bk-heading/[0.03]">
                        {it.children.map((c) => (
                          <Link
                            key={c.href}
                            href={c.href}
                            aria-current={pathMatches(pathname, c.href) && !c.href.includes("?") && !c.href.includes("#") ? "page" : undefined}
                            className="block pl-9 pr-5 py-3 font-sans text-[14px] text-bk-body border-b border-bk-border-nav active:bg-bk-heading/[0.05]"
                          >
                            {c.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <Link href="/donate" className={`${item} text-bk-muted`}>
                Donate
              </Link>
            </nav>

            {!signedIn && (
              <div className="p-5 flex flex-col gap-3 border-t border-bk-border-nav shrink-0">
                <Link
                  href="/signup"
                  className="bg-bk-primary text-bk-on-primary text-center font-sans font-bold text-[13px] tracking-[0.8px] uppercase py-3.5"
                >
                  Sign up
                </Link>
                <Link
                  href="/login"
                  className="border border-bk-border text-bk-heading text-center font-sans font-medium text-[13px] py-3.5"
                >
                  Log in
                </Link>
                <Link
                  href="/organizer/register"
                  className="text-bk-gold-light text-center font-sans text-[11px] font-medium tracking-[0.6px] uppercase py-2"
                >
                  Register as an organization
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
