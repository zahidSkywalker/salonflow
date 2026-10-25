/**
 * Runtime database bootstrap.
 *
 * On serverless hosts (Vercel) the filesystem is ephemeral — a fresh SQLite
 * database is created in /tmp on every cold start. This module creates the
 * schema (idempotent DDL) and, when the database is empty, seeds the demo
 * dataset with dates relative to *today*, so the deployed demo always shows
 * a live 30-day window of reports.
 */
import { db } from "@/lib/db";
import { DDL_STATEMENTS } from "./ddl";
import { seedDatabase } from "./seed-core";

const globalForBoot = globalThis as unknown as {
  __salonflowBoot?: Promise<void>;
};

async function run(): Promise<void> {
  try {
    const tables = (await db.$queryRawUnsafe<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='Setting'"
    )) as { name: string }[];
    if (!Array.isArray(tables) || tables.length === 0) {
      for (const stmt of DDL_STATEMENTS) await db.$executeRawUnsafe(stmt);
    }
    if ((await db.setting.count()) === 0) {
      const r = await seedDatabase(db);
      console.log(
        `[salonflow] seeded demo DB: ${r.services} services, ${r.staff} staff, ${r.appointments} appointments, ${r.sales} sales`
      );
    }
  } catch (err) {
    console.error("[salonflow] database bootstrap failed:", err);
    throw err;
  }
}

/** Idempotent, memoized per server instance. */
export function ensureDatabase(): Promise<void> {
  globalForBoot.__salonflowBoot ??= run();
  return globalForBoot.__salonflowBoot;
}
