// The ways an organization can pay an invoice, each with its own on/off switch. Pure.
//
//   manual     bank, wallet or crypto-address methods + uploading a screenshot, then an admin marks it paid
//   nowpayments online crypto checkout (USD invoices); marks the invoice paid by itself
//
// Add a channel here (e.g. "safepay" for PKR cards and wallets) and it gets its own switch.
export type ChannelKey = "manual" | "nowpayments";

export interface ChannelDef {
  key: ChannelKey;
  label: string;
  description: string;
  kind: "manual" | "gateway";
  defaultEnabled: boolean;
  /** Invoice currencies it can take. null = any. */
  currencies: readonly string[] | null;
}

export const CHANNELS: readonly ChannelDef[] = [
  {
    key: "manual",
    label: "Manual payments",
    description: "Bank, wallet or crypto-address methods (listed below), then the organization uploads a screenshot and you mark the invoice paid.",
    kind: "manual",
    defaultEnabled: true,
    currencies: null,
  },
  {
    key: "nowpayments",
    label: "NOWPayments (crypto, online)",
    description: "A “Pay online with crypto” button on USD invoices. The invoice is marked paid automatically when the payment completes.",
    kind: "gateway",
    defaultEnabled: false,
    currencies: ["USD"],
  },
];

export const isChannelKey = (k: unknown): k is ChannelKey => CHANNELS.some((c) => c.key === k);
export const channelDef = (k: ChannelKey) => CHANNELS.find((c) => c.key === k)!;

export type ChannelStates = Record<ChannelKey, boolean>;

export function resolveStates(rows: { key: string; enabled: boolean }[]): ChannelStates {
  const out = {} as ChannelStates;
  for (const c of CHANNELS) out[c.key] = rows.find((r) => r.key === c.key)?.enabled ?? c.defaultEnabled;
  return out;
}

// Would switching this channel to `enabled` leave no way at all to pay a new invoice? A channel only
// counts if it can really take payments (a gateway also needs its keys set).
export function leavesNoWayToPay(states: ChannelStates, usable: Record<ChannelKey, boolean>, key: ChannelKey, enabled: boolean): boolean {
  const next = { ...states, [key]: enabled };
  return !CHANNELS.some((c) => next[c.key] && usable[c.key]);
}
