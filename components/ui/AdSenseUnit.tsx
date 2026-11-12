"use client";

import { useEffect } from "react";
import Script from "next/script";

declare global { interface Window { adsbygoogle?: unknown[] } }

// One Google AdSense unit (responsive). The Google script is loaded once; each unit then asks for an ad.
export default function AdSenseUnit({ clientId, slot, placement }: { clientId: string; slot: string; placement: string }) {
  useEffect(() => {
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* blocked by an ad blocker: show nothing */ }
  }, []);
  return (
    <aside data-ad-placement={placement} aria-label="Advertisement" className="my-8">
      <p className="font-sans text-[10px] tracking-[1.2px] uppercase text-bk-muted mb-1.5">Advertisement</p>
      <Script id="adsense-loader" async strategy="afterInteractive" crossOrigin="anonymous"
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`} />
      <ins className="adsbygoogle" style={{ display: "block" }} data-ad-client={clientId} data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true" />
    </aside>
  );
}
