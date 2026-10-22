import { Suspense } from "react";
import { getSiteSettings, listCarouselSlides } from "@/lib/services/tournaments";
import SignupForm from "@/components/auth/SignupForm";
import { getLoginOptions } from "@/lib/services/login-options";

// See app/(auth)/login/page.tsx for why this is needed.
export const dynamic = "force-dynamic";
import AuthCarousel from "@/components/auth/AuthCarousel";
import Link from "next/link";

export default async function SignupPage() {
  const [settings, slides, options] = await Promise.all([getSiteSettings(), listCarouselSlides(), getLoginOptions()]);

  return (
    <main className="flex-1 flex min-h-0 gap-6 p-6">
      <div className="flex-1 flex flex-col md:px-8">
        <Link href="/" className="inline-block w-fit">
          {settings.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.logoUrl} alt="BattleKrypt" className="h-7 object-contain" />
          ) : (
            <span className="text-bk-gold-light font-sans font-extrabold text-base tracking-wide">
              BATTLEKRYPT
            </span>
          )}
        </Link>

        <div className="flex-1 flex flex-col items-center justify-start md:justify-center py-6">
          <Suspense fallback={null}>
            <SignupForm twitchEnabled={options.twitch} />
          </Suspense>
        </div>
      </div>
      <AuthCarousel slides={slides} />
    </main>
  );
}
