import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const ADMIN_COOKIE = "sf_admin";

/** Deterministic token derived from the current admin PIN. */
export function tokenForPin(pin: string): string {
  return createHash("sha256").update(`salonflow-v1:${pin}`).digest("hex");
}

export async function currentPin(): Promise<string> {
  const setting = await db.setting.findUnique({ where: { id: "main" } });
  return setting?.adminPin ?? "aurelia2024";
}

/** Returns null when authorized, else a 401 response. */
export async function requireAdmin(
  req: NextRequest
): Promise<NextResponse | null> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const expected = tokenForPin(await currentPin());
  if (!token || token !== expected) {
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
