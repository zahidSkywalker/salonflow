import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, requireAdmin } from "@/lib/salonflow/auth";
import { parseItems } from "@/lib/salonflow/time";

// DB-driven: never prerender at build time.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 30)));

  const sales = await db.sale.findMany({
    include: {
      customer: { select: { id: true, name: true } },
      staff: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return ok({
    sales: sales.map((s) => ({ ...s, items: parseItems(s.items) })),
  });
}