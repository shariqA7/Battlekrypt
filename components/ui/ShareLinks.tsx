"use client";

import { useState } from "react";

// "Copy link" and one-tap share buttons (WhatsApp, Telegram, Facebook, X) for an event page.
// The link is built from the address the person is on, so it is always the live site.
// Link previews (the picture and title) come from the page's own metadata.
export default function ShareLinks({ path, title, className = "" }: { path: string; title: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const url = () => `${window.location.origin}${path}`;
  const text = `${title}`;

  async function copy() {
    const link = url();
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (some in-app browsers): show the link so it can be selected by hand.
      window.prompt("Copy this link", link);
    }
  }

  function open(build: (u: string, t: string) => string) {
    window.open(build(encodeURIComponent(url()), encodeURIComponent(text)), "_blank", "noopener,noreferrer");
  }

  const btn = "border border-bk-border text-bk-heading font-sans text-[12px] px-3 h-[34px] hover:border-bk-gold-light/60";
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mr-1">Share</span>
      <button type="button" onClick={copy} className={btn}>{copied ? "Link copied" : "Copy link"}</button>
      <button type="button" onClick={() => open((u, t) => `https://wa.me/?text=${t}%20${u}`)} className={btn}>WhatsApp</button>
      <button type="button" onClick={() => open((u, t) => `https://t.me/share/url?url=${u}&text=${t}`)} className={btn}>Telegram</button>
      <button type="button" onClick={() => open((u) => `https://www.facebook.com/sharer/sharer.php?u=${u}`)} className={btn}>Facebook</button>
      <button type="button" onClick={() => open((u, t) => `https://twitter.com/intent/tweet?url=${u}&text=${t}`)} className={btn}>X</button>
    </div>
  );
}
