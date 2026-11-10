import type { Placeholder } from "@/lib/placeholders";

// An image that is either a real URL (shown as-is on both themes) or one of the
// built-in placeholders, which renders both theme versions and lets CSS show the
// one that matches the active theme (see .bk-logo-on-dark / .bk-logo-on-light).
export default function ThemedImage({
  src,
  fallback,
  alt = "",
  className = "w-full h-full object-cover",
}: {
  src?: string | null;
  fallback: Placeholder;
  alt?: string;
  className?: string;
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={className} />;
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={fallback.dark} alt={alt} className={`${className} bk-logo-on-dark`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={fallback.light} alt={alt} className={`${className} bk-logo-on-light`} />
    </>
  );
}
