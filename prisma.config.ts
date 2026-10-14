// Use the same environment precedence as the web app and worker.
import { loadEnvConfig } from "@next/env";
import { defineConfig } from "prisma/config";

// Migrations need a direct/session connection for advisory locking.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
const migrationUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const url = migrationUrl ? new URL(migrationUrl) : undefined;
if (url?.hostname.endsWith(".pooler.supabase.com") && url.port === "6543") url.port = "5432";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: url?.href,
  },
});
