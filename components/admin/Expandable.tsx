"use client";

// Collapsible card for long review lists. The header is a short summary that is
// always visible; the full details open on click. Built so a list of many
// applications stays scannable: one compact row each, details on demand.
//
//   const set = useOpenSet();
//   <ExpandAllBar ids={ids} set={set} />
//   <Expandable open={set.has(id)} onToggle={() => set.toggle(id)} summary={...}>…</Expandable>
import { useCallback, useState } from "react";
import type { ReactNode } from "react";

export function useOpenSet() {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const has = useCallback((id: string) => open.has(id), [open]);
  const toggle = useCallback(
    (id: string) =>
      setOpen((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    []
  );
  const openAll = useCallback((ids: string[]) => setOpen(new Set(ids)), []);
  const closeAll = useCallback(() => setOpen(new Set()), []);
  const add = useCallback((id: string) => setOpen((prev) => new Set(prev).add(id)), []);
  return { has, toggle, openAll, closeAll, add, size: open.size };
}

export type OpenSet = ReturnType<typeof useOpenSet>;

const Chevron = ({ open }: { open: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function Expandable({
  id,
  open,
  onToggle,
  summary,
  aside,
  children,
}: {
  id: string;
  open: boolean;
  onToggle: () => void;
  /** Always-visible header content: name + one line of key facts. */
  summary: ReactNode;
  /** Small right-aligned header content (status chip, date). */
  aside?: ReactNode;
  children: ReactNode;
}) {
  const bodyId = `exp-${id}`;
  return (
    <div className={`bg-bk-surface border transition-colors ${open ? "border-bk-gold-light/50" : "border-bk-border hover:border-bk-border-nav"}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="w-full flex items-center gap-3 text-left px-4 py-3 min-h-[56px] hover:bg-bk-surface-hover transition-colors"
      >
        <span className="min-w-0 flex-1">{summary}</span>
        {aside && <span className="hidden sm:block shrink-0">{aside}</span>}
        <span className="shrink-0 text-bk-muted flex items-center gap-1 font-sans text-[11px]">
          <span className="hidden sm:inline">{open ? "Collapse" : "Details"}</span>
          <Chevron open={open} />
        </span>
      </button>
      {/* grid-rows 0fr -> 1fr animates height without measuring it */}
      <div id={bodyId} className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden min-h-0" inert={!open}>
          <div className="px-4 pb-4 pt-3 border-t border-bk-border-soft">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function ExpandAllBar({ ids, set }: { ids: string[]; set: OpenSet }) {
  if (ids.length < 2) return null;
  const all = set.size >= ids.length;
  return (
    <div className="flex justify-end mb-2">
      <button
        type="button"
        onClick={() => (all ? set.closeAll() : set.openAll(ids))}
        className="font-sans text-[12px] text-bk-gold-light underline min-h-[32px]"
      >
        {all ? "Collapse all" : "Expand all"}
      </button>
    </div>
  );
}

/** Small colored label for summaries ("plan pro", "attempt 2"). */
export function Chip({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "amber" | "teal" | "live" }) {
  const t = { muted: "bg-bk-bg text-bk-muted", amber: "bg-bk-amber/15 text-bk-amber", teal: "bg-bk-teal/15 text-bk-teal", live: "bg-bk-live/15 text-bk-live" }[tone];
  return <span className={`inline-block font-mono text-[10px] px-1.5 py-0.5 ${t}`}>{children}</span>;
}
