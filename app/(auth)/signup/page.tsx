import { Suspense } from "react";
import { getSiteSettings, listCarouselSlides } from "@/lib/services/tournaments";
import AuthPageContent from "@/components/auth/AuthPageContent";

// See app/(auth)/login/page.tsx for why this is needed.
export const dynamic = "force-dynamic";
import AuthCarousel from "@/components/auth/AuthCarousel";
import AuthStageRail from "@/components/auth/AuthStageRail";
import Link from "next/link";

export default async function SignupPage() {
  const [settings, slides] = await Promise.all([getSiteSettings(), listCarouselSlides()]);

  return (
    <main className="flex-1 flex min-h-0">
      <div className="flex-1 flex flex-col px-6 py-10 md:px-14">
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

        <div className="flex-1 flex flex-col items-center justify-center">
          <AuthStageRail step={1} />
          <Suspense fallback={null}>
            <AuthPageContent mode="signup" />
          </Suspense>
        </div>
      </div>
      <AuthCarousel slides={slides} />
    </main>
  );
}
