import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, bad, requireAdmin } from "@/lib/salonflow/auth";
import { parseItems } from "@/lib/salonflow/time";

// DB-driven: never prerender at build time.
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const sale = await db.sale.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      staff: { select: { id: true, name: true, title: true } },
      appointment: { select: { ref: true } },
    },
  });
  if (!sale) return bad("Sale not found", 404);
  return ok({ ...sale, items: parseItems(sale.items) });
}