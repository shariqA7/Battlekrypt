import type { Metadata, Viewport } from "next";
import { getBranding } from "@/lib/services/branding";
import { BrandingProvider } from "@/components/layout/BrandingProvider";
import SplashScreen from "@/components/layout/SplashScreen";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";

import "./globals.css";
import { THEME_INIT_SCRIPT } from "@/components/layout/ThemeToggle";

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["500"],
});

const TITLE = "BattleKrypt";
const DESCRIPTION = "Tournaments, leagues, and daily scrims for competitive gaming.";

// The default link-preview image (1200x630) is uploaded in Admin > Settings >
// Branding. A page that sets its own openGraph images overrides it.
export async function generateMetadata(): Promise<Metadata> {
  const { shareImageUrl } = await getBranding();
  const images = shareImageUrl ? [{ url: shareImageUrl, width: 1200, height: 630 }] : undefined;
  return {
    title: TITLE,
    description: DESCRIPTION,
    openGraph: { title: TITLE, description: DESCRIPTION, siteName: TITLE, type: "website", images },
    twitter: { card: images ? "summary_large_image" : "summary", title: TITLE, description: DESCRIPTION, images: shareImageUrl ? [shareImageUrl] : undefined },
  };
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
      className={`${hankenGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
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
      </body>
    </html>
  );
}
