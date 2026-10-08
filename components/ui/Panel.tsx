import type { ReactNode } from "react";

// A bordered surface card, and the gold-bar section heading used above groups
// of cards in the mockup ("Tournament Stages", "Rules & Conduct").

export function Panel({ children, className = "", as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" }) {
  return <Tag className={`bg-bk-surface border border-bk-border ${className}`}>{children}</Tag>;
}

export function SectionHeading({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`border-l-[3px] border-bk-gold-from pl-4 font-sans font-bold text-[22px] sm:text-[26px] leading-tight text-bk-heading ${className}`}>
      {children}
    </h2>
  );
}

// Small uppercase label ("TOTAL PRIZE POOL", "PRIZE DISTRIBUTION").
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`font-sans font-bold text-[11px] uppercase tracking-[1.6px] text-bk-body ${className}`}>{children}</p>
  );
}
