"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NotificationFilter } from "@/lib/services/notifications";
import { useNotifications } from "./useNotifications";
import NotificationList from "./NotificationList";

// Outside the component so the lint rule about impure calls in render stays quiet.
const nowMs = () => Date.now();

const BellIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6zM10 19a2 2 0 004 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-1.5 -right-1.5 bg-bk-live text-white text-[9px] font-bold rounded-full px-1 min-w-[15px] text-center">
      {count > 9 ? "9+" : count}
    </span>
  );
}

// Phones and tablets: the bell is a plain link to the full page.
export function NotificationBellLink({ initialUnread }: { initialUnread: number }) {
  const unread = useUnreadCount(initialUnread);
  return (
    <Link href="/notifications" aria-label="Notifications" className="relative w-11 h-11 flex items-center justify-center text-bk-body hover:text-bk-heading">
      <BellIcon />
      <span className="absolute top-2 right-1.5"><Badge count={unread.count} /></span>
    </Link>
  );
}

// Keeps the badge fresh: re-checks when the tab comes back into view and once a
// minute while it is visible. (Supabase Realtime can replace this later.)
function useUnreadCount(initial: number) {
  const [count, setCount] = useState(initial);
  useEffect(() => {
    let stopped = false;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/notifications/unread-count", { cache: "no-store" });
        if (r.ok && !stopped) setCount((await r.json()).unread);
      } catch {
        /* offline: keep the last number */
      }
    };
    const t = setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      stopped = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return { count, setCount };
}

// Desktop: the bell opens a panel under it instead of navigating away.
export default function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const { count, setCount } = useUnreadCount(initialUnread);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const lastLoad = useRef(0);

  const n = useNotifications(setCount);
  const { load } = n;

  const close = useCallback(() => setOpen(false), []);

  // Close after navigating.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    close();
  }, [pathname, close]);

  // Load when opened; reload if it has been a while, so reopening isn't stale.
  useEffect(() => {
    if (!open) return;
    if (!n.loaded || nowMs() - lastLoad.current > 30_000) {
      lastLoad.current = nowMs();
      load(filter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
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
  }, [open, close]);

  const switchTab = (f: NotificationFilter) => {
    setFilter(f);
    lastLoad.current = nowMs();
    load(f);
  };

  const tab = (f: NotificationFilter, label: string) => (
    <button
      type="button"
      onClick={() => switchTab(f)}
      aria-pressed={filter === f}
      className={`font-sans text-[13px] font-medium px-3 py-1.5 rounded-full ${
        filter === f ? "bg-bk-gold-light/15 text-bk-gold-light" : "text-bk-body hover:bg-bk-heading/[0.06]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="true"
        className={`relative px-1 ${open ? "text-bk-gold-light" : "text-bk-body hover:text-bk-heading"}`}
      >
        <BellIcon />
        <Badge count={count} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full mt-3 z-50 w-[390px] max-h-[min(640px,75vh)] flex flex-col bg-bk-bg-nav border border-bk-border-nav shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
        >
          <div className="px-4 pt-4 pb-2 shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="font-sans font-extrabold text-[20px] text-bk-heading">Notifications</h2>
              {count > 0 && (
                <button type="button" onClick={n.markAll} className="font-sans text-[12px] text-bk-gold-light hover:underline">
                  Mark all as read
                </button>
              )}
            </div>
            <div className="flex gap-2 mt-3">
              {tab("all", "All")}
              {tab("unread", "Unread")}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <NotificationList
              items={n.items}
              filter={filter}
              loading={n.loading}
              loaded={n.loaded}
              error={n.error}
              compact
              onOpen={n.markOne}
              onRetry={() => load(filter)}
              onShowAll={() => switchTab("all")}
            />
            {n.hasMore && (
              <button type="button" onClick={n.loadMore} disabled={n.loading} className="w-full py-3 font-sans text-[12px] text-bk-gold-light hover:underline disabled:opacity-50">
                {n.loading ? "Loading…" : "Load more"}
              </button>
            )}
          </div>

          <Link href="/notifications" onClick={close} className="shrink-0 border-t border-bk-border-nav text-center py-3 font-sans text-[13px] font-medium text-bk-gold-light hover:bg-bk-heading/[0.05]">
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
