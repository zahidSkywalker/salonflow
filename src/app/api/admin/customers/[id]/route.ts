import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, bad, requireAdmin } from "@/lib/salonflow/auth";

// DB-driven: never prerender at build time.
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!b) return bad("Invalid body");

  const existing = await db.customer.findUnique({ where: { id } });
  if (!existing) return bad("Customer not found", 404);

  const data: Record<string, unknown> = {};
  if (typeof b.name === "string" && b.name.trim()) data.name = b.name.trim();
  if (typeof b.phone === "string" && b.phone.trim().length >= 6) data.phone = b.phone.trim();
  if (typeof b.email === "string") data.email = b.email.trim() || null;
  if (typeof b.notes === "string") data.notes = b.notes.slice(0, 500);

  const updated = await db.customer.update({ where: { id }, data });
  return ok(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const hasHistory = (await db.appointment.count({ where: { customerId: id } })) > 0 ||
    (await db.sale.count({ where: { customerId: id } })) > 0;
  if (hasHistory) return bad("Customer has booking or purchase history and cannot be deleted", 409);
  await db.customer.delete({ where: { id } });
  return ok({ deleted: id });
}