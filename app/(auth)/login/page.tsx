import { Suspense } from "react";
import { getSiteSettings, listCarouselSlides } from "@/lib/services/tournaments";
import AuthPageContent from "@/components/auth/AuthPageContent";

// This page's data (site branding, carousel slides) is admin-editable and
// meant to reflect live at all times. Without this, Next.js tries to
// statically prerender it at *build* time, which runs a real DB query
// during the Vercel build — where DATABASE_URL isn't guaranteed to be
// reachable/valid — and also would bake in stale content until the next
// deploy.
export const dynamic = "force-dynamic";
import AuthCarousel from "@/components/auth/AuthCarousel";
import AuthStageRail from "@/components/auth/AuthStageRail";
import Link from "next/link";

export default async function LoginPage() {
  const [settings, slides] = await Promise.all([getSiteSettings(), listCarouselSlides()]);

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

        <div className="flex-1 flex flex-col items-center justify-center">
          <AuthStageRail step={1} />
          <Suspense fallback={null}>
            <AuthPageContent mode="login" />
          </Suspense>
        </div>
      </div>
      <AuthCarousel slides={slides} />
    </main>
  );
}
