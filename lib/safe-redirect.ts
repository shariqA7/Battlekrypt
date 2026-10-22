// Only same-site paths are allowed as a post-login destination. Without this,
// ?redirectTo=@evil.com becomes https://site.com@evil.com and sends people off-site.
export function safeRedirect(value: string | null | undefined, fallback = "/"): string {
  if (!value || typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\r\n]/.test(value)) {
    return fallback;
  }
  return value;
}
