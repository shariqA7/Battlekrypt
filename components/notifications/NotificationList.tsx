"use client";

import type { NotificationDTO, NotificationFilter } from "@/lib/services/notifications";
import EmptyState, { EmptyIcons } from "@/components/ui/EmptyState";
import NotificationRow from "./NotificationRow";

function Skeleton() {
  return (
    <ul aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex items-start gap-3 px-4 py-3">
          <span className="w-10 h-10 rounded-full bg-bk-heading/[0.07] animate-pulse" />
          <span className="flex-1 space-y-2 pt-1">
            <span className="block h-3 w-4/5 bg-bk-heading/[0.07] animate-pulse" />
            <span className="block h-3 w-2/5 bg-bk-heading/[0.05] animate-pulse" />
          </span>
        </li>
      ))}
    </ul>
  );
}

// The list body shared by the bell panel and the /notifications page:
// loading, error, the two empty states, then New / Earlier sections.
export default function NotificationList({
  items,
  filter,
  loading,
  loaded,
  error,
  compact,
  onOpen,
  onRetry,
  onShowAll,
}: {
  items: NotificationDTO[];
  filter: NotificationFilter;
  loading: boolean;
  loaded: boolean;
  error: boolean;
  compact?: boolean;
  onOpen: (n: NotificationDTO) => void;
  onRetry: () => void;
  onShowAll: () => void;
}) {
  if (error && items.length === 0) {
    return (
      <EmptyState
        compact={compact}
        icon={EmptyIcons.alert}
        title="Couldn't load notifications"
        hint="Check your connection and try again."
        action={{ label: "Try again", onClick: onRetry }}
      />
    );
  }
  if (!loaded || (loading && items.length === 0)) return <Skeleton />;

  if (items.length === 0) {
    return filter === "unread" ? (
      <EmptyState
        compact={compact}
        icon={EmptyIcons.check}
        title="No unread notifications"
        hint="You've read everything."
        action={{ label: "View all", onClick: onShowAll }}
      />
    ) : (
      <EmptyState
        compact={compact}
        icon={EmptyIcons.bell}
        title="You're all caught up"
        hint="Updates about your tournaments, payments and giveaways will show up here."
      />
    );
  }

  const fresh = items.filter((n) => !n.readAt);
  const earlier = items.filter((n) => n.readAt);
  const heading = "px-4 pt-3 pb-1 font-sans font-bold text-[13px] text-bk-heading";

  const rows = (list: NotificationDTO[]) => (
    <ul>
      {list.map((n) => (
        <li key={n.id}>
          <NotificationRow n={n} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );

  // On the Unread tab everything is unread, so the two headings would be noise.
  if (filter === "unread") return rows(items);
  return (
    <>
      {fresh.length > 0 && (
        <section>
          <h3 className={heading}>New</h3>
          {rows(fresh)}
        </section>
      )}
      {earlier.length > 0 && (
        <section>
          <h3 className={heading}>Earlier</h3>
          {rows(earlier)}
        </section>
      )}
    </>
  );
}
