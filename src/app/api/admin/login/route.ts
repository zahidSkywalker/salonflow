import { NextRequest, NextResponse } from "next/server";
import { db, dbReady } from "@/lib/db";
import { ok, bad, ADMIN_COOKIE, rotateSessionSecret, adminCookieOptions } from "@/lib/salonflow/auth";
import { check, reset, sweep, clientIp } from "@/lib/salonflow/ratelimit";

export async function POST(req: NextRequest) {
  // brute-force brake: 8 tries / 10 min, then 10 minutes locked
  const ip = clientIp(req);
  const limit = check(`login:${ip}`, 8, 10 * 60 * 1000, 10 * 60 * 1000);
  if (!limit.allowed) {
    return bad(`Too many attempts — locked for ${limit.retryAfterSec}s. Make tea, come back.`, 429);
  }
  sweep();

  const body = await req.json().catch(() => null);
  const pin = (body as { pin?: string } | null)?.pin;
  if (typeof pin !== "string" || pin.length < 4) return bad("Enter your admin PIN");

  await dbReady; // first-run bootstrap
  const setting = await db.setting.findUnique({ where: { id: "main" } });
  if (!setting) return bad("Salon not configured", 500);

  if (pin !== setting.adminPin) return bad("Incorrect PIN", 401);
  reset(`login:${ip}`);

  // fresh secret on every login — any session issued earlier dies here
  const secret = await rotateSessionSecret();

  const res = ok({ name: setting.salonName });
  res.cookies.set(ADMIN_COOKIE, secret, adminCookieOptions());
  return res;
}
