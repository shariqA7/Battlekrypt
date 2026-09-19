import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

const NAV_LINKS = [
  { label: "Games", href: "/games" },
  { label: "Live", href: "/live" },
  { label: "Tournaments", href: "/tournaments" },
  { label: "Organizers", href: "/organizers" },
  // "Rankings" intentionally omitted — the competitive rating system it
  // would show is Phase 6 scope and doesn't exist yet. Add it back once
  // that's built, rather than link to an empty/fake page now.
];

export default async function Nav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isOrganizer = false;
  let isAdmin = false;
  let displayName: string | null = null;

  if (user) {
    const [organizerProfile, userRecord] = await Promise.all([
      prisma.organizerProfile.findUnique({ where: { userId: user.id } }),
      prisma.user.findUnique({ where: { id: user.id } }),
    ]);
    isOrganizer = !!organizerProfile;
    isAdmin = !!userRecord?.isAdmin;
    displayName = userRecord?.displayName ?? null;
  }

  return (
    <nav className="bg-bk-bg-nav border-b border-bk-border-nav px-6 py-3.5 flex items-center justify-between">
      <div className="flex items-center gap-7">
        <Link href="/" className="text-bk-gold-light font-sans font-extrabold text-lg">
          BattleKrypt
        </Link>
        <div className="flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-bk-body font-sans font-medium text-[11px] tracking-[1.2px] uppercase hover:text-bk-heading"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/donate"
            className="text-bk-muted font-sans font-medium text-[11px] tracking-[1.2px] uppercase hover:text-bk-gold-light flex items-center gap-1"
          >
            Donate
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button aria-label="Search" className="text-bk-body">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        {!user ? (
          <>
            <Link href="/login" className="text-bk-heading font-sans text-[12px] font-medium">
              Login
            </Link>
            <Link
              href="/signup"
              className="bg-white text-bk-bg font-sans font-bold text-[12px] tracking-[0.8px] uppercase px-4 py-2"
            >
              Sign Up
            </Link>
          </>
        ) : (
          <>
            {isAdmin && (
              <Link href="/admin" className="text-bk-live font-sans text-[11px] uppercase tracking-[0.5px]">
                Admin
              </Link>
            )}
            {isOrganizer && (
              <Link href="/organizer/dashboard" className="text-bk-gold-light font-sans text-[11px] uppercase tracking-[0.5px]">
                Organizer
              </Link>
            )}
            <Link href="/dashboard" className="text-bk-heading font-sans text-[12px] font-medium">
              {displayName ?? "Dashboard"}
            </Link>

          </>
        )}
      </div>
    </nav>
  );
}
