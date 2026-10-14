import { execFileSync } from "node:child_process";
import { readFileSync,writeFileSync,mkdirSync } from "node:fs";
import { resolve,dirname } from "node:path";
const cli=resolve("node_modules/prisma/build/index.js");
export function currentSchemaSql(){
  const file=resolve("test-output/current-schema.sql");mkdirSync(dirname(file),{recursive:true});
  execFileSync(process.execPath,[cli,"migrate","diff","--from-empty","--to-schema","prisma/schema.prisma","--script","--output",file],{stdio:"pipe"});
  return readFileSync(file,"utf8");
}
export function writeUpgradeMigrations(){
  const baseline=resolve("test-output/baseline-schema.prisma");mkdirSync(dirname(baseline),{recursive:true});
  writeFileSync(baseline,execFileSync("git",["show","HEAD:prisma/schema.prisma"],{encoding:"utf8"}));
  const initial="prisma/migrations/20261010000000_initial",upgrade="prisma/migrations/20261013000000_resumable_generation";
  mkdirSync(initial,{recursive:true});mkdirSync(upgrade,{recursive:true});
  execFileSync(process.execPath,[cli,"migrate","diff","--from-empty","--to-schema",baseline,"--script","--output",initial+"/migration.sql"],{stdio:"pipe"});
  execFileSync(process.execPath,[cli,"migrate","diff","--from-schema",baseline,"--to-schema","prisma/schema.prisma","--script","--output",upgrade+"/migration.sql"],{stdio:"pipe"});
  let sql=readFileSync(initial+"/migration.sql","utf8").replace(/CREATE TABLE /g,"CREATE TABLE IF NOT EXISTS ").replace(/CREATE UNIQUE INDEX /g,"CREATE UNIQUE INDEX IF NOT EXISTS ").replace(/CREATE INDEX /g,"CREATE INDEX IF NOT EXISTS ");
  sql=sql.replace(/ALTER TABLE ([^;]+) ADD CONSTRAINT "([^"]+)"([^;]+);/g,(statement,_table,name)=>"DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '"+name+"') THEN "+statement+" END IF; END $$;");
  writeFileSync(initial+"/migration.sql",sql);
  if(/DROP (TABLE|COLUMN)/.test(readFileSync(upgrade+"/migration.sql","utf8")))throw new Error("Unexpected destructive migration");
  writeFileSync("prisma/migrations/migration_lock.toml",'provider = "postgresql"\n');
  console.log("Baseline and additive upgrade migrations written; no table or column drops.");
}
if(process.argv.includes("--write-migrations"))writeUpgradeMigrations();
