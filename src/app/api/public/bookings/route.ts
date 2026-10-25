import { NextRequest } from "next/server";
import { db, dbReady } from "@/lib/db";
import { ok, bad } from "@/lib/salonflow/auth";
import { firstFreeStaff, isSlotBookable } from "@/lib/salonflow/slotengine";
import { check, clientIp } from "@/lib/salonflow/ratelimit";

const REF_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeRef = () =>
  "SA-" +
  Array.from({ length: 5 }, () => REF_CHARS[Math.floor(Math.random() * REF_CHARS.length)]).join("");

export async function POST(req: NextRequest) {
  await dbReady; // first-run bootstrap

  // spam brake: 6 bookings / 10 min per IP is generous for humans
  const limit = check(`book:${clientIp(req)}`, 6, 10 * 60 * 1000, 10 * 60 * 1000);
  if (!limit.allowed) return bad("Too many bookings from this network — try again later.", 429);

  const body = await req.json().catch(() => null);
  if (!body) return bad("Invalid JSON body");

  const { serviceId, staffId, date, startMin, name, phone, email, notes } = body as Record<string, unknown>;
  if (typeof serviceId !== "string" || typeof date !== "string" || typeof startMin !== "number") {
    return bad("serviceId, date and startMin are required");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("That date doesn't look right");
  if (typeof name !== "string" || name.trim().length < 2) return bad("Please provide your full name");
  if (typeof phone !== "string" || phone.trim().length < 6) return bad("Please provide a valid phone number");

  const service = await db.service.findUnique({ where: { id: serviceId } });
  if (!service || !service.active) return bad("Service not available");

  const wantStaffId = typeof staffId === "string" && staffId !== "any" ? staffId : null;

  // resolve staff: requested one (must offer the service), or the first
  // specialist who is genuinely free at this exact slot — "any" must respect
  // what the slot grid promised, or guests hit "just taken" on open slots
  type StaffRow = NonNullable<Awaited<ReturnType<typeof db.staff.findUnique>>>;
  let staff: StaffRow | null = null;
  if (wantStaffId) {
    const candidate = await db.staff.findUnique({ where: { id: wantStaffId } });
    if (!candidate || !candidate.active) return bad("Specialist not available");
    const canDo = await db.serviceStaff.findUnique({
      where: { serviceId_staffId: { serviceId, staffId: candidate.id } },
    });
    if (!canDo) return bad("This specialist does not offer the selected service");
    staff = candidate;
  }

  // upsert customer by phone
  const customer = await db.customer.upsert({
    where: { phone: phone.trim() },
    create: { name: name.trim(), phone: phone.trim(), email: email ? String(email).trim() : null },
    update: { name: name.trim() },
  });

  // Check + create inside one transaction: SQLite serializes writes, so two
  // guests racing for the same chair cannot both pass the availability check.
  const appointment = await db.$transaction(async (tx) => {
    let resolvedStaffId: string | null;
    if (staff) {
      resolvedStaffId = staff.id;
    } else {
      resolvedStaffId = await firstFreeStaff(serviceId, date, startMin, tx);
      if (!resolvedStaffId) return { conflict: true as const };
    }

    const free = await isSlotBookable(serviceId, resolvedStaffId, date, startMin, tx);
    if (!free) return { conflict: true as const };

    let ref = makeRef();
    while (await tx.appointment.findUnique({ where: { ref } })) ref = makeRef();

    const created = await tx.appointment.create({
      data: {
        ref,
        customerId: customer.id,
        staffId: resolvedStaffId,
        serviceId: service.id,
        date,
        startMin,
        endMin: startMin + service.durationMin,
        status: "CONFIRMED",
        source: "ONLINE",
        notes: typeof notes === "string" ? notes.slice(0, 500) : null,
      },
    });

    const resolvedStaff = staff ?? (await tx.staff.findUnique({ where: { id: resolvedStaffId } }));
    return { conflict: false as const, created, staffName: resolvedStaff?.name ?? "your specialist" };
  });

  if (appointment.conflict) {
    return bad("Sorry, that time was just taken. Please pick another slot.", 409);
  }

  return ok({
    ref: appointment.created.ref,
    date: appointment.created.date,
    time: `${String(Math.floor(startMin / 60)).padStart(2, "0")}:${String(startMin % 60).padStart(2, "0")}`,
    service: service.name,
    price: service.price,
    staff: appointment.staffName,
    customer: customer.name,
  }, 201);
}
