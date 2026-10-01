// Pure data (no database imports) so client components can use it too.
export const PAYMENT_KINDS = [
  { value: "club_upgrade", label: "Paid club plan" },
  { value: "org_plan", label: "Organization plan" },
  { value: "player_plan", label: "Player plan" },
  { value: "other", label: "Other" },
] as const;
