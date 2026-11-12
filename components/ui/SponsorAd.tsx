"use client";

import { useEffect, useRef } from "react";

// A sponsor banner. It counts one view when at least half of it has scrolled into view, and its link
// goes through /api/ads/:id/click so the click is counted. rel="sponsored" tells search engines it's paid.
export default function SponsorAd({ id, imageUrl, altText, placement }: { id: string; imageUrl: string; altText: string; placement: string }) {
  const ref = useRef<HTMLElement>(null);
  const counted = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || counted.current) return;
    const send = () => {
      if (counted.current) return;
      counted.current = true;
      void fetch(`/api/ads/${id}/view`, { method: "POST", keepalive: true }).catch(() => undefined);
    };
    if (typeof IntersectionObserver === "undefined") return send();
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { send(); io.disconnect(); } }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [id]);

  return (
    <aside ref={ref} data-ad-placement={placement} aria-label="Advertisement" className="my-8">
      <p className="font-sans text-[10px] tracking-[1.2px] uppercase text-bk-muted mb-1.5">Sponsored</p>
      <a href={`/api/ads/${id}/click`} target="_blank" rel="sponsored noopener noreferrer" className="block border border-bk-border bg-bk-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={altText} loading="lazy" className="block w-full h-auto" />
      </a>
    </aside>
  );
}
