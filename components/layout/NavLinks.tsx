"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavLink {
  label: string;
  href: string;
}

// The centered desktop links from the design mockup: normal-case text, with the
// current section in gold and underlined by a gold bar.
export default function NavLinks({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-8">
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`font-sans font-medium text-[15px] pb-1 border-b-2 transition-colors ${
              active
                ? "text-bk-gold-light border-bk-gold-from"
                : "text-bk-body border-transparent hover:text-bk-heading"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
