import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const url = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL);
  // Prisma migration locks require session affinity, unlike application queries.
  if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543") url.port = "5432";
  const pool = new Pool({ connectionString: url.href, connectionTimeoutMillis: 10000 });
  const cli = resolve("node_modules/prisma/build/index.js");
  const run = (args: string[]) => new Promise<void>((accept, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      env: { ...process.env, DATABASE_URL: url.href }, stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? accept() : reject(new Error(`Prisma command failed (${code})`)));
  });
  try {
    const columns = (await pool.query("SELECT table_name,column_name,data_type,column_default,is_nullable FROM information_schema.columns WHERE table_schema=current_schema() ORDER BY table_name,ordinal_position")).rows;
    const tables = new Set(columns.map(c => c.table_name));
    const balances = tables.has("User") ? (await pool.query('SELECT "id","credits","videosGenerated" FROM "User" ORDER BY "id"')).rows : [];
    const indexes = (await pool.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname=current_schema()")).rows;
    await mkdir("test-output", { recursive: true });
    const backup = `test-output/database-before-${Date.now()}.json`;
    await writeFile(backup, JSON.stringify({ columns, indexes, balances }, null, 2), { mode: 0o600 });
    console.log(`Saved schema and credit balance snapshot: ${backup}`);
    const history = tables.has("_prisma_migrations")
      ? (await pool.query('SELECT migration_name,finished_at,rolled_back_at FROM "_prisma_migrations"')).rows : [];
    const applied = (name: string) => history.some(row => row.migration_name === name && row.finished_at && !row.rolled_back_at);
    if (tables.has("User") && !applied("20261010000000_initial")) {
      const expected = ["User", "Video", "Account", "Session", "VerificationToken"];
      if (!expected.every(name => tables.has(name))) throw new Error("Existing schema is incomplete; inspect it before baselining");
      const initial=await readFile("prisma/migrations/20261010000000_initial/migration.sql","utf8");
      for(const table of initial.matchAll(/CREATE TABLE IF NOT EXISTS "([^"]+)" \(([\s\S]*?)\n\);/g)){
        for(const column of table[2].matchAll(/^\s+"([^"]+)" /gm)){
          if(!columns.some(c=>c.table_name===table[1]&&c.column_name===column[1]))throw new Error(`Existing schema is missing ${table[1]}.${column[1]}; inspect before baselining`);
        }
      }
      await run(["migrate", "resolve", "--applied", "20261010000000_initial"]);
    }
    if (columns.some(c => c.table_name === "User" && c.column_name === "firebaseUid") && !applied("20261011120000_add_firebase_uid")) {
      await run(["migrate", "resolve", "--applied", "20261011120000_add_firebase_uid"]);
    }
    await run(["migrate", "deploy"]);
    const after = tables.has("User") ? (await pool.query('SELECT "id","credits","videosGenerated" FROM "User" ORDER BY "id"')).rows : [];
    if (JSON.stringify(balances) !== JSON.stringify(after)) throw new Error("Credit balances changed during migration; compare the saved snapshot before further actions");
    await pool.query('SELECT "generationOptions","generationManifest","requestKey" FROM "Video" LIMIT 1');
    await pool.query('SELECT 1 FROM "ChannelProfile" LIMIT 1');
    await pool.query('SELECT 1 FROM "CreditLedger" LIMIT 1');
    await pool.query('SELECT 1 FROM "JobOutbox" LIMIT 1');
    console.log("Database updated; generation/channel tables verified; existing credit balances preserved.");
  } finally { await pool.end(); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Database migration failed"); process.exitCode = 1; });
