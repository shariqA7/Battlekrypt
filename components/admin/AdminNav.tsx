"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/approvals", label: "Approvals", badgeKey: "approvals" },
  { href: "/admin/users", label: "Users" },
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
    <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
      {ITEMS.map((item) => {
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center justify-between gap-3 px-3 py-2 font-sans text-[13px] whitespace-nowrap ${
              active ? "bg-bk-surface text-bk-heading border-l-2 border-bk-gold-light" : "text-bk-muted hover:text-bk-heading border-l-2 border-transparent"
            }`}
          >
            {item.label}
            {"badgeKey" in item && pending > 0 && (
              <span className="bg-bk-live text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] text-center">
                {pending}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
