"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isGroup, itemIsActive, type NavItem } from "@/components/layout/nav-config";

const LABEL =
  "font-sans font-medium text-[15px] pb-1 border-b-2 transition-colors cursor-pointer";
const ACTIVE = "text-bk-gold-light border-bk-gold-from";
const IDLE = "text-bk-body border-transparent hover:text-bk-heading";

// The centered desktop links. Plain items are links. Groups (Play, Community,
// Plans) are labels with no arrow: the menu opens when the mouse rests on them,
// or on click / Enter for touch screens and keyboards. The current section is
// gold with a bar under it, same as before.
export default function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname() ?? "";
  const [openLabel, setOpenLabel] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedByMouse = useRef(false);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);
  const close = useCallback(() => {
    cancelClose();
    openedByMouse.current = false;
    setOpenLabel(null);
  }, [cancelClose]);

  // Close after navigating.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    close();
  }, [pathname, close]);

  useEffect(() => {
    if (!openLabel) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openLabel, close]);

  return (
    <div ref={rootRef} className="flex items-center gap-8">
      {items.map((item) => {
        const active = itemIsActive(pathname, item);

        if (!isGroup(item)) {
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`${LABEL} ${active ? ACTIVE : IDLE}`}
            >
              {item.label}
            </Link>
          );
        }

        const open = openLabel === item.label;
        return (
          <div
            key={item.label}
            className="relative"
            // Only a real mouse opens on hover; touch has no hover and would
            // otherwise open then immediately close on the tap.
            onPointerEnter={(e) => {
              if (e.pointerType !== "mouse") return;
              cancelClose();
              openedByMouse.current = true;
              setOpenLabel(item.label);
            }}
            onPointerLeave={(e) => {
              if (e.pointerType !== "mouse") return;
              cancelClose();
              closeTimer.current = setTimeout(close, 160);
            }}
          >
            <button
              type="button"
              aria-haspopup="true"
              aria-expanded={open}
              onClick={() => {
                // A click right after hover-open keeps it open instead of flicking it shut.
                setOpenLabel((cur) => (openedByMouse.current ? item.label : cur === item.label ? null : item.label));
                openedByMouse.current = false;
              }}
              className={`${LABEL} ${open || active ? ACTIVE : IDLE}`}
            >
              {item.label}
            </button>

            {open && (
              // pt-3 is an invisible bridge so the menu doesn't close while the
              // pointer crosses the gap under the label.
              <div className="absolute left-1/2 top-full z-50 -translate-x-1/2 pt-3">
                <ul
                  className="w-[300px] bg-bk-bg-nav border border-bk-border-nav shadow-[0_12px_32px_rgba(0,0,0,0.35)] py-2"
                  role="menu"
                >
                  {item.children.map((c) => (
                    <li key={c.href} role="none">
                      <Link
                        href={c.href}
                        role="menuitem"
                        onClick={close}
                        className="block px-4 py-2.5 hover:bg-bk-heading/[0.06] focus-visible:bg-bk-heading/[0.06] outline-none"
                      >
                        <span className="block font-sans font-medium text-[14px] text-bk-heading">
                          {c.label}
                        </span>
                        <span className="block font-sans text-[12px] text-bk-muted mt-0.5">
                          {c.description}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
