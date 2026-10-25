import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, bad, requireAdmin } from "@/lib/salonflow/auth";

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const staff = await db.staff.findMany({
    orderBy: { sortOrder: "asc" },
    include: { services: { select: { serviceId: true } } },
  });
  return ok({
    staff: staff.map((st) => ({
      ...st,
      serviceIds: st.services.map((s) => s.serviceId),
      services: undefined,
    })),
  });
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const b = await req.json().catch(() => null);
  if (!b) return bad("Invalid body");
  const { name, title, bio, imageUrl, commissionPct, workingDays, shiftStartMin, shiftEndMin, serviceIds } = b as Record<string, unknown>;
  if (typeof name !== "string" || name.trim().length < 2) return bad("Name required");
  if (typeof commissionPct !== "number" || commissionPct < 0 || commissionPct > 100) {
    return bad("Commission must be 0–100");
  }
  const maxOrder = await db.staff.aggregate({ _max: { sortOrder: true } });
  const staff = await db.staff.create({
    data: {
      name: name.trim(),
      title: typeof title === "string" && title.trim() ? title.trim() : "Stylist",
      bio: typeof bio === "string" ? bio : "",
      imageUrl: typeof imageUrl === "string" ? imageUrl : "",
      commissionPct,
      workingDays: typeof workingDays === "string" && workingDays ? workingDays : "1,2,3,4,5,6",
      shiftStartMin: typeof shiftStartMin === "number" ? shiftStartMin : 540,
      shiftEndMin: typeof shiftEndMin === "number" ? shiftEndMin : 1140,
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });
  if (Array.isArray(serviceIds)) {
    for (const sid of serviceIds) {
      if (typeof sid === "string") {
        await db.serviceStaff.create({ data: { staffId: staff.id, serviceId: sid } }).catch(() => null);
      }
    }
  }
  return ok(staff, 201);
}
