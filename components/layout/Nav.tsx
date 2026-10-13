import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import UserMenu from "@/components/layout/UserMenu";
import MobileMenu from "@/components/layout/MobileMenu";
import ThemeToggle from "@/components/layout/ThemeToggle";
import NavLinks from "@/components/layout/NavLinks";
import SearchBox from "@/components/layout/SearchBox";
import { buttonClass } from "@/components/ui/Button";

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
    // nav-safe: clears the notch and runs edge to edge in landscape (globals.css).
    // The full bar (inline search + five links + buttons) needs ~1200px, so
    // anything narrower than xl gets the menu button and drawer instead.
    <nav className="nav-safe bg-bk-bg-nav border-b border-bk-border-nav">
      <div className="max-w-[1400px] mx-auto h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-8 min-w-0">
          <Link href="/" className="text-bk-gold-light font-sans font-extrabold text-[22px] sm:text-2xl tracking-tight shrink-0">
            BattleKrypt
          </Link>
          <SearchBox className="hidden xl:block w-64" />
        </div>

        <div className="hidden xl:block">
          <NavLinks links={NAV_LINKS} />
        </div>

        {/* Phones and tablets: signed-in people keep their avatar menu in the bar;
            the menu button holds the links and search. */}
        <div className="flex items-center gap-1 xl:hidden">
          <ThemeToggle />
          {user && (
            <UserMenu
              displayName={displayName ?? "Player"}
              email={email}
              avatarUrl={avatarUrl}
              isAdmin={isAdmin}
              isOrganizer={isOrganizer}
              isClub={isClub}
              orgApplicationStatus={orgApplicationStatus}
            />
          )}
          <MobileMenu links={NAV_LINKS} signedIn={!!user} />
        </div>

        <div className="hidden xl:flex items-center gap-3">
          <ThemeToggle />
          {!user ? (
            <>
              <Link href="/login" className={buttonClass("outline", "md")}>
                Login
              </Link>
              <Link href="/signup" className={buttonClass("primary", "md")}>
                Sign up
              </Link>
            </>
          ) : (
            <>
              <Link href="/notifications" aria-label="Notifications" className="relative text-bk-body hover:text-bk-heading px-1">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6zM10 19a2 2 0 004 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-bk-live text-white text-[9px] font-bold rounded-full px-1 min-w-[15px] text-center">
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
      </div>
    </nav>
  );
}
