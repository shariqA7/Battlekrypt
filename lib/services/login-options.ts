import { prisma } from "@/lib/prisma";

// Which optional sign-in methods are switched on. Google and Discord are always on;
// Twitch is controlled from Admin > Settings (SiteSettings.twitchLoginEnabled).
export async function getLoginOptions() {
  const s = await prisma.siteSettings.findUnique({
    where: { id: "singleton" },
    select: { twitchLoginEnabled: true },
  });
  return { twitch: s?.twitchLoginEnabled ?? false };
}

export async function setTwitchLogin(enabled: boolean) {
  await prisma.siteSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", twitchLoginEnabled: enabled },
    update: { twitchLoginEnabled: enabled },
  });
  return getLoginOptions();
}
