// Prisma 7+ config file — the CLI (generate, migrate, studio) reads the
// database URL from here now, not from schema.prisma's datasource block.
import "dotenv/config";
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
