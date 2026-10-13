// Square tile with 1-2 initials (logo/avatar fallback). Gold-tinted so it works
// on both themes; `round` is for people, square for organizations and games.
export default function InitialTile({
  name,
  size = 44,
  round = false,
  src,
}: {
  name: string;
  size?: number;
  round?: boolean;
  src?: string | null;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      className={`shrink-0 overflow-hidden flex items-center justify-center bg-bk-gold-from/15 border border-bk-gold-from/40 text-bk-gold-light font-sans font-bold ${round ? "rounded-full" : ""}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="w-full h-full object-cover" />
      ) : (
        initials || "?"
      )}
    </div>
  );
}
