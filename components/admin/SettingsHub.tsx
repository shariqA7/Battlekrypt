"use client";

// The Settings landing page: every setting as a card, grouped, with a search box.
import Link from "next/link";
import { useState } from "react";
import type { SettingsGroup } from "./settingsNav";
import { AdminIcon, ChevronRight, SearchIcon } from "./AdminIcons";

export default function SettingsHub({ groups }: { groups: SettingsGroup[] }) {
  const [query, setQuery] = useState("");
  // Every word typed must appear somewhere in the card's title, description,
  // group or hidden keywords ("bank account" finds Billing, "fee club" finds Clubs).
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => {
        const haystack = `${i.label} ${i.description} ${g.label} ${i.keywords}`.toLowerCase();
        return words.every((w) => haystack.includes(w));
      }),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-sans font-bold text-xl text-bk-heading">All settings</h1>
          <p className="font-sans text-[13px] text-bk-body mt-1">Manage and customize how BattleKrypt is set up.</p>
        </div>
        <label className="relative block w-full sm:w-72">
          <span className="sr-only">Search settings</span>
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-bk-muted pointer-events-none">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search settings"
            className="w-full min-h-[44px] rounded-xl border border-bk-border bg-bk-surface pl-9 pr-3 font-sans text-[13px] text-bk-heading placeholder:text-bk-muted focus:outline-none focus:border-bk-gold-light/60"
          />
        </label>
      </div>

      {shown.length === 0 && (
        <p className="font-sans text-[13px] text-bk-muted">No settings match “{query.trim()}”.</p>
      )}

      {shown.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h2 className="font-sans font-medium text-[15px] text-bk-body mb-3">{group.label}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.items.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  className="group flex items-center gap-4 min-h-[88px] h-full rounded-xl border border-bk-border bg-bk-surface p-4 transition-colors hover:border-bk-gold-light/50 hover:bg-bk-surface-hover"
                >
                  <span className="grid place-items-center w-10 h-10 shrink-0 rounded-lg bg-bk-gold-light/10 text-bk-gold-light">
                    <AdminIcon name={i.icon} size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-sans font-bold text-[15px] text-bk-heading">{i.label}</span>
                    <span className="block font-sans text-[12.5px] leading-snug text-bk-muted mt-0.5">{i.description}</span>
                  </span>
                  <span className="shrink-0 text-bk-faint transition-colors group-hover:text-bk-gold-light">
                    <ChevronRight size={16} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
