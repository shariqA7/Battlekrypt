"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/approvals", label: "Approvals", badgeKey: "approvals" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/institutions", label: "Institutions" },
  { href: "/admin/currencies", label: "Currencies" },
  { href: "/admin/organizations", label: "Organizations" },
  { href: "/admin/clubs", label: "Clubs" },
  { href: "/admin/plans", label: "Plans" },
  { href: "/admin/featured", label: "Featured" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/traffic", label: "Traffic" },
  { href: "/admin/settings", label: "Settings" },
] as const;

export default function AdminNav({ pending }: { pending: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections" className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible -mx-5 px-5 sm:mx-0 sm:px-0 pb-1 md:pb-0">
      {ITEMS.map((item) => {
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center justify-between gap-3 px-3 min-h-[40px] md:min-h-[36px] font-sans text-[13px] whitespace-nowrap border-b-2 md:border-b-0 md:border-l-2 ${
              active ? "bg-bk-surface text-bk-gold-light font-bold border-bk-gold-light" : "text-bk-muted hover:text-bk-heading hover:bg-bk-surface-hover border-transparent"
            }`}
          >
            {item.label}
            {"badgeKey" in item && pending > 0 && (
              <span className="bg-bk-live text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] text-center font-mono">
                {pending}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
