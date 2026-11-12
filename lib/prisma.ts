// Prisma client singleton — Prisma 7+ requires an explicit driver adapter
// for the runtime client (this is separate from prisma.config.ts, which
// only configures the CLI for migrate/generate/studio).
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Every serverless instance keeps its OWN pool, and many instances run at once during a spike, so
// each pool must stay small or the database runs out of connections. Set DATABASE_POOL_MAX to tune
// it (see SETUP.md, "Going live"). Locally a bigger pool is fine.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DATABASE_POOL_MAX) || (process.env.NODE_ENV === "production" ? 5 : 10),
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
