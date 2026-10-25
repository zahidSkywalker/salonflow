import { NextRequest } from "next/server";
import { db, dbReady } from "@/lib/db";
import { ok, bad } from "@/lib/salonflow/auth";
import { isSlotBookable } from "@/lib/salonflow/slotengine";
import { weekdayOf } from "@/lib/salonflow/time";

const REF_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeRef = () =>
  "SA-" +
  Array.from({ length: 5 }, () => REF_CHARS[Math.floor(Math.random() * REF_CHARS.length)]).join("");

export async function POST(req: NextRequest) {
  await dbReady; // first-run bootstrap
  const body = await req.json().catch(() => null);
  if (!body) return bad("Invalid JSON body");

  const { serviceId, staffId, date, startMin, name, phone, email, notes } = body as Record<string, unknown>;
  if (typeof serviceId !== "string" || typeof date !== "string" || typeof startMin !== "number") {
    return bad("serviceId, date and startMin are required");
  }
  if (typeof name !== "string" || name.trim().length < 2) return bad("Please provide your full name");
  if (typeof phone !== "string" || phone.trim().length < 6) return bad("Please provide a valid phone number");

  const service = await db.service.findUnique({ where: { id: serviceId } });
  if (!service || !service.active) return bad("Service not available");

  const wantStaffId = typeof staffId === "string" && staffId !== "any" ? staffId : null;

  // resolve staff: requested one, or first eligible & working
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
  } else {
    const links = await db.serviceStaff.findMany({
      where: { serviceId },
      include: { staff: true },
    });
    staff =
      links.map((l) => l.staff).find((st) => {
        if (!st.active) return false;
        if (!st.workingDays.split(",").map(Number).includes(weekdayOf(date))) return false;
        return true;
      }) ?? null;
    if (!staff) return bad("No specialist available for this service");
  }

  if (service.durationMin + startMin > staff.shiftEndMin) {
    return bad("Selected time does not fit the specialist's shift");
  }

  const free = await isSlotBookable(serviceId, staff.id, date, startMin);
  if (!free) return bad("Sorry, that time was just taken. Please pick another slot.", 409);

  // upsert customer by phone
  const customer = await db.customer.upsert({
    where: { phone: phone.trim() },
    create: { name: name.trim(), phone: phone.trim(), email: email ? String(email).trim() : null },
    update: { name: name.trim() },
  });

  let ref = makeRef();
  // extremely unlikely, but keep refs unique
  while (await db.appointment.findUnique({ where: { ref } })) ref = makeRef();

  const appointment = await db.appointment.create({
    data: {
      ref,
      customerId: customer.id,
      staffId: staff.id,
      serviceId: service.id,
      date,
      startMin,
      endMin: startMin + service.durationMin,
      status: "CONFIRMED",
      source: "ONLINE",
      notes: typeof notes === "string" ? notes.slice(0, 500) : null,
    },
  });

  return ok({
    ref: appointment.ref,
    date: appointment.date,
    time: `${String(Math.floor(startMin / 60)).padStart(2, "0")}:${String(startMin % 60).padStart(2, "0")}`,
    service: service.name,
    price: service.price,
    staff: staff.name,
    customer: customer.name,
  }, 201);
}
