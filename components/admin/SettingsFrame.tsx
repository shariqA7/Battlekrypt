"use client";

// Frame for every page under /admin/settings. The landing page (the card grid)
// renders as is. Any other settings page gets a "‹ All settings" sidebar on the
// left (tabs scrolling sideways on phones) and its own title above the content.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SettingsGroup } from "./settingsNav";
import { AdminIcon, ChevronLeft } from "./AdminIcons";
import SubTabs from "./SubTabs";

export default function SettingsFrame({ groups, children }: { groups: SettingsGroup[]; children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/admin/settings") return <>{children}</>;

  const all = groups.flatMap((g) => g.items);
  const current = all.find((i) => pathname === i.href || pathname.startsWith(i.href + "/"));

  return (
    <div className="flex flex-col gap-5 md:flex-row md:gap-8 md:items-start">
      <aside className="md:w-64 md:shrink-0 md:sticky md:top-4">
        <Link
          href="/admin/settings"
          className="inline-flex items-center gap-2 min-h-[40px] pr-3 font-sans font-medium text-[14px] text-bk-heading hover:text-bk-gold-light transition-colors"
        >
          <ChevronLeft />
          All settings
        </Link>

        {/* Phones: one scrolling row of tabs */}
        <div className="md:hidden mt-2">
          <SubTabs tabs={all.map(({ href, label, icon }) => ({ href, label, icon }))} label="Settings sections" />
        </div>

        {/* Tablets and up: grouped list */}
        <nav aria-label="Settings sections" className="hidden md:block mt-3 pt-4 border-t border-bk-border-soft space-y-5">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-3 mb-1.5 font-sans font-bold text-[11px] uppercase tracking-[1.4px] text-bk-faint">{group.label}</p>
              <ul className="space-y-0.5">
                {group.items.map((i) => {
                  const active = i === current;
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center gap-2.5 min-h-[40px] rounded-lg px-3 font-sans text-[13.5px] transition-colors ${
                          active
                            ? "bg-bk-gold-light/12 text-bk-gold-light font-bold"
                            : "text-bk-body hover:text-bk-heading hover:bg-bk-surface-hover"
                        }`}
                      >
                        <AdminIcon name={i.icon} size={17} className="shrink-0" />
                        <span className="truncate">{i.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="bk-settings-body min-w-0 flex-1">
        {current && (
          <header className="mb-6">
            <h1 className="font-sans font-bold text-xl text-bk-heading">{current.label}</h1>
            <p className="font-sans text-[13px] text-bk-body mt-1">{current.description}</p>
          </header>
        )}
        {children}
      </div>
    </div>
  );
}
