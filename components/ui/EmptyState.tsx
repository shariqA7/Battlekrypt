import Link from "next/link";
import type { ReactNode } from "react";

// The one "nothing here" block for the whole site: an icon, a short title, an
// optional hint and an optional action. Use `compact` inside small panels.
export type EmptyAction =
  | { label: string; href: string }
  | { label: string; onClick: () => void };

export default function EmptyState({
  icon,
  title,
  hint,
  action,
  compact = false,
  className = "",
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  action?: EmptyAction;
  compact?: boolean;
  className?: string;
}) {
  const btn =
    "inline-block mt-4 font-sans text-[12px] font-medium px-4 py-2 border border-bk-border text-bk-heading hover:border-bk-gold-from";
  return (
    <div
      className={`flex flex-col items-center text-center ${compact ? "px-6 py-10" : "px-6 py-14"} ${className}`}
    >
      <div
        className={`${compact ? "w-12 h-12" : "w-14 h-14"} rounded-full bg-bk-surface border border-bk-border flex items-center justify-center text-bk-muted mb-4`}
        aria-hidden="true"
      >
        {icon}
      </div>
      <p className="font-sans font-bold text-[15px] text-bk-heading">{title}</p>
      {hint && <p className="font-sans text-[13px] text-bk-muted mt-1 max-w-xs">{hint}</p>}
      {action &&
        ("href" in action ? (
          <Link href={action.href} className={btn}>
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className={btn}>
            {action.label}
          </button>
        ))}
    </div>
  );
}

// Outline icons shared by empty states (24px, inherit text colour).
const svg = (d: string) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d={d} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const EmptyIcons = {
  bell: svg("M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6zM10 19a2 2 0 004 0"),
  check: svg("M5 12.5l4.5 4.5L19 7.5"),
  alert: svg("M12 8v5M12 16.5v.01M10.3 4l-8 14a2 2 0 001.7 3h16a2 2 0 001.7-3l-8-14a2 2 0 00-3.4 0z"),
};
