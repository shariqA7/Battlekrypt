// New-player onboarding: who needs it, and saving each step. The rules live in
// lib/onboarding-rules.ts; this file is the database side.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ageOn } from "@/lib/age";
import { COUNTRIES } from "@/lib/geo-data";
import { gameVisibilityWhere, toCountryCode } from "@/lib/game-region";
import { requestSignupConsent } from "@/lib/services/parental-consent";
import { aboutChecks, gamesChecks, missingAbout, needsAboutStep, styleChecks } from "@/lib/onboarding-rules";
import { allOk, birthInfo, normalizeEmail, normalizeUsername, usernameChecks, type Check } from "@/lib/validation/auth";

// Sent through onboarding after signing in: players who haven't finished it, or who are
// still missing a username or date of birth (the required details). Organizers are left
// alone: their sign-up already asked for their details, and they can still play later
// (the date of birth is asked for at the moment they join something).
export async function needsOnboarding(userId: string): Promise<boolean> {
  const [profile, organizer, application] = await Promise.all([
    prisma.playerProfile.findUnique({ where: { userId }, select: { birthDate: true, username: true, onboardedAt: true } }),
    prisma.organizerProfile.findUnique({ where: { userId }, select: { id: true } }),
    prisma.organizationApplication.findUnique({ where: { userId }, select: { id: true } }),
  ]);
  if (!profile || organizer || application) return false;
  return !profile.birthDate || !profile.username || !profile.onboardedAt;
}

export async function visibleGames(countryText: string | null) {
  return prisma.game.findMany({
    where: { isApproved: true, ...gameVisibilityWhere(toCountryCode(countryText)) },
    orderBy: { name: "asc" },
    select: { name: true, genre: true },
  });
}

// Everything the onboarding screen needs to decide which steps to show.
export async function getOnboardingData(userId: string) {
  const profile = await prisma.playerProfile.findUnique({
    where: { userId },
    include: { user: { select: { email: true } } },
  });
  if (!profile) return null;
  const missing = missingAbout(profile);
  return {
    email: profile.user.email,
    missing,
    needsAbout: needsAboutStep(missing),
    favoriteGames: profile.favoriteGames,
    playStyle: profile.playStyle,
    gender: profile.gender ?? "",
    hobbies: profile.hobbies ?? "",
    guardianEmail: profile.guardianEmail,
    isMinor: !!profile.birthDate && ageOn(profile.birthDate) < 18,
    games: await visibleGames(profile.country),
  };
}

type StepResult = { ok: true; checks: Check[] } | { ok: false; checks: Check[]; status: number };
const fail = (checks: Check[], status = 400): StepResult => ({ ok: false, checks, status });
const one = (id: string, message: string): Check[] => [{ id, ok: false, message }];

export async function saveOnboardingStep(userId: string, body: unknown, origin: string): Promise<StepResult> {
  const b = (body ?? {}) as Record<string, unknown>;
  const profile = await prisma.playerProfile.findUnique({
    where: { userId },
    include: { user: { select: { email: true } } },
  });
  if (!profile) return fail(one("profile", "Finish signing in first."), 404);
  const str = (v: unknown) => (typeof v === "string" ? v : "");

  if (b.step === "about") {
    const missing = missingAbout(profile);
    if (!needsAboutStep(missing)) return { ok: true, checks: [] };

    const input = {
      firstName: str(b.firstName).trim().replace(/\s+/g, " "),
      lastName: str(b.lastName).trim().replace(/\s+/g, " "),
      username: normalizeUsername(b.username),
      birthDate: str(b.birthDate).trim(),
      country: str(b.country).trim().toUpperCase(),
      guardianEmail: normalizeEmail(b.guardianEmail),
    };
    const taken = missing.username && input.username
      ? !!(await prisma.playerProfile.findUnique({ where: { username: input.username }, select: { id: true } }))
      : undefined;
    const checks = aboutChecks(input, missing, { usernameTaken: taken, ownEmail: profile.user.email ?? undefined });
    if (!allOk(checks)) return fail(checks);

    const birth = missing.birthDate ? birthInfo(input.birthDate) : null;
    const nowMinor = birth ? birth.age < 18 : !!profile.birthDate && ageOn(profile.birthDate) < 18;
    try {
      await prisma.$transaction([
        prisma.playerProfile.update({
          where: { id: profile.id },
          data: {
            ...(missing.name && { firstName: input.firstName, lastName: input.lastName }),
            ...(missing.username && { username: input.username }),
            ...(birth && { birthDate: birth.date, age: birth.age }),
            ...(missing.country && { country: COUNTRIES[input.country].name }),
            ...(nowMinor && input.guardianEmail && { guardianEmail: input.guardianEmail }),
          },
        }),
        ...(missing.name
          ? [prisma.user.update({ where: { id: userId }, data: { displayName: `${input.firstName} ${input.lastName}`.trim() } })]
          : []),
      ]);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return fail(usernameChecks(input.username, true));
      }
      throw e;
    }
    // A player under 18 can't join anything until a guardian approves, so ask them now.
    if (nowMinor) await requestSignupConsent(userId, origin).catch(() => undefined);
    return { ok: true, checks };
  }

  if (b.step === "games") {
    const games = await visibleGames(profile.country);
    const { checks, value } = gamesChecks(b.games, games.map((g) => g.name));
    if (!allOk(checks)) return fail(checks);
    await prisma.playerProfile.update({ where: { id: profile.id }, data: { favoriteGames: value } });
    return { ok: true, checks };
  }

  if (b.step === "style") {
    const { checks, value } = styleChecks(b);
    if (!allOk(checks)) return fail(checks);
    await prisma.playerProfile.update({
      where: { id: profile.id },
      data: { playStyle: value.playStyle, gender: value.gender, hobbies: value.hobbies },
    });
    return { ok: true, checks };
  }

  if (b.step === "finish") {
    if (needsAboutStep(missingAbout(profile))) {
      return fail(one("about", "Fill in your details first."));
    }
    await prisma.playerProfile.update({ where: { id: profile.id }, data: { onboardedAt: profile.onboardedAt ?? new Date() } });
    return { ok: true, checks: [] };
  }

  return fail(one("step", "Unknown step."));
}
