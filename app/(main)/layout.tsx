import Nav from "@/components/layout/Nav";
import BannedScreen from "@/components/layout/BannedScreen";
import SessionBeacon from "@/components/analytics/SessionBeacon";
import { createClient } from "@/lib/supabase/server";
import { getActiveBan } from "@/lib/services/bans";

// Every route except (auth) lives under this group, so Nav shows
// everywhere except the login/signup pages — which want a fully
// immersive, nav-free split-screen layout instead.
//
// A banned account can reach login (that group is outside this layout) and
// then sees only the ban notice here, with the nav still available to sign out.
export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ban = user ? await getActiveBan(user.id) : null;

  return (
    <>
      <SessionBeacon />
      <Nav />
      {ban ? (
        <BannedScreen
          reason={ban.reason}
          endsAt={ban.endsAt}
          supportEmail={process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? null}
        />
      ) : (
        children
      )}
    </>
  );
}
