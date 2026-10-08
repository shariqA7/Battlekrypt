import type { Metadata, Viewport } from "next";
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

export const metadata: Metadata = {
  title: "BattleKrypt",
  description: "Tournaments, leagues, and daily scrims for competitive gaming.",
};

// viewport-fit=cover lets the page paint under the notch / home indicator so
// there are no off-colour bars, and globals.css then keeps content clear of
// those areas with env(safe-area-inset-*). themeColor tints the browser bar.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#16130B",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
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

        {children}
      </body>
    </html>
  );
}
