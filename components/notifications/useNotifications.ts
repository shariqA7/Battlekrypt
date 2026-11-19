"use client";

import { useCallback, useRef, useState } from "react";
import type { NotificationDTO, NotificationFilter } from "@/lib/services/notifications";

interface Page {
  items: NotificationDTO[];
  nextCursor: string | null;
  unread: number;
}

// Loads notifications page by page and keeps read state in sync. Nothing is ever
// marked read on its own: only markOne (the person clicked it) or markAll.
export function useNotifications(onUnreadChange?: (n: number) => void) {
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const filterRef = useRef<NotificationFilter>("all");
  const seq = useRef(0);

  const fetchPage = useCallback(
    async (filter: NotificationFilter, after: string | null, limit: number) => {
      const qs = new URLSearchParams({ filter, limit: String(limit) });
      if (after) qs.set("cursor", after);
      const res = await fetch(`/api/notifications?${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error("load failed");
      return (await res.json()) as Page;
    },
    []
  );

  const load = useCallback(
    async (filter: NotificationFilter, limit = 15) => {
      const mine = ++seq.current;
      filterRef.current = filter;
      setLoading(true);
      setError(false);
      try {
        const page = await fetchPage(filter, null, limit);
        if (mine !== seq.current) return; // a newer load replaced this one
        setItems(page.items);
        setCursor(page.nextCursor);
        setLoaded(true);
        onUnreadChange?.(page.unread);
      } catch {
        if (mine === seq.current) setError(true);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [fetchPage, onUnreadChange]
  );

  const loadMore = useCallback(async () => {
    if (!cursor || loading) return;
    const mine = seq.current;
    setLoading(true);
    try {
      const page = await fetchPage(filterRef.current, cursor, 15);
      if (mine !== seq.current) return;
      setItems((cur) => [...cur, ...page.items.filter((p) => !cur.some((c) => c.id === p.id))]);
      setCursor(page.nextCursor);
      onUnreadChange?.(page.unread);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [cursor, loading, fetchPage, onUnreadChange]);

  const markOne = useCallback(
    (n: NotificationDTO) => {
      if (n.readAt) return;
      const now = new Date().toISOString();
      setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, readAt: now } : x)));
      fetch(`/api/notifications/${n.id}/read`, { method: "POST", keepalive: true })
        .then(() => fetch("/api/notifications/unread-count", { cache: "no-store" }))
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { unread: number } | null) => d && onUnreadChange?.(d.unread))
        .catch(() => {});
    },
    [onUnreadChange]
  );

  const markAll = useCallback(async () => {
    const now = new Date().toISOString();
    setItems((cur) => cur.map((x) => (x.readAt ? x : { ...x, readAt: now })));
    onUnreadChange?.(0);
    try {
      await fetch("/api/notifications/read", { method: "POST" });
    } catch {
      /* the next count refresh corrects the badge if this failed */
    }
  }, [onUnreadChange]);

  return { items, hasMore: !!cursor, loading, error, loaded, load, loadMore, markOne, markAll };
}
