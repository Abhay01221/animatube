// Prisma 7 config — loads DATABASE_URL from .env using an explicit path
// so it resolves correctly regardless of where the CLI is invoked from.
import path from "path";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Load .env from the same directory as this config file
config({ path: path.resolve(__dirname, ".env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
