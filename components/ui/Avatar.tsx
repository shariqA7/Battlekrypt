"use client";

import { useBranding } from "@/components/layout/BrandingProvider";
import ThemedImage from "@/components/ui/ThemedImage";
import { PLACEHOLDERS } from "@/lib/placeholders";

// A person's photo, else the admin-set default avatar, else the built-in gold silhouette.
export default function Avatar({ src, name, size = 32, className = "" }: { src?: string | null; name?: string; size?: number; className?: string }) {
  const { defaultAvatarUrl, defaultAvatarLightUrl } = useBranding();
  // A person's own photo is the same on both themes; the admin default can differ per theme.
  const image = src || defaultAvatarUrl;
  const imageLight = src ? null : defaultAvatarLightUrl;
  return (
    <span
      style={{ width: size, height: size }}
      className={`relative shrink-0 inline-flex items-center justify-center overflow-hidden rounded-full border border-bk-border bg-bk-bg text-bk-muted ${className}`}
    >
      <ThemedImage src={image} srcLight={imageLight} fallback={PLACEHOLDERS.avatar} alt={name ? `${name}'s photo` : ""} />
    </span>
  );
}
