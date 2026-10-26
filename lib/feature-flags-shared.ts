// Pure data (no database imports) so client components can use it too.
export interface FeatureFlags {
  deposit: boolean;
  organizerTrust: boolean;
  tournamentLock: boolean;
  prizeBreakdown: boolean;
  specialAwards: boolean;
  entryConditions: boolean;
  challenges: boolean;
  guardianConsent: boolean;
}

export type FeatureKey = keyof FeatureFlags;

export const FEATURE_ROWS: { key: FeatureKey; label: string; on: string; off: string; warning?: string }[] = [
  {
    key: "organizerTrust",
    label: "Organizer trust",
    on: "New organizers have starter limits on paid and prized events, and organizers with unsettled prize payouts can't host new ones.",
    off: "No starter limits and no payout hold when creating or publishing events. Winner confirmations and the admin queue still work.",
  },
  {
    key: "tournamentLock",
    label: "Tournament lock",
    on: "Once a paid or prized event has a registered player, its prize pool, cancellation and rules are locked; changes go to an admin as change requests.",
    off: "New events can be edited and cancelled freely, as before. Events that are already locked stay locked.",
  },
  {
    key: "prizeBreakdown",
    label: "Prize breakdown required",
    on: "A prize pool must be fully assigned (places plus cash awards equal the pool) before an event is created, edited or published.",
    off: "A prize pool only has to be at least what the places add up to.",
  },
  {
    key: "specialAwards",
    label: "Special awards",
    on: "Organizers can add awards like Final MVP, pick winners after the event, and winners confirm their payouts.",
    off: "Organizers can't add new awards. Events that already have awards keep them.",
  },
  {
    key: "entryConditions",
    label: "Entry conditions",
    on: "Organizers can require players to follow, share, etc. before registering.",
    off: "Organizers can't add new conditions. Events that already have conditions keep enforcing them.",
  },
  {
    key: "challenges",
    label: "Challenges",
    on: "Players and organizers can browse and create challenges.",
    off: "The challenges list and 'create' pages are hidden and no new challenge can be created. Challenges already open or in progress keep working for the people involved.",
  },
  {
    key: "guardianConsent",
    label: "Guardian consent (under 18)",
    on: "Players under 18 need a guardian's approval before joining organizers' events that require it, and guardians' payout details are needed for cash prizes.",
    off: "Nobody is asked for guardian consent. Consents already given stay on record.",
    warning:
      "Turning this off lets under-18 players join and win prizes without a guardian's approval. Check the law where you operate first.",
  },
];
