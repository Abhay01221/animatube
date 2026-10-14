/**
 * Singleton Prisma client using the pg adapter (Prisma 7).
 * Prevents connection pool exhaustion in dev (hot reload).
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

function createPrismaClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max:Number(process.env.PG_POOL_MAX??5),
    connectionTimeoutMillis:10000,
  });
  const adapter = new PrismaPg(pool,{disposeExternalPool:true});
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

type PrismaClientType = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as { prisma: PrismaClientType };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
