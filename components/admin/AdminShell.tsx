"use client";

// The admin frame: a collapsible left sidebar (icons + names, or icons only),
// a breadcrumb bar on top of the page, and a slide-in drawer on phones.
// The collapsed/expanded choice is remembered in a cookie so the server can
// render the right width on first paint (no flash).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ADMIN_NAV_GROUPS,
  ADMIN_SIDEBAR_COOKIE,
  adminCrumbs,
  isAdminItemActive,
} from "./adminNav";
import { AdminIcon, ChevronRight, ChevronsLeft, ChevronsRight, CloseIcon, HomeIcon, MenuIcon } from "./AdminIcons";

function SidebarLinks({ collapsed, pending, onNavigate }: { collapsed: boolean; pending: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections" className="flex flex-col gap-4">
      {ADMIN_NAV_GROUPS.map((group, gi) => (
        <div key={group.label}>
          {collapsed ? (
            gi > 0 && <div className="mx-3 mb-2 border-t border-bk-border-soft" aria-hidden="true" />
          ) : (
            <p className="px-3 mb-1 font-sans font-bold text-[10px] uppercase tracking-[1.6px] text-bk-faint">{group.label}</p>
          )}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isAdminItemActive(item.href, pathname);
              const count = item.badge ? pending : 0;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    aria-label={collapsed ? (count > 0 ? `${item.label}, ${count} pending` : item.label) : undefined}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex items-center min-h-[44px] md:min-h-[40px] border-l-2 font-sans text-[13px] transition-colors ${
                      collapsed ? "justify-center px-0" : "gap-3 px-3"
                    } ${
                      active
                        ? "bg-bk-surface text-bk-gold-light font-bold border-bk-gold-light"
                        : "text-bk-muted hover:text-bk-heading hover:bg-bk-surface-hover border-transparent"
                    }`}
                  >
                    <AdminIcon name={item.icon} className="shrink-0" />
                    {!collapsed && <span className="truncate flex-1">{item.label}</span>}
                    {count > 0 &&
                      (collapsed ? (
                        <span className="absolute top-1 right-1.5 bg-bk-live text-white text-[9px] font-bold rounded-full px-1 min-w-[16px] text-center font-mono leading-4">
                          {count > 99 ? "99+" : count}
                        </span>
                      ) : (
                        <span className="bg-bk-live text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] text-center font-mono">
                          {count > 99 ? "99+" : count}
                        </span>
                      ))}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Breadcrumbs() {
  const pathname = usePathname();
  const crumbs = adminCrumbs(pathname);
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
      <ol className="flex items-center gap-1.5 font-sans text-[13px] min-w-0">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={c.href} className={`flex items-center gap-1.5 min-w-0 ${last ? "" : "shrink-0"}`}>
              {i > 0 && (
                <span className="text-bk-faint shrink-0">
                  <ChevronRight />
                </span>
              )}
              {last ? (
                <span aria-current="page" className="flex items-center gap-1.5 text-bk-heading font-bold truncate">
                  {i === 0 && <HomeIcon />}
                  <span className="truncate">{c.label}</span>
                </span>
              ) : (
                <Link href={c.href} className="flex items-center gap-1.5 text-bk-muted hover:text-bk-gold-light transition-colors">
                  {i === 0 && <HomeIcon />}
                  {c.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default function AdminShell({
  children,
  pending,
  defaultCollapsed,
}: {
  children: React.ReactNode;
  pending: number;
  defaultCollapsed: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      document.cookie = `${ADMIN_SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  // Close the phone drawer after navigating, and on Escape.
  useEffect(() => setDrawerOpen(false), [pathname]);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="flex-1 w-full max-w-[1600px] mx-auto px-3 sm:px-5 py-6 flex gap-6">
      {/* Desktop / tablet sidebar */}
      <aside
        className={`hidden md:block shrink-0 transition-[width] duration-200 ease-out ${collapsed ? "w-16" : "w-60"}`}
        aria-label="Admin sidebar"
      >
        <div className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto overflow-x-hidden bg-bk-bg-nav border border-bk-border-nav py-3">
          <div className={`flex items-center mb-3 ${collapsed ? "justify-center" : "justify-between pl-3 pr-2"}`}>
            {!collapsed && (
              <p className="border-l-[3px] border-bk-gold-from pl-3 font-sans font-extrabold text-lg text-bk-heading">Admin</p>
            )}
            <button
              type="button"
              onClick={toggle}
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="grid place-items-center w-9 h-9 text-bk-muted hover:text-bk-heading hover:bg-bk-surface-hover transition-colors"
            >
              {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
            </button>
          </div>
          <SidebarLinks collapsed={collapsed} pending={pending} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Breadcrumb bar (+ menu button on phones) */}
        <div className="flex items-center gap-3 mb-6 pb-3 border-b border-bk-border-soft">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open admin menu"
            aria-expanded={drawerOpen}
            className="md:hidden relative grid place-items-center w-11 h-11 -ml-1 text-bk-heading border border-bk-border bg-bk-surface"
          >
            <MenuIcon />
            {pending > 0 && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-bk-live" aria-hidden="true" />}
          </button>
          <Breadcrumbs />
        </div>
        {children}
      </div>

      {/* Phone drawer: always the full (expanded) menu */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Admin menu">
          <button type="button" aria-label="Close admin menu" onClick={() => setDrawerOpen(false)} className="absolute inset-0 bg-black/60" />
          <div
            className="absolute left-0 top-0 bottom-0 w-[280px] max-w-[85vw] bg-bk-bg-nav border-r border-bk-border-nav overflow-y-auto"
            style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)", paddingLeft: "env(safe-area-inset-left)" }}
          >
            <div className="flex items-center justify-between pl-3 pr-2 py-3">
              <p className="border-l-[3px] border-bk-gold-from pl-3 font-sans font-extrabold text-lg text-bk-heading">Admin</p>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close admin menu" className="grid place-items-center w-11 h-11 text-bk-muted hover:text-bk-heading">
                <CloseIcon />
              </button>
            </div>
            <SidebarLinks collapsed={false} pending={pending} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
