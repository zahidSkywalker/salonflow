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

  const existing = await db.service.findUnique({ where: { id } });
  if (!existing) return bad("Service not found", 404);

  const data: Record<string, unknown> = {};
  if (typeof b.name === "string" && b.name.trim()) data.name = b.name.trim();
  if (typeof b.category === "string" && b.category.trim()) data.category = b.category.trim();
  if (typeof b.description === "string") data.description = b.description;
  if (typeof b.price === "number" && b.price >= 0) data.price = Math.round(b.price);
  if (typeof b.durationMin === "number" && b.durationMin >= 5) data.durationMin = Math.round(b.durationMin);
  if (typeof b.imageUrl === "string") data.imageUrl = b.imageUrl;
  if (typeof b.active === "boolean") data.active = b.active;

  if (Array.isArray(b.staffIds)) {
    await db.serviceStaff.deleteMany({ where: { serviceId: id } });
    for (const sid of b.staffIds) {
      if (typeof sid === "string") {
        await db.serviceStaff.create({ data: { serviceId: id, staffId: sid } }).catch(() => null);
      }
    }
  }

  const updated = await db.service.update({
    where: { id },
    data,
    include: { staff: { include: { staff: { select: { id: true, name: true } } } } },
  });
  return ok({ ...updated, staff: updated.staff.map((l) => l.staff) });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const inUse = await db.appointment.count({ where: { serviceId: id } });
  if (inUse > 0) {
    // soft-delete: keep history intact
    await db.service.update({ where: { id }, data: { active: false } });
    return ok({ deactivated: id, reason: "Service has booking history — deactivated instead of deleted" });
  }
  await db.service.delete({ where: { id } });
  return ok({ deleted: id });
}