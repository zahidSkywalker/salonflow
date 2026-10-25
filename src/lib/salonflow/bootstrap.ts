/**
 * First-run bootstrap: make sure the database exists, has tables, and holds
 * the demo dataset. This is what lets a fresh clone (or a cold serverless
 * /tmp directory) serve a fully "lived-in" salon on the very first request —
 * no migration commands, no binary .db files in the repo.
 */
import type { PrismaClient } from "@prisma/client";
import { DDL } from "./ddl";
import { seedDatabase } from "./seed";

let ready: Promise<void> | null = null;

async function initialize(db: PrismaClient) {
  // fast path: schema exists (already pushed locally / warmed /tmp on Vercel)
  try {
    const [settings] = await db.$queryRawUnsafe<{ c: number }[]>(`SELECT COUNT(*) as c FROM "Setting"`);
    if (settings && Number(settings.c) > 0) return; // healthy + seeded
    // tables exist but empty → seed only
    await seedDatabase(db);
    return;
  } catch {
    // tables missing → fall through to DDL
  }

  for (const stmt of DDL) {
    try {
      await db.$executeRawUnsafe(stmt);
    } catch {
      /* "already exists" races between warm lambdas are fine */
    }
  }
  await seedDatabase(db);
}

/** Idempotent, single-flight per process. Await this before the first query. */
export function ensureSeeded(db: PrismaClient): Promise<void> {
  ready ??= initialize(db);
  return ready;
}
