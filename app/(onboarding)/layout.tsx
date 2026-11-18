import { redirect } from "next/navigation";
import SiteLogo from "@/components/layout/SiteLogo";
import SessionBeacon from "@/components/analytics/SessionBeacon";
import { createClient } from "@/lib/supabase/server";
import { getActiveBan } from "@/lib/services/bans";
import { logout } from "@/lib/actions/auth";

// Onboarding sits outside the (main) group on purpose: no top navigation, footer or phone tab
// bar, so a new player only sees the steps in front of them. The logo is centred above the card
// (not a link, so it doesn't lead out of the flow) and Sign out sits quietly under it as the one
// way to leave.
//
// A banned account is sent to "/", where the main layout shows the ban notice.
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && (await getActiveBan(user.id))) redirect("/");

  return (
    <>
      <SessionBeacon />
      <header className="shrink-0 flex justify-center px-4 sm:px-6 pt-8 sm:pt-10">
        <span className="flex items-center">
          <SiteLogo heightClass="h-14 sm:h-16" className="font-sans font-extrabold text-3xl text-bk-gold-light" />
        </span>
      </header>
      <div className="flex-1 flex flex-col">{children}</div>
      {user && (
        <form action={logout} className="shrink-0 flex justify-center pb-8">
          <button
            type="submit"
            className="font-sans text-[12px] font-bold uppercase tracking-[1.2px] text-bk-muted hover:text-bk-heading transition-colors py-2 px-3"
          >
            Sign out
          </button>
        </form>
      )}
    </>
  );
}
