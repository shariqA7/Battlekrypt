// Branded loading screen, shown on every FULL page load (first visit, refresh,
// hard navigation) and not on in-app link clicks. It is plain server-rendered
// HTML so it paints before any JavaScript runs; <SplashHider /> fades it out
// once the page is interactive. The artwork is the designer's symbol in
// /public/brand/symbol.png (a committed file: it rarely changes).
import SplashHider from "@/components/layout/SplashHider";

export default function SplashScreen() {
  return (
    <>
      <div id="bk-splash" role="status" aria-live="polite" aria-label="Loading BattleKrypt">
        <div className="bk-splash-mark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/symbol.png" alt="" width={480} height={402} fetchPriority="high" decoding="sync" className="bk-splash-symbol" />
          {/* Two thin orbits echo the rings in the symbol; a bright arc travels along each. */}
          <svg className="bk-splash-orbits" viewBox="0 0 200 200" aria-hidden="true">
            <defs>
              <linearGradient id="bk-orbit-gold" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#F4C842" />
                <stop offset="1" stopColor="#B8860B" />
              </linearGradient>
            </defs>
            <g transform="rotate(-22 100 100)">
              <ellipse className="bk-orbit bk-orbit-a" cx="100" cy="100" rx="94" ry="40" pathLength="100" />
              <ellipse className="bk-orbit bk-orbit-b" cx="100" cy="100" rx="82" ry="30" pathLength="100" />
            </g>
          </svg>
        </div>
        <div className="bk-splash-bar" aria-hidden="true">
          <span />
        </div>
      </div>
      {/* Without JavaScript nothing could ever hide the overlay, so never show it. */}
      <noscript>
        <style>{"#bk-splash{display:none!important}"}</style>
      </noscript>
      <SplashHider />
    </>
  );
}
