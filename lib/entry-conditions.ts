// Pure data/helpers (no database imports) so client components can use them.
// An "entry condition" is a custom registration field of type "condition":
// the player must tick a box saying they did it (follow an account, share a
// post…). The organizer checks it when approving. Info fields stay type "text".

export interface RegistrationField {
  key: string;
  label: string;
  type: string; // "text" | "condition"
  required?: boolean;
  url?: string;
}

export function asFields(raw: unknown): RegistrationField[] {
  return Array.isArray(raw) ? (raw as RegistrationField[]) : [];
}

export function conditionsOf(raw: unknown): RegistrationField[] {
  return asFields(raw).filter((f) => f.type === "condition");
}

export function slugKey(label: string): string {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "condition";
}

// "Follow us on Instagram | https://instagram.com/x" per line -> condition fields.
export function parseConditionLines(text: string): { ok: true; fields: RegistrationField[] } | { ok: false; message: string } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length > 10) return { ok: false, message: "Up to 10 conditions." };
  const seen = new Set<string>();
  const fields: RegistrationField[] = [];
  for (const line of lines) {
    const [labelRaw, urlRaw] = line.split("|").map((x) => x.trim());
    if (!labelRaw || labelRaw.length > 80) return { ok: false, message: "Each condition needs a short description (max 80 characters)." };
    let url: string | undefined;
    if (urlRaw) {
      try {
        const u = new URL(urlRaw);
        if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
        url = u.toString();
      } catch {
        return { ok: false, message: `"${urlRaw}" isn't a valid link.` };
      }
    }
    let key = `cond_${slugKey(labelRaw)}`;
    while (seen.has(key)) key += "_2";
    seen.add(key);
    fields.push({ key, label: labelRaw, type: "condition", required: true, ...(url ? { url } : {}) });
  }
  return { ok: true, fields };
}

export function conditionsToLines(raw: unknown): string {
  return conditionsOf(raw).map((f) => (f.url ? `${f.label} | ${f.url}` : f.label)).join("\n");
}
