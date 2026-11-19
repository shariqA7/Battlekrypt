"use client";

import { useState } from "react";
import Link from "next/link";
import { timeAgo } from "@/lib/time-ago";
import type { NotificationDTO } from "@/lib/services/notifications";

const ICON_PATH = {
  alert: "M12 8v5M12 16.5v.01M10.3 4l-8 14a2 2 0 001.7 3h16a2 2 0 001.7-3l-8-14a2 2 0 00-3.4 0z",
  money: "M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 2.8 4.5 3.3 4.5 1.6 4.5 3.2-2 3-4.5 3-4.5-1.3-4.5-3",
  gift: "M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7a3 3 0 10-3-3c0 1.7 1.3 3 3 3zm0 0a3 3 0 103-3c-1.7 0-3 1.3-3 3z",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  check: "M5 12.5l4.5 4.5L19 7.5",
  trophy: "M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM7 6H4a3 3 0 003 4M17 6h3a3 3 0 01-3 4",
  bell: "M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6zM10 19a2 2 0 004 0",
} as const;

// Colour follows meaning (same roles as the rest of the product): amber =
// needs attention, gold = money, teal = good / active, neutral = everything else.
const KIND: Record<string, { icon: keyof typeof ICON_PATH; tone: string }> = {
  payment_dispute: { icon: "alert", tone: "text-bk-amber bg-bk-amber/10" },
  challenge_removed: { icon: "alert", tone: "text-bk-amber bg-bk-amber/10" },
  invoice: { icon: "money", tone: "text-bk-gold-light bg-bk-gold-light/10" },
  giveaway: { icon: "gift", tone: "text-bk-teal bg-bk-teal/10" },
  tournament_changed: { icon: "calendar", tone: "text-bk-teal bg-bk-teal/10" },
  tournament_cancelled: { icon: "alert", tone: "text-bk-amber bg-bk-amber/10" },
  tournament_started: { icon: "calendar", tone: "text-bk-teal bg-bk-teal/10" },
  results_posted: { icon: "trophy", tone: "text-bk-gold-light bg-bk-gold-light/10" },
  entry_approved: { icon: "check", tone: "text-bk-teal bg-bk-teal/10" },
  entry_rejected: { icon: "alert", tone: "text-bk-amber bg-bk-amber/10" },
  penalty_issued: { icon: "alert", tone: "text-bk-amber bg-bk-amber/10" },
  account: { icon: "user", tone: "text-bk-body bg-bk-heading/[0.07]" },
};
const FALLBACK = { icon: "bell" as const, tone: "text-bk-body bg-bk-heading/[0.07]" };

export default function NotificationRow({
  n,
  onOpen,
}: {
  n: NotificationDTO;
  // Called when the person clicks the row: mark it read (the parent decides how).
  onOpen: (n: NotificationDTO) => void;
}) {
  const [now] = useState(() => Date.now());
  const unread = !n.readAt;
  const kind = KIND[n.type] ?? FALLBACK;
  const inner = (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${kind.tone}`} aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d={ICON_PATH[kind.icon]} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block font-sans text-[13px] leading-snug ${unread ? "text-bk-heading font-medium" : "text-bk-body"}`}>
          {n.title}
        </span>
        {n.body && (
          <span className="block font-sans text-[12px] text-bk-muted mt-0.5 line-clamp-2">{n.body}</span>
        )}
        <span className={`block font-mono text-[11px] mt-1 ${unread ? "text-bk-gold-light" : "text-bk-muted"}`}>
          {timeAgo(n.createdAt, now)}
        </span>
      </span>
      {unread && <span className="shrink-0 mt-2 w-2.5 h-2.5 rounded-full bg-bk-gold-light" aria-label="Unread" />}
    </div>
  );

  const cls = "block w-full text-left hover:bg-bk-heading/[0.05] focus-visible:bg-bk-heading/[0.05] outline-none";
  return n.href ? (
    <Link href={n.href} onClick={() => onOpen(n)} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={() => onOpen(n)} className={cls}>
      {inner}
    </button>
  );
}
