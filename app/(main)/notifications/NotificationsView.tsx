"use client";

import { useEffect, useState } from "react";
import type { NotificationFilter } from "@/lib/services/notifications";
import { useNotifications } from "@/components/notifications/useNotifications";
import NotificationList from "@/components/notifications/NotificationList";

// The full-page version of the bell panel: same list, same rules. A
// notification is only marked read when the person clicks it or chooses
// "Mark all as read"; just opening this page never changes anything.
export default function NotificationsView() {
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [unread, setUnread] = useState<number | null>(null);
  const n = useNotifications(setUnread);
  const { load } = n;

  useEffect(() => {
    load(filter, 30);
  }, [filter, load]);

  const tab = (f: NotificationFilter, label: string) => (
    <button
      type="button"
      onClick={() => setFilter(f)}
      aria-pressed={filter === f}
      className={`font-sans text-[13px] font-medium px-3 py-1.5 rounded-full ${
        filter === f ? "bg-bk-gold-light/15 text-bk-gold-light" : "text-bk-body hover:bg-bk-heading/[0.06]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex gap-2">
          {tab("all", "All")}
          {tab("unread", "Unread")}
        </div>
        {(unread ?? 0) > 0 && (
          <button type="button" onClick={n.markAll} className="font-sans text-[12px] text-bk-gold-light hover:underline">
            Mark all as read
          </button>
        )}
      </div>
      <div className="border border-bk-border bg-bk-surface">
        <NotificationList
          items={n.items}
          filter={filter}
          loading={n.loading}
          loaded={n.loaded}
          error={n.error}
          onOpen={n.markOne}
          onRetry={() => load(filter, 30)}
          onShowAll={() => setFilter("all")}
        />
        {n.hasMore && (
          <button type="button" onClick={n.loadMore} disabled={n.loading} className="w-full py-3 border-t border-bk-border font-sans text-[13px] text-bk-gold-light hover:underline disabled:opacity-50">
            {n.loading ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </>
  );
}
