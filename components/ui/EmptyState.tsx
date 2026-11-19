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
  search: svg("M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3"),
  trophy: svg("M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM7 6H4a3 3 0 003 4M17 6h3a3 3 0 01-3 4"),
  calendar: svg("M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"),
  users: svg("M9 11a4 4 0 100-8 4 4 0 000 8zM2 21a7 7 0 0114 0M17 4a4 4 0 010 7.5M19 21a7 7 0 00-3-5.7"),
  gift: svg("M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7a3 3 0 10-3-3c0 1.7 1.3 3 3 3zm0 0a3 3 0 103-3c-1.7 0-3 1.3-3 3z"),
  document: svg("M7 3h8l5 5v13H7zM14 3v6h6M10 13h7M10 17h7"),
  bolt: svg("M13 2L4 14h7l-1 8 9-12h-7z"),
  building: svg("M4 21V5l8-2 8 2v16M4 21h16M9 9h2M13 9h2M9 13h2M13 13h2M10 21v-4h4v4"),
  receipt: svg("M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"),
  flag: svg("M5 21V4M5 4h11l-2 4 2 4H5"),
  shield: svg("M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"),
  alert: svg("M12 8v5M12 16.5v.01M10.3 4l-8 14a2 2 0 001.7 3h16a2 2 0 001.7-3l-8-14a2 2 0 00-3.4 0z"),
};
