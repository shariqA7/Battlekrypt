"use client";

// Sub tabs under an admin page title. Every tab is its own page, so the active
// one comes from the URL. Scrolls sideways on narrow screens (scrollbar hidden),
// and keeps the active tab in view.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { AdminSubTab } from "./adminNav";
import { AdminIcon } from "./AdminIcons";

export default function SubTabs({
  tabs,
  counts = {},
  label,
}: {
  tabs: AdminSubTab[];
  counts?: Record<string, number>;
  label: string;
}) {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  return (
    <nav aria-label={label} className="border-b border-bk-border-soft -mx-3 sm:mx-0">
      <ul className="flex gap-1 overflow-x-auto no-scrollbar px-3 sm:px-0">
        {tabs.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          const count = t.countKey ? counts[t.countKey] ?? 0 : 0;
          return (
            <li key={t.href} className="shrink-0">
              <Link
                ref={active ? activeRef : undefined}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-2 px-3.5 min-h-[44px] font-sans text-[13px] whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  active
                    ? "text-bk-gold-light font-bold border-bk-gold-light"
                    : "text-bk-muted hover:text-bk-heading border-transparent hover:border-bk-border"
                }`}
              >
                <AdminIcon name={t.icon} size={16} />
                {t.label}
                {count > 0 && (
                  <span className="bg-bk-amber text-bk-on-gold text-[10px] font-bold rounded-full px-1.5 min-w-[18px] text-center font-mono leading-[18px]">
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
