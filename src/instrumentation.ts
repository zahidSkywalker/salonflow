/**
 * Next.js instrumentation hook — runs once per server instance before the
 * first request is served. Boots the SQLite schema + demo seed when needed.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureDatabase } = await import("@/lib/salonflow/bootstrap");
    await ensureDatabase();
  }
}
