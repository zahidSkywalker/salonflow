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

  const existing = await db.staff.findUnique({ where: { id } });
  if (!existing) return bad("Staff member not found", 404);

  const data: Record<string, unknown> = {};
  if (typeof b.name === "string" && b.name.trim()) data.name = b.name.trim();
  if (typeof b.title === "string" && b.title.trim()) data.title = b.title.trim();
  if (typeof b.bio === "string") data.bio = b.bio;
  if (typeof b.imageUrl === "string") data.imageUrl = b.imageUrl;
  if (typeof b.commissionPct === "number" && b.commissionPct >= 0 && b.commissionPct <= 100) data.commissionPct = b.commissionPct;
  if (typeof b.workingDays === "string" && b.workingDays) data.workingDays = b.workingDays;
  if (typeof b.shiftStartMin === "number") data.shiftStartMin = b.shiftStartMin;
  if (typeof b.shiftEndMin === "number") data.shiftEndMin = b.shiftEndMin;
  if (typeof b.active === "boolean") data.active = b.active;

  if (Array.isArray(b.serviceIds)) {
    await db.serviceStaff.deleteMany({ where: { staffId: id } });
    for (const sid of b.serviceIds) {
      if (typeof sid === "string") {
        await db.serviceStaff.create({ data: { staffId: id, serviceId: sid } }).catch(() => null);
      }
    }
  }

  const updated = await db.staff.update({ where: { id }, data });
  return ok(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const inUse = await db.appointment.count({ where: { staffId: id } });
  if (inUse > 0) {
    await db.staff.update({ where: { id }, data: { active: false } });
    return ok({ deactivated: id, reason: "Staff member has booking history — deactivated instead of deleted" });
  }
  await db.staff.delete({ where: { id } });
  return ok({ deleted: id });
}