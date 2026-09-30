// A single ad slot. Renders nothing for ad-free (paid) accounts, and nothing
// at all while ads are switched off in the admin panel (the default).
//
// No ad network is wired in yet, so an enabled slot renders a labelled
// placeholder box. To plug in a real network later, replace the placeholder
// below — the who-sees-ads logic (lib/ads.ts) and the placement whitelist
// stay as they are.
//
// Never place this on a room ID/password reveal or a payment screen.

import { shouldShowAds, type AdPlacement } from "@/lib/ads";

export default async function AdSlot({ placement }: { placement: AdPlacement }) {
  if (!(await shouldShowAds())) return null;

  return (
    <aside
      data-ad-placement={placement}
      aria-label="Advertisement"
      className="my-8 border border-dashed border-bk-border bg-bk-surface px-4 py-6 text-center"
    >
      <p className="font-sans text-[10px] tracking-[1.2px] uppercase text-bk-muted">
        Advertisement
      </p>
    </aside>
  );
}
