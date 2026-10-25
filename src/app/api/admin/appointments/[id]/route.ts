import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, bad, requireAdmin } from "@/lib/salonflow/auth";
import { isSlotBookable } from "@/lib/salonflow/slotengine";

// DB-driven: never prerender at build time.
export const dynamic = "force-dynamic";

const STATUSES = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return bad("Invalid body");

  const existing = await db.appointment.findUnique({ where: { id } });
  if (!existing) return bad("Appointment not found", 404);

  const data: Record<string, unknown> = {};

  if (typeof body.status === "string") {
    if (!STATUSES.includes(body.status)) return bad("Unknown status");
    data.status = body.status;
  }

  // reschedule: { date, startMin }
  if (typeof body.date === "string" && typeof body.startMin === "number") {
    const service = await db.service.findUnique({ where: { id: existing.serviceId } });
    if (!service) return bad("Service missing");
    const conflict = await db.appointment.findFirst({
      where: {
        id: { not: id },
        staffId: existing.staffId,
        date: body.date,
        status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
        startMin: { lt: body.startMin + service.durationMin },
        endMin: { gt: body.startMin },
      },
    });
    if (conflict) return bad("New time overlaps another booking", 409);
    const bookable = await isSlotBookable(existing.serviceId, existing.staffId, body.date, body.startMin);
    if (!bookable) return bad("New time is outside working hours", 409);
    data.date = body.date;
    data.startMin = body.startMin;
    data.endMin = body.startMin + service.durationMin;
  }

  if (typeof body.notes === "string") data.notes = body.notes.slice(0, 500);

  if (Object.keys(data).length === 0) return bad("Nothing to update");

  const updated = await db.appointment.update({
    where: { id },
    data,
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      staff: { select: { id: true, name: true } },
      service: { select: { id: true, name: true, price: true, durationMin: true, category: true } },
    },
  });
  return ok(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const existing = await db.appointment.findUnique({ where: { id } });
  if (!existing) return bad("Appointment not found", 404);
  await db.appointment.delete({ where: { id } });
  return ok({ deleted: id });
}