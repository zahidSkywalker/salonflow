import { createHash } from "crypto";
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db, dbReady } from "@/lib/db";

export const ADMIN_COOKIE = "sf_admin";

/**
 * The admin session cookie holds a server-side random secret — never a hash
 * of the PIN. A demo PIN published in a README or a marketplace listing is
 * public knowledge; if the cookie were derived from it, anyone could forge
 * owner access without logging in. With a per-install random secret the only
 * road to a session is POST /api/admin/login with the actual PIN.
 */
function newSecret(): string {
  return randomBytes(32).toString("hex");
}

/** Fill in a blank/legacy secret once, so upgraded installs are safe too. */
export async function ensureSessionSecret(): Promise<string> {
  await dbReady; // first-run bootstrap (fresh serverless instance)
  const setting = await db.setting.findUnique({ where: { id: "main" } });
  if (!setting) return newSecret(); // unconfigured install — nothing to protect yet
  if (setting.sessionSecret) return setting.sessionSecret;
  const secret = newSecret();
  try {
    await db.setting.update({ where: { id: "main" }, data: { sessionSecret: secret } });
  } catch {
    /* racing writer saved one too — theirs is just as good */
  }
  return secret;
}

/**
 * Rotate the secret (login, PIN change). Returns the value to plant in the
 * cookie; every previous session dies instantly.
 */
export async function rotateSessionSecret(): Promise<string> {
  await dbReady;
  const secret = newSecret();
  await db.setting.update({ where: { id: "main" }, data: { sessionSecret: secret } });
  return secret;
}

/** Returns null when authorized, else a 401 response. */
export async function requireAdmin(
  req: NextRequest
): Promise<NextResponse | null> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const expected = await ensureSessionSecret();
  if (!token || token.length < 32 || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export function ok(data: unknown, init?: number) {
  return NextResponse.json(data, { status: init ?? 200 });
}

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Cookie options shared by login + settings. */
export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  };
}

/** Kept for tests/one-off hashing needs — NOT used for sessions. */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
