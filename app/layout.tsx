import type { Metadata, Viewport } from "next";
import { getBranding } from "@/lib/services/branding";
import { previewMetadata } from "@/lib/link-preview";
import { getAdsenseSettings } from "@/lib/services/ads";
import { BrandingProvider } from "@/components/layout/BrandingProvider";
import SplashScreen from "@/components/layout/SplashScreen";
import Toaster from "@/components/ui/Toaster";
import "@fontsource/hanken-grotesk/latin-400.css";
import "@fontsource/hanken-grotesk/latin-500.css";
import "@fontsource/hanken-grotesk/latin-700.css";
import "@fontsource/hanken-grotesk/latin-800.css";
import "@fontsource/jetbrains-mono/latin-500.css";

import "./globals.css";
import { THEME_INIT_SCRIPT } from "@/components/layout/ThemeToggle";

const TITLE = "BattleKrypt";
const DESCRIPTION = "Tournaments, leagues, and daily scrims for competitive gaming.";

// Link preview for the platform itself: the share image from Admin > Settings > Branding, or the
// platform logo when no share image is uploaded. Pages with their own picture (tournaments,
// giveaways) override it; see lib/link-preview.ts.
export async function generateMetadata(): Promise<Metadata> {
  const [meta, ads] = await Promise.all([
    previewMetadata({ title: TITLE, description: DESCRIPTION }),
    getAdsenseSettings().catch(() => null),
  ]);
  // Lets Google AdSense confirm the site is yours (a meta tag only: it loads nothing and sets no cookies).
  return ads?.adsenseClientId ? { ...meta, other: { "google-adsense-account": ads.adsenseClientId } } : meta;
}

// viewport-fit=cover lets the page paint under the notch / home indicator so
// there are no off-colour bars, and globals.css then keeps content clear of
// those areas with env(safe-area-inset-*). themeColor tints the browser bar.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#16130B",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const branding = await getBranding();
  return (
    <html
      lang="en"
      className="h-full antialiased"
      // The theme attribute is set by the inline script below before first paint,
      // so the server-rendered <html> and the browser's legitimately differ.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-bk-bg text-bk-heading">
        <SplashScreen />
        <BrandingProvider branding={branding}>{children}</BrandingProvider>
        <Toaster />
      </body>
    </html>
  );
}
