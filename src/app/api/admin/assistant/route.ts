import { NextRequest } from "next/server";
import { ok, bad, requireAdmin } from "@/lib/salonflow/auth";
import { askSalon } from "@/lib/salonflow/assistant";
import { check, sweep, clientIp } from "@/lib/salonflow/ratelimit";

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

  const reply = await askSalon(message);
  return ok(reply);
}
