"use client";

// A searchable table that shows 10 rows and loads 10 more as the admin scrolls down.
// The page gives it the first page (so it paints at once) and a column list.
import { useRouter } from "next/navigation";
import { useInfiniteSearch, useSentinel, type Page } from "./useInfiniteSearch";

export type Column<T> = { header: string; cell: (row: T) => React.ReactNode; className?: string };

export default function InfiniteList<T extends { id: string }>({
  endpoint,
  initial,
  columns,
  placeholder,
  searchLabel,
  params = "",
  rowHref,
  empty = "Nothing found.",
  toolbar,
}: {
  endpoint: string;
  initial?: Page<T>;
  columns: Column<T>[];
  placeholder: string;
  searchLabel: string;
  /** Filter parameters, e.g. "type=institute". */
  params?: string;
  /** Makes each row open a page. */
  rowHref?: (row: T) => string;
  empty?: string;
  /** Filters shown next to the search box. */
  toolbar?: React.ReactNode;
}) {
  const router = useRouter();
  const { q, setQ, items, loading, loaded, error, hasMore, loadMore, retry } = useInfiniteSearch<T>({ endpoint, params, initial });
  const sentinel = useSentinel(loadMore, [items.length, hasMore, loading]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-80">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-bk-muted pointer-events-none" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            aria-label={searchLabel}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans pl-9 pr-3 h-[40px]"
          />
        </div>
        {toolbar}
      </div>

      <div className="overflow-x-auto border border-bk-border">
        <table className="w-full font-sans text-[12px]">
          <thead className="bg-bk-surface text-bk-muted text-left uppercase tracking-[0.6px] text-[10px]">
            <tr>
              {columns.map((c) => (
                <th key={c.header} className={`px-3 py-2 font-medium ${c.className ?? ""}`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-bk-border">
            {items.map((row) => (
              <tr
                key={row.id}
                onClick={rowHref ? () => router.push(rowHref(row)) : undefined}
                className={`align-middle ${rowHref ? "cursor-pointer hover:bg-bk-surface-hover" : ""}`}
              >
                {columns.map((c) => (
                  <td key={c.header} className={`px-3 py-2.5 ${c.className ?? ""}`}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
            {loaded && items.length === 0 && !loading && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-bk-muted">
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-center font-sans text-[12px] text-bk-muted min-h-[20px]">
        {loading && "Loading…"}
        {error && (
          <span className="text-bk-live">
            {error}{" "}
            <button type="button" onClick={retry} className="underline">
              Try again
            </button>
          </span>
        )}
        {!loading && !error && hasMore && (
          <button type="button" onClick={loadMore} className="underline">
            Load more
          </button>
        )}
        {!loading && !error && !hasMore && items.length > 0 && `${items.length} shown`}
      </div>
      {hasMore && <div ref={sentinel} aria-hidden="true" className="h-px" />}
    </div>
  );
}
