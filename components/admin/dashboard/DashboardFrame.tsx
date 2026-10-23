"use client";

// Heading row + the time-range filter, and the wrapper that dims the page
// while a new range is loading. The range lives in the URL (?range=week) so a
// filtered view can be bookmarked or shared, and the server does the counting.
import { useOptimistic, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

type RangeOption = { key: string; label: string };

export default function DashboardFrame({
  range,
  ranges,
  heading,
  children,
}: {
  range: string;
  ranges: RangeOption[];
  heading: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  // Highlights the clicked range at once; settles on the URL's range when the page arrives.
  const [selected, setSelected] = useOptimistic(range);

  const index = Math.max(0, ranges.findIndex((r) => r.key === selected));

  function choose(key: string) {
    if (key === selected) return;
    startTransition(() => {
      setSelected(key);
      router.push(`${pathname}?range=${key}`, { scroll: false });
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        {heading}

        <div className="w-full sm:w-auto overflow-x-auto no-scrollbar">
          <div role="group" aria-label="Time range" className="relative grid grid-cols-6 min-w-[360px] sm:w-[400px] bg-bk-surface border border-bk-border">
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 bg-gradient-to-b from-bk-gold-from to-bk-gold-to transition-transform duration-300 ease-out"
              style={{ width: `${100 / ranges.length}%`, transform: `translateX(${index * 100}%)` }}
            />
            {ranges.map((r) => {
              const on = r.key === selected;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => choose(r.key)}
                  aria-pressed={on}
                  className={`relative z-10 min-h-[40px] px-2 font-sans text-[12px] whitespace-nowrap transition-colors ${
                    on ? "text-bk-on-gold font-bold" : "text-bk-muted hover:text-bk-heading"
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* thin progress line while loading */}
      <div className="h-0.5 -mt-3 overflow-hidden" aria-hidden="true">
        {pending && <div className="h-full w-1/3 bg-bk-gold-light animate-pulse" />}
      </div>

      <div aria-busy={pending} className={`space-y-6 transition-opacity duration-200 ${pending ? "opacity-50" : ""}`}>
        {children}
      </div>
    </div>
  );
}
