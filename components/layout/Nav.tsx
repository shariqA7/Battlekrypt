import { getFeatureFlags } from "@/lib/services/feature-flags";
import Link from "next/link";
import SiteLogo from "@/components/layout/SiteLogo";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import UserMenu from "@/components/layout/UserMenu";
import MobileMenu from "@/components/layout/MobileMenu";
import ThemeToggle from "@/components/layout/ThemeToggle";
import NavLinks from "@/components/layout/NavLinks";
import NotificationBell, { NotificationBellLink } from "@/components/notifications/NotificationBell";
import { buildNav } from "@/components/layout/nav-config";
import NavFrame from "@/components/layout/NavFrame";
import { buttonClass } from "@/components/ui/Button";

export default async function Nav() {
  const featureFlags = await getFeatureFlags();
  const items = buildNav({ challenges: featureFlags.challenges, giveaways: featureFlags.giveaways });
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
    // The full bar (logo + links + buttons) needs ~1200px, so
    // anything narrower than xl gets the menu button and drawer instead.
    <nav className="nav-safe bg-bk-bg-nav border-b border-bk-border-nav">
      <NavFrame>
        <div className="flex items-center min-w-0">
          <Link href="/" className="shrink-0 flex items-center" aria-label="BattleKrypt home">
            <SiteLogo heightClass="h-10 sm:h-12" className="text-bk-gold-light font-sans font-extrabold text-[22px] sm:text-2xl tracking-tight" />
          </Link>
        </div>

        <div className="hidden xl:block">
          <NavLinks items={items} />
        </div>

        {/* Phones and tablets: signed-in people keep their avatar menu in the bar;
            the menu button holds the links. */}
        <div className="flex items-center gap-1 xl:hidden">
          <ThemeToggle />
          {user && <NotificationBellLink initialUnread={unreadNotifications} />}
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
          <MobileMenu items={items} signedIn={!!user} />
        </div>

        <div className="hidden xl:flex items-center gap-3 xl:justify-self-end">
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
              <NotificationBell initialUnread={unreadNotifications} />
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
      </NavFrame>
    </nav>
  );
}
