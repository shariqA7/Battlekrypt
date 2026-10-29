// A person's photo, or a plain user silhouette when they have none.
export default function Avatar({ src, name, size = 32, className = "" }: { src?: string | null; name?: string; size?: number; className?: string }) {
  return (
    <span
      style={{ width: size, height: size }}
      className={`relative shrink-0 inline-flex items-center justify-center overflow-hidden rounded-full border border-bk-border bg-bk-bg text-bk-muted ${className}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name ? `${name}'s photo` : ""} className="w-full h-full object-cover" />
      ) : (
        <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="8.5" r="3.6" stroke="currentColor" strokeWidth="1.8" />
          <path d="M4.5 20c.9-3.6 3.9-5.5 7.5-5.5s6.6 1.9 7.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}
