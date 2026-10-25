import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, bad, requireAdmin } from "@/lib/salonflow/auth";

// DB-driven: never prerender at build time.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const services = await db.service.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { staff: { include: { staff: { select: { id: true, name: true } } } } },
  });
  return ok({
    services: services.map((s) => ({
      ...s,
      staff: s.staff.map((l) => l.staff),
    })),
  });
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const b = await req.json().catch(() => null);
  if (!b) return bad("Invalid body");
  const { name, category, description, price, durationMin, imageUrl, staffIds } = b as Record<string, unknown>;
  if (typeof name !== "string" || name.trim().length < 2) return bad("Service name required");
  if (typeof category !== "string" || !category.trim()) return bad("Category required");
  if (typeof price !== "number" || price < 0) return bad("Price must be a positive number (cents)");
  if (typeof durationMin !== "number" || durationMin < 5) return bad("Duration must be at least 5 minutes");

  const maxOrder = await db.service.aggregate({ _max: { sortOrder: true } });
  const service = await db.service.create({
    data: {
      name: name.trim(),
      category: category.trim(),
      description: typeof description === "string" ? description : "",
      price: Math.round(price),
      durationMin: Math.round(durationMin),
      imageUrl: typeof imageUrl === "string" ? imageUrl : "",
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });
  if (Array.isArray(staffIds)) {
    for (const sid of staffIds) {
      if (typeof sid === "string") {
        await db.serviceStaff.create({ data: { serviceId: service.id, staffId: sid } }).catch(() => null);
      }
    }
  }
  return ok(service, 201);
}