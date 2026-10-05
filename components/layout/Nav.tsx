import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import UserMenu from "@/components/layout/UserMenu";

const NAV_LINKS = [
  { label: "Games", href: "/games" },
  { label: "Live", href: "/live" },
  { label: "Tournaments", href: "/tournaments" },
  { label: "Challenges", href: "/challenges" },
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
  let isClub = false;
  let isAdmin = false;
  let orgApplicationStatus: "pending" | "rejected" | null = null;
  let unreadNotifications = 0;
  let displayName: string | null = null;
  let avatarUrl: string | null = null;
  let email = "";

  if (user) {
    const [organizerProfile, clubProfile, userRecord, orgApplication] = await Promise.all([
      prisma.organizerProfile.findUnique({ where: { userId: user.id } }),
      prisma.clubProfile.findUnique({ where: { userId: user.id } }),
      prisma.user.findUnique({ where: { id: user.id } }),
      prisma.organizationApplication.findUnique({
        where: { userId: user.id },
        select: { status: true },
      }),
    ]);
    unreadNotifications = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
    if (orgApplication && orgApplication.status !== "approved") {
      orgApplicationStatus = orgApplication.status;
    }
    isOrganizer = !!organizerProfile;
    isClub = !!clubProfile;
    isAdmin = !!userRecord?.isAdmin;
    displayName = userRecord?.displayName ?? null;
    avatarUrl = userRecord?.avatarUrl ?? null;
    email = user.email ?? userRecord?.email ?? "";
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
            <Link
              href="/organizer/register"
              className="text-bk-gold-light font-sans text-[11px] font-medium tracking-[0.6px] uppercase"
            >
              Register as an organization
            </Link>
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
          <Link href="/notifications" aria-label="Notifications" className="relative text-bk-body hover:text-bk-heading">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6zM10 19a2 2 0 004 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {unreadNotifications > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-bk-live text-white text-[9px] font-bold rounded-full px-1 min-w-[15px] text-center">
                {unreadNotifications > 9 ? "9+" : unreadNotifications}
              </span>
            )}
          </Link>
          <UserMenu
            displayName={displayName ?? "Player"}
            email={email}
            avatarUrl={avatarUrl}
            isAdmin={isAdmin}
            isOrganizer={isOrganizer}
            isClub={isClub}
            orgApplicationStatus={orgApplicationStatus}
          />
          </>
        )}
      </div>
    </nav>
  );
}