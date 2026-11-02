// Reads and changes the on/off switch of each way to pay (see lib/payment-channels.ts).
import { prisma } from "@/lib/prisma";
import { CHANNELS, channelDef, isChannelKey, resolveStates, type ChannelKey, type ChannelStates } from "@/lib/payment-channels";
import { getNowPaymentsConfig } from "@/lib/nowpayments";
import { listPaymentMethods } from "@/lib/services/payment-methods";

export async function getChannelStates(): Promise<ChannelStates> {
  return resolveStates(await prisma.paymentChannel.findMany());
}

export async function isChannelEnabled(key: ChannelKey): Promise<boolean> {
  return (await getChannelStates())[key];
}

// What each channel needs before it can take a payment: a gateway needs its keys, manual needs at
// least one active method.
export async function getChannelReadiness() {
  const cfg = getNowPaymentsConfig();
  const activeMethods = (await listPaymentMethods({ activeOnly: true })).length;
  return {
    manual: { ready: activeMethods > 0, note: activeMethods > 0 ? `${activeMethods} method${activeMethods === 1 ? "" : "s"} switched on` : "no method is switched on yet" },
    nowpayments: {
      ready: cfg.configured && cfg.hasIpnSecret,
      note: cfg.configured && cfg.hasIpnSecret ? `API key and IPN secret set${cfg.sandbox ? " (sandbox)" : ""}` : "API key or IPN secret missing on the server",
    },
  } satisfies Record<ChannelKey, { ready: boolean; note: string }>;
}

export async function getChannelsView() {
  const [states, readiness] = await Promise.all([getChannelStates(), getChannelReadiness()]);
  return CHANNELS.map((c) => ({ ...c, enabled: states[c.key], ready: readiness[c.key].ready, note: readiness[c.key].note }));
}

export async function setChannelEnabled(adminId: string, key: unknown, enabled: unknown) {
  if (!isChannelKey(key)) return { error: "validation_error" as const, message: "Unknown way to pay." };
  if (typeof enabled !== "boolean") return { error: "validation_error" as const, message: "enabled must be true or false." };
  await prisma.paymentChannel.upsert({ where: { key }, create: { key, enabled }, update: { enabled } });
  await prisma.adminActionLog.create({
    data: { adminId, action: enabled ? "enabled_payment_channel" : "disabled_payment_channel", targetType: "PaymentChannel", targetId: key, notes: channelDef(key).label },
  });
  return { data: { key, enabled } };
}
