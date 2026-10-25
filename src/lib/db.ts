import { PrismaClient } from "@prisma/client";
import path from "node:path";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Resolves the SQLite datasource URL.
 * - Serverless (Vercel): writable /tmp path; src/lib/salonflow/bootstrap.ts
 *   creates the schema and seeds it on cold start.
 * - Local: the committed db/custom.db (or $DATABASE_URL if provided,
 *   e.g. an absolute path or an external SQLite-compatible file).
 */
export function datasourceUrl(): string {
  if (process.env.VERCEL) return "file:/tmp/salonflow.db";
  const url = process.env.DATABASE_URL;
  if (url) return url;
  return "file:" + path.join(process.cwd(), "db", "custom.db");
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: datasourceUrl(),
    log: ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
