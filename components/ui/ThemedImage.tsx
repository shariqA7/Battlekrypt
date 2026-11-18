import type { Placeholder } from "@/lib/placeholders";

// An image shown on both themes. Priority:
//  1. `src` (and optional `srcLight`): a real URL. If both are given, CSS shows
//     `src` on the dark theme and `srcLight` on the light theme (see
//     .bk-logo-on-dark / .bk-logo-on-light). If only one is given it is used on both.
//  2. Otherwise one of the built-in placeholders, which have a dark and a light version.
export default function ThemedImage({
  src,
  srcLight,
  fallback,
  alt = "",
  className = "w-full h-full object-cover",
}: {
  src?: string | null;
  srcLight?: string | null;
  fallback: Placeholder;
  alt?: string;
  className?: string;
}) {
  if (src && srcLight) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className={`${className} bk-logo-on-dark`} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={srcLight} alt={alt} className={`${className} bk-logo-on-light`} />
      </>
    );
  }
  const single = src || srcLight;
  if (single) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={single} alt={alt} className={className} />;
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
