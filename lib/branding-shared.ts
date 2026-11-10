// Client-safe branding types and constants. No server-only imports here.
export const BRANDING_KEYS = [
    "logoUrl",
    "logoLightUrl",
    "shareImageUrl",
    "defaultBannerUrl",
    "defaultAvatarUrl",
    "defaultOrgLogoUrl",
    "defaultClubLogoUrl",
] as const;

export type BrandingKey = (typeof BRANDING_KEYS)[number];
export type Branding = Record<BrandingKey, string | null>;

export const EMPTY_BRANDING: Branding = {
    logoUrl: null,
    logoLightUrl: null,
    shareImageUrl: null,
    defaultBannerUrl: null,
    defaultAvatarUrl: null,
    defaultOrgLogoUrl: null,
    defaultClubLogoUrl: null,
};