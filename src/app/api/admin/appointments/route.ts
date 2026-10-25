import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, bad, requireAdmin } from "@/lib/salonflow/auth";
import { firstFreeStaff, isSlotBookable } from "@/lib/salonflow/slotengine";
import { salonToday } from "@/lib/salonflow/time";

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") ?? "";
  const status = searchParams.get("status") ?? "";
  const staffId = searchParams.get("staffId") ?? "";
  const scope = searchParams.get("scope") ?? "day"; // day | upcoming | all

  const where: Record<string, unknown> = {};
  if (scope === "day" && date) where.date = date;
  if (scope === "upcoming") {
    const setting = await db.setting.findUnique({ where: { id: "main" } });
    where.date = { gte: salonToday(setting?.timeZone) };
  }
  if (status) where.status = status;
  if (staffId) where.staffId = staffId;

  const appts = await db.appointment.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      staff: { select: { id: true, name: true } },
      service: { select: { id: true, name: true, price: true, durationMin: true, category: true } },
    },
    orderBy: [{ date: "asc" }, { startMin: "asc" }],
    take: 200,
  });
  return ok({ appointments: appts });
}

/** Create an appointment from the admin panel (reception / walk-in). */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body) return bad("Invalid body");
  const { serviceId, staffId, customerId, newCustomer, date, startMin, source, notes } = body as Record<string, unknown>;

  if (typeof serviceId !== "string" || typeof date !== "string" || typeof startMin !== "number") {
    return bad("serviceId, date and startMin are required");
  }
  if (staffId !== "any" && typeof staffId !== "string") {
    return bad("Pick a specialist (or first available)");
  }

  const service = await db.service.findUnique({ where: { id: serviceId } });
  if (!service) return bad("Service not found");

  // "any" → first specialist who is actually free at that time
  let wantStaffId: string | null;
  if (staffId === "any") {
    wantStaffId = await firstFreeStaff(serviceId, date, startMin);
    if (!wantStaffId) return bad("Nobody is free at that time — try another slot", 409);
  } else {
    const staff = await db.staff.findUnique({ where: { id: staffId } });
    if (!staff) return bad("Staff not found");
    wantStaffId = staff.id;
  }

  // resolve or create customer
  let custId = typeof customerId === "string" && customerId ? customerId : "";
  const nc = newCustomer as { name?: unknown; phone?: unknown } | undefined;
  if (!custId && nc && typeof nc.name === "string" && typeof nc.phone === "string") {
    const created = await db.customer.upsert({
      where: { phone: nc.phone.trim() },
      create: { name: nc.name.trim(), phone: nc.phone.trim() },
      update: { name: nc.name.trim() },
    });
    custId = created.id;
  }
  if (!custId) return bad("Pick an existing customer or add name + phone");

  const appt = await db.$transaction(async (tx) => {
    // SQLite serializes writes — checking inside the tx closes the
    // double-booking window between "looks free" and "created".
    const free = await isSlotBookable(serviceId, wantStaffId, date, startMin, tx);
    if (!free) return null;

    const REF_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const makeRef = () =>
      "SA-" + Array.from({ length: 5 }, () => REF_CHARS[Math.floor(Math.random() * REF_CHARS.length)]).join("");
    let ref = makeRef();
    while (await tx.appointment.findUnique({ where: { ref } })) ref = makeRef();

    return tx.appointment.create({
      data: {
        ref,
        customerId: custId,
        staffId: wantStaffId,
        serviceId,
        date,
        startMin,
        endMin: startMin + service.durationMin,
        status: "CONFIRMED",
        source: source === "WALK_IN" ? "WALK_IN" : "ADMIN",
        notes: typeof notes === "string" ? notes.slice(0, 500) : null,
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        staff: { select: { id: true, name: true } },
        service: { select: { id: true, name: true, price: true, durationMin: true, category: true } },
      },
    });
  });
  if (!appt) return bad("That slot conflicts with another booking or the shift", 409);
  return ok(appt, 201);
}
