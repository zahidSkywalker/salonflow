import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, bad, requireAdmin } from "@/lib/salonflow/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!b) return bad("Invalid body");

  const existing = await db.product.findUnique({ where: { id } });
  if (!existing) return bad("Product not found", 404);

  const data: Record<string, unknown> = {};
  if (typeof b.name === "string" && b.name.trim()) data.name = b.name.trim();
  if (typeof b.brand === "string") data.brand = b.brand.trim();
  if (typeof b.price === "number" && b.price >= 0) data.price = Math.round(b.price);
  if (typeof b.stock === "number" && b.stock >= 0) data.stock = Math.round(b.stock);
  if (typeof b.active === "boolean") data.active = b.active;

  const updated = await db.product.update({ where: { id }, data });
  return ok(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  await db.product.delete({ where: { id } });
  return ok({ deleted: id });
}
