// Prisma 7+ config file — the CLI (generate, migrate, studio) reads the
// database URL from here now, not from schema.prisma's datasource block.
//
// NOTE: this project follows Next.js convention and uses .env.local
// (not .env) — plain `import "dotenv/config"` only auto-loads .env, so
// it silently misses .env.local. Loading it explicitly here instead.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
