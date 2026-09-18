// Seeds the initial set of launch games. Run with: npx prisma db seed
// Per the spec: start with a small subset, expand via the
// "Request a Game" flow rather than pre-loading all 24 EWC titles.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const LAUNCH_GAMES = [
  { name: "PUBG Mobile", category: "mobile" },
  { name: "Free Fire", category: "mobile" },
  { name: "Mobile Legends: Bang Bang", category: "mobile" },
  { name: "Valorant", category: "pc" },
  { name: "League of Legends", category: "pc" },
];

async function main() {
  for (const game of LAUNCH_GAMES) {
    await prisma.game.upsert({
      where: { name: game.name },
      update: {},
      create: game,
    });
  }
  console.log(`Seeded ${LAUNCH_GAMES.length} games.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
