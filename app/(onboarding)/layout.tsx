import { redirect } from "next/navigation";
import SiteLogo from "@/components/layout/SiteLogo";
import SessionBeacon from "@/components/analytics/SessionBeacon";
import { createClient } from "@/lib/supabase/server";
import { getActiveBan } from "@/lib/services/bans";
import { logout } from "@/lib/actions/auth";

// Onboarding sits outside the (main) group on purpose: no top navigation, footer or phone tab
// bar, so a new player only sees the steps in front of them. The header is just the logo (not a
// link, so it doesn't lead out of the flow) and a Sign out button as the one way to leave.
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
      <header className="h-16 shrink-0 border-b border-bk-border flex items-center justify-between px-5 sm:px-8">
        <span className="flex items-center">
          <SiteLogo heightClass="h-9" />
        </span>
        {user && (
          <form action={logout}>
            <button
              type="submit"
              className="font-sans text-[12px] font-bold uppercase tracking-[1.2px] text-bk-muted hover:text-bk-heading transition-colors"
            >
              Sign out
            </button>
          </form>
        )}
      </header>
      <div className="flex-1 flex flex-col">{children}</div>
    </>
  );
}
