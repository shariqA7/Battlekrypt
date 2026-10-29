"use client";

// A search box that opens a list. Clicking it shows the first 10 results straight away
// (no typing needed); scrolling the list loads 10 more; typing narrows it. Used wherever
// an admin has to find a person, an organization or a club.
import { useId, useRef, useState } from "react";
import { useInfiniteSearch, useSentinel } from "./useInfiniteSearch";

export default function SearchPicker<T extends { id: string }>({
  endpoint,
  placeholder = "Search…",
  label,
  renderItem,
  onPick,
  isDisabled,
  emptyText = "Nothing found.",
  autoFocus,
}: {
  endpoint: string;
  placeholder?: string;
  label: string;
  renderItem: (item: T) => React.ReactNode;
  onPick: (item: T) => void;
  /** Rows that can be seen but not chosen (e.g. already an organizer). */
  isDisabled?: (item: T) => boolean;
  emptyText?: string;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const { q, setQ, items, loading, loaded, error, hasMore, loadMore, retry } = useInfiniteSearch<T>({ endpoint, enabled: open });
  const sentinel = useSentinel(loadMore, [open, items.length, hasMore, loading], listRef);

  function pick(item: T) {
    if (isDisabled?.(item)) return;
    onPick(item);
    setOpen(false);
    setQ("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") return setOpen(false);
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      e.preventDefault();
      return setOpen(true);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && items[active]) {
      e.preventDefault();
      pick(items[active]);
    }
  }

  return (
    <div
      ref={boxRef}
      className="relative"
      onBlur={(e) => {
        if (!boxRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-bk-muted pointer-events-none" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoFocus={autoFocus}
          autoComplete="off"
          value={q}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans pl-9 pr-3 h-[40px]"
        />
      </div>

      {open && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label={`${label} results`}
          className="absolute z-30 left-0 right-0 mt-1 max-h-[300px] overflow-y-auto bg-bk-surface border border-bk-border shadow-[0_12px_32px_rgba(0,0,0,0.45)] divide-y divide-bk-border"
        >
          {items.map((item, i) => {
            const disabled = isDisabled?.(item) ?? false;
            return (
              <li key={item.id} role="option" aria-selected={i === active} aria-disabled={disabled}>
                <button
                  type="button"
                  disabled={disabled}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(item)}
                  className={`w-full text-left px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed ${i === active ? "bg-bk-surface-hover" : ""}`}
                >
                  {renderItem(item)}
                </button>
              </li>
            );
          })}
          {loaded && items.length === 0 && !loading && <li className="px-3 py-3 font-sans text-[12px] text-bk-muted">{emptyText}</li>}
          {loading && <li className="px-3 py-2.5 font-sans text-[12px] text-bk-muted">Loading…</li>}
          {error && (
            <li className="px-3 py-2.5 font-sans text-[12px] text-bk-live">
              {error}{" "}
              <button type="button" onClick={retry} className="underline">
                Try again
              </button>
            </li>
          )}
          {hasMore && <li ref={sentinel as React.Ref<HTMLLIElement>} aria-hidden="true" className="h-px" />}
        </ul>
      )}
    </div>
  );
}
