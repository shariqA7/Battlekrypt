import Link from "next/link";
import { getFeatureFlags } from "@/lib/services/feature-flags";

// Site footer, from the design mockup: logo on the left, links in the middle,
// copyright on the right. Only links to pages that exist. Support appears once
// NEXT_PUBLIC_SUPPORT_EMAIL is set (the same variable the ban screen uses).
const LINKS = [
  { label: "Games", href: "/games" },
  { label: "Tournaments", href: "/tournaments" },
  { label: "Challenges", href: "/challenges" },
  { label: "Organizers", href: "/organizers" },
  { label: "Host a tournament", href: "/organizer/register" },
  { label: "Register a club", href: "/club/register" },
  { label: "Donate", href: "/donate" },
];

export default async function Footer() {
  const flags = await getFeatureFlags();
  const support = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  const linkClass =
    "font-sans font-medium text-[12px] uppercase tracking-[1.4px] text-bk-body hover:text-bk-gold-light transition-colors";
  return (
    <footer className="mt-16 bg-bk-bg-footer border-t border-bk-border">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 py-10 flex flex-col gap-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/" className="font-sans font-extrabold text-2xl text-bk-gold-light shrink-0">
            BattleKrypt
          </Link>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-7 gap-y-3 lg:justify-end">
            {LINKS.filter((l) => l.href !== "/challenges" || flags.challenges).map((l) => (
              <Link key={l.href} href={l.href} className={linkClass}>
                {l.label}
              </Link>
            ))}
            {support && (
              <a href={`mailto:${support}`} className={linkClass}>
                Support
              </a>
            )}
          </nav>
        </div>
        <p className="pt-6 border-t border-bk-border font-sans text-[13px] text-bk-muted">
          © {new Date().getFullYear()} BattleKrypt. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
