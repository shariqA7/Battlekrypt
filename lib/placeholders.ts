// Built-in placeholder artwork (committed files in /public/placeholders), one
// version per theme. Shown whenever someone has not uploaded their own image AND
// the admin has not set a replacement in Admin > Settings > Branding.
export const PLACEHOLDERS = {
  avatar: { dark: "/placeholders/avatar.svg", light: "/placeholders/avatar-light.svg" },
  club: { dark: "/placeholders/club.svg", light: "/placeholders/club-light.svg" },
  org: { dark: "/placeholders/organization.svg", light: "/placeholders/organization-light.svg" },
} as const;

export type Placeholder = (typeof PLACEHOLDERS)[keyof typeof PLACEHOLDERS];
