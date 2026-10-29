"use client";

// Paged search for the admin pickers and lists. The first page (10 rows) comes with an
// empty search, so opening a picker shows people straight away; scrolling to the bottom
// calls loadMore() for the next 10. Typing starts again from the first page.
import { useCallback, useEffect, useRef, useState } from "react";

export type Page<T> = { items: T[]; nextCursor: string | null };

export function useInfiniteSearch<T extends { id: string }>({
  endpoint,
  params = "",
  initial,
  enabled = true,
  debounceMs = 250,
}: {
  endpoint: string;
  /** Extra query string, e.g. "type=institute". A change starts again from page one. */
  params?: string;
  /** Page one for an empty search, when the server already has it. */
  initial?: Page<T>;
  /** A picker only loads once it is opened. */
  enabled?: boolean;
  debounceMs?: number;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<T[]>(initial?.items ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(initial?.nextCursor ?? null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(Boolean(initial));
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const cursorRef = useRef<string | null>(initial?.nextCursor ?? null);
  const busyRef = useRef(false);
  // The server-made page is only right for "no search, no filter": the first time.
  const useInitial = useRef(Boolean(initial));

  const url = useCallback(
    (search: string, cursor: string | null) => {
      const sp = new URLSearchParams(params);
      if (search) sp.set("q", search);
      if (cursor) sp.set("cursor", cursor);
      return `${endpoint}?${sp.toString()}`;
    },
    [endpoint, params]
  );

  const fetchPage = useCallback(
    async (search: string, cursor: string | null) => {
      const id = ++request.current;
      busyRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(url(search, cursor));
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error?.message ?? "Couldn't load the list.");
        const page = (await res.json()) as Page<T>;
        if (id !== request.current) return; // a newer search replaced this one
        setItems((prev) => {
          if (!cursor) return page.items;
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...page.items.filter((i) => !seen.has(i.id))];
        });
        cursorRef.current = page.nextCursor;
        setNextCursor(page.nextCursor);
        setLoaded(true);
      } catch (e) {
        if (id === request.current) setError(e instanceof Error ? e.message : "Couldn't load the list.");
      } finally {
        if (id === request.current) {
          busyRef.current = false;
          setLoading(false);
        }
      }
    },
    [url]
  );

  // First page, and again whenever the search or the filter changes.
  useEffect(() => {
    if (!enabled) return;
    if (useInitial.current && q === "" && params === "") {
      useInitial.current = false;
      return;
    }
    useInitial.current = false;
    const t = setTimeout(() => fetchPage(q, null), q ? debounceMs : 0);
    return () => clearTimeout(t);
  }, [q, params, enabled, fetchPage, debounceMs]);

  const loadMore = useCallback(() => {
    if (busyRef.current || !cursorRef.current) return;
    void fetchPage(q, cursorRef.current);
  }, [fetchPage, q]);

  const retry = useCallback(() => fetchPage(q, null), [fetchPage, q]);

  return { q, setQ, items, loading, loaded, error, hasMore: nextCursor !== null, loadMore, retry };
}

// Calls onVisible whenever the marker scrolls into view (inside `root`, or the page).
export function useSentinel(onVisible: () => void, deps: unknown[], root?: React.RefObject<Element | null>) {
  const ref = useRef<HTMLDivElement | null>(null);
  const cb = useRef(onVisible);
  useEffect(() => {
    cb.current = onVisible;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && cb.current(), {
      root: root?.current ?? null,
      rootMargin: "120px",
    });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}
