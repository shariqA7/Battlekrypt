import Link from "next/link";
import SiteLogo from "@/components/layout/SiteLogo";
import FeedbackLink from "@/components/layout/FeedbackLink";
import { getFeatureFlags } from "@/lib/services/feature-flags";

// Site footer in three columns: the brand, where to play, and how to get involved / get help.
// Only links to pages that exist. Feature-flagged pages (challenges, giveaways, donate) disappear
// when switched off. Support appears once NEXT_PUBLIC_SUPPORT_EMAIL is set (the same variable the
// ban screen uses).
type FooterLink = { label: string; href: string };

const PLAY: FooterLink[] = [
  { label: "Games", href: "/games" },
  { label: "Tournaments", href: "/tournaments" },
  { label: "Challenges", href: "/challenges" },
  { label: "Giveaways", href: "/giveaways" },
  { label: "Rankings", href: "/rankings" },
];

const COMMUNITY: FooterLink[] = [
  { label: "Organizers", href: "/organizers" },
  { label: "Host a tournament", href: "/organizer/register" },
  { label: "Register a club", href: "/club/register" },
  { label: "Donate", href: "/donate" },
];

export default async function Footer() {
  const flags = await getFeatureFlags();
  const support = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

  const enabled = (l: FooterLink) =>
    (l.href !== "/challenges" || flags.challenges) &&
    (l.href !== "/giveaways" || flags.giveaways) &&
    (l.href !== "/donate" || flags.donations);

  const linkClass =
    "inline-block py-1 font-sans font-medium text-[13px] text-bk-body hover:text-bk-gold-light transition-colors";
  const headingClass =
    "mb-3 font-sans font-bold text-[12px] uppercase tracking-[1.6px] text-bk-gold-light";

  return (
    <footer className="mt-16 bg-bk-bg-footer border-t border-bk-border">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 pt-12 pb-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8 lg:gap-16">
          {/* Column 1: brand */}
          <div className="flex flex-col items-start gap-4">
            <Link href="/" className="shrink-0 flex items-center" aria-label="BattleKrypt home">
              <SiteLogo heightClass="h-14 sm:h-16" className="font-sans font-extrabold text-2xl text-bk-gold-light" />
            </Link>
            <p className="max-w-[320px] font-sans text-[14px] leading-relaxed text-bk-muted">
              Tournaments, leagues, and daily scrims for competitive gaming. Compete, get paid, get verified.
            </p>
            <Link
              href="/tournaments"
              className="mt-1 inline-flex items-center gap-2 font-sans font-bold text-[12px] uppercase tracking-[1.4px] text-bk-gold-light hover:underline underline-offset-4"
            >
              Browse tournaments <span aria-hidden>→</span>
            </Link>
          </div>

          {/* Column 2: play */}
          <nav aria-label="Play">
            <h2 className={headingClass}>Play</h2>
            <ul className="flex flex-col">
              {PLAY.filter(enabled).map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={linkClass}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Column 3: community and help */}
          <nav aria-label="Community and help">
            <h2 className={headingClass}>Community &amp; help</h2>
            <ul className="flex flex-col">
              {COMMUNITY.filter(enabled).map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={linkClass}>
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <FeedbackLink className={linkClass}>Send feedback</FeedbackLink>
              </li>
              {support && (
                <li>
                  <a href={`mailto:${support}`} className={linkClass}>
                    Support
                  </a>
                </li>
              )}
            </ul>
          </nav>
        </div>

        <div className="mt-10 pt-6 border-t border-bk-border flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-sans text-[13px] text-bk-muted">
            © {new Date().getFullYear()} BattleKrypt. All rights reserved.
          </p>
          <nav aria-label="Legal" className="flex gap-6">
            <Link href="/terms" className="font-sans text-[13px] text-bk-muted hover:text-bk-gold-light transition-colors">
              Terms
            </Link>
            <Link href="/privacy" className="font-sans text-[13px] text-bk-muted hover:text-bk-gold-light transition-colors">
              Privacy
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
