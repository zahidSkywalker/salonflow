import { NextRequest } from "next/server";
import { ok, bad, requireAdmin } from "@/lib/salonflow/auth";
import { askAria } from "@/lib/salonflow/assistant/engine";
import { intentIds } from "@/lib/salonflow/assistant/catalog";
import { check, sweep, clientIp } from "@/lib/salonflow/ratelimit";

/** Sanitized client memory — only known shapes get through. */
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
 * POST /api/admin/assistant — one question in, one real answer out.
 * Aria reads the live database directly; nothing here touches an external
 * AI service. Admin-only: the console's data stays behind the PIN.
 */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  sweep();
  const limiter = check(`assistant:${clientIp(req)}`, 40, 60_000, 2 * 60_000);
  if (!limiter.allowed) {
    return bad(`Easy there — ask again in ${limiter.retryAfterSec}s`, 429);
  }

  const b = await req.json().catch(() => null);
  const message = typeof b?.message === "string" ? b.message.trim().slice(0, 500) : "";
  if (!message) return bad("Say something and I'll dig into the numbers.");

  const hint = typeof b?.hint === "string" && intentIds.has(b.hint) ? b.hint : null;
  const reply = await askAria({
    message,
    scope: "admin",
    context: parseContext(b),
    hint,
  });
  return ok(reply);
}
