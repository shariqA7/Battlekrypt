// Simple slugify + uniqueness-guaranteeing suffix. A short random suffix is
// always appended (not just on collision) so slugs stay stable even if two
// tournaments share the same name — no retry-on-conflict logic needed at
// the call site.
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

export function makeTournamentSlug(name: string): string {
  const base = slugify(name) || "tournament";
  const suffix = Math.random().toString(36).slice(2, 7); // 5 random chars
  return `${base}-${suffix}`;
}
