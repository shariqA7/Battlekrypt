// "Falcon Esports!" and "falcon  esports" both become "falconesports", so
// names that differ only by case, spacing or punctuation count as the same.
export function orgNameKey(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
}
