import { NextRequest } from "next/server";
import { ok, bad } from "@/lib/salonflow/auth";
import { askAria } from "@/lib/salonflow/assistant/engine";
import { intentIds } from "@/lib/salonflow/assistant/catalog";
import { check, sweep, clientIp } from "@/lib/salonflow/ratelimit";
import { dbReady } from "@/lib/db";

function parseContext(b: unknown): { lastIntent?: string | null; lastTimeMin?: number | null; lastDate?: string | null } {
  const ctx = (b as { context?: Record<string, unknown> })?.context ?? {};
  const out: Record<string, unknown> = {};
  if (typeof ctx.lastIntent === "string" && intentIds.has(ctx.lastIntent)) out.lastIntent = ctx.lastIntent;
  if (typeof ctx.lastTimeMin === "number" && Number.isFinite(ctx.lastTimeMin) && ctx.lastTimeMin >= 0 && ctx.lastTimeMin <= 1440) {
    out.lastTimeMin = Math.round(ctx.lastTimeMin);
  }
  if (typeof ctx.lastDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ctx.lastDate)) out.lastDate = ctx.lastDate;
  return out;
}

/**
 * POST /api/public/assistant — the storefront's Aria. Visitor-facing:
 * booking help, openings, prices, hours, location, booking lookup.
 * Privacy by construction: this route runs the PUBLIC handler set only —
 * it cannot reach revenue, client records or staff performance.
 */
export async function POST(req: NextRequest) {
  await dbReady; // first-run bootstrap on cold lambda

  sweep();
  // generous for a curious human, hostile to a script
  const limiter = check(`pubassist:${clientIp(req)}`, 20, 60_000, 5 * 60_000);
  if (!limiter.allowed) {
    return bad(`One sec — too many questions too fast. Try again in ${limiter.retryAfterSec}s.`, 429);
  }

  const b = await req.json().catch(() => null);
  const message = typeof b?.message === "string" ? b.message.trim().slice(0, 500) : "";
  if (!message) return bad("Say the word — I'm listening.");

  const hint = typeof b?.hint === "string" && intentIds.has(b.hint) ? b.hint : null;
  const reply = await askAria({
    message,
    scope: "public",
    context: parseContext(b),
    hint,
  });
  return ok(reply);
}
