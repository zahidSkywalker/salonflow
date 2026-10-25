import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, requireAdmin } from "@/lib/salonflow/auth";

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const setting = await db.setting.findUnique({ where: { id: "main" } });
  return ok({ name: setting?.salonName ?? "SalonFlow", currencySymbol: setting?.currencySymbol ?? "$" });
}
