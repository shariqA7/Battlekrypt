// Seeds the initial set of launch games. Run with: npx prisma db seed
// Per the spec: start with a small subset, expand via the
// "Request a Game" flow rather than pre-loading all 24 EWC titles.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const LAUNCH_GAMES = [
  { name: "PUBG Mobile", category: "mobile" },
  { name: "BGMI", category: "mobile" }, // Battlegrounds Mobile India — large Indian player base
  { name: "Free Fire", category: "mobile" },
  { name: "Mobile Legends: Bang Bang", category: "mobile" },
  { name: "Valorant", category: "pc" },
  { name: "League of Legends", category: "pc" },
];

// Starting suggestions for the organizer's "+" rule picker. This is only a
// starting point — the live list is the SuggestedRule table, which admins
// edit from the admin panel. They are inserted ONLY when that table is empty,
// so anything an admin edits, hides or deletes is never brought back by a
// later `prisma db seed`.
const DEFAULT_SUGGESTED_RULES: {
  title: string;
  description: string;
  action: "warning" | "point_deduction" | "disqualification";
  penaltyPoints?: number;
  gameCategory?: string;
}[] = [
  {
    title: "No emulators",
    description: "All players must play on a real mobile device. Emulator use is not allowed.",
    action: "disqualification",
    gameCategory: "mobile",
  },
  {
    title: "No hacks or cheats",
    description:
      "Hacks, scripts, macros or any third-party software that gives an unfair advantage are banned.",
    action: "disqualification",
  },
  {
    title: "No teaming",
    description: "Teaming up or colluding with players outside your own team is not allowed.",
    action: "disqualification",
  },
  {
    title: "No ghosting or stream sniping",
    description:
      "Players may not watch a live stream of the match or receive outside help while playing.",
    action: "disqualification",
  },
  {
    title: "Check-in window",
    description:
      "Players must be in the lobby and checked in at least 10 minutes before the scheduled start time.",
    action: "warning",
  },
  {
    title: "Late arrival",
    description: "Teams that are not in the room when the match starts lose points for that match.",
    action: "point_deduction",
    penaltyPoints: 5,
  },
  {
    title: "Room re-entry limit",
    description:
      "A player who leaves the room may re-enter once. Further re-entries are not allowed.",
    action: "warning",
  },
  {
    title: "Use your registered name",
    description:
      "Players must use the in-game name they registered with. Mismatched names may be removed from the room.",
    action: "warning",
  },
  {
    title: "Respectful conduct",
    description:
      "Abuse or unsporting behaviour toward players, staff or the organizer can lead to removal.",
    action: "warning",
  },
];

async function seedSuggestedRules() {
  if ((await prisma.suggestedRule.count()) > 0) {
    console.log("Suggested rules already exist — left untouched.");
    return;
  }
  await prisma.suggestedRule.createMany({
    data: DEFAULT_SUGGESTED_RULES.map((r, index) => ({
      title: r.title,
      description: r.description,
      action: r.action,
      penaltyPoints: r.penaltyPoints ?? null,
      gameCategory: r.gameCategory ?? null,
      sortOrder: index + 1,
    })),
  });
  console.log(`Seeded ${DEFAULT_SUGGESTED_RULES.length} suggested rules.`);
}

async function main() {
  for (const game of LAUNCH_GAMES) {
    await prisma.game.upsert({
      where: { name: game.name },
      update: {},
      create: game,
    });
  }
  console.log(`Seeded ${LAUNCH_GAMES.length} games.`);
  await seedSuggestedRules();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
