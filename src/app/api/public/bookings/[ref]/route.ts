import { NextRequest } from "next/server";
import { db, dbReady } from "@/lib/db";
import { ok, bad } from "@/lib/salonflow/auth";
import { salonToday } from "@/lib/salonflow/time";

async function getAppt(ref: string) {
  await dbReady; // first-run bootstrap
  return db.appointment.findUnique({
    where: { ref },
    include: {
      customer: { select: { name: true, phone: true } },
      staff: { select: { name: true, title: true, imageUrl: true } },
      service: { select: { name: true, price: true, durationMin: true, category: true } },
    },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  const appt = await getAppt(ref.toUpperCase());
  if (!appt) return bad("Booking not found. Check your reference code.", 404);
  return ok(appt);
}

/** Customer-side cancellation (future bookings only). */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  const appt = await getAppt(ref.toUpperCase());
  if (!appt) return bad("Booking not found.", 404);

  if (appt.status === "CANCELLED") return ok({ ...appt, alreadyCancelled: true });
  if (appt.status !== "CONFIRMED" && appt.status !== "PENDING") {
    return bad("This booking can no longer be cancelled online — please call us.");
  }

  // "in the past" is judged on the salon's clock, not the server's UTC
  const setting = await db.setting.findUnique({ where: { id: "main" } });
  if (appt.date < salonToday(setting?.timeZone)) return bad("This appointment is in the past.");

  const updated = await db.appointment.update({
    where: { ref: appt.ref },
    data: { status: "CANCELLED" },
  });
  return ok({ ref: updated.ref, status: updated.status });
}
