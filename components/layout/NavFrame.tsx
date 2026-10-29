"use client";

import { usePathname } from "next/navigation";

// The inner row of the top bar. Two things it fixes:
//  - On /admin the page is full-bleed (sidebar against the left edge, content to
//    the right edge), so the bar must be full width too or the logo and the avatar
//    sit in a narrower column and never line up with the sidebar and the page.
//  - From xl up the three groups sit in a 1fr / auto / 1fr grid, so the links are
//    truly centered however wide the search box or the buttons are.
export default function NavFrame({ children }: { children: React.ReactNode }) {
  const wide = (usePathname() ?? "").startsWith("/admin");
  return (
    <div
      className={`${wide ? "w-full" : "max-w-[1400px] mx-auto"} h-16 flex items-center justify-between gap-4 xl:grid xl:grid-cols-[1fr_auto_1fr]`}
    >
      {children}
    </div>
  );
}
