import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, bad, ADMIN_COOKIE, tokenForPin } from "@/lib/salonflow/auth";

// DB-driven: never prerender at build time.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const pin = (body as { pin?: string } | null)?.pin;
  if (typeof pin !== "string" || pin.length < 4) return bad("Enter your admin PIN");

  const setting = await db.setting.findUnique({ where: { id: "main" } });
  if (!setting) return bad("Salon not configured", 500);

  if (pin !== setting.adminPin) return bad("Incorrect PIN", 401);

  const res = ok({ name: setting.salonName });
  res.cookies.set(ADMIN_COOKIE, tokenForPin(setting.adminPin), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}