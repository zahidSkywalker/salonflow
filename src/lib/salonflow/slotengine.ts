import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { minToLabel, salonClock, overlaps, weekdayOf } from "./time";

export interface Slot {
  min: number;
  label: string;
  available: boolean;
}

/** Anything Prisma can run queries against (the client or a transaction). */
export type DbLike = PrismaClient | Prisma.TransactionClient;

const OPEN_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED"];

/**
 * Compute bookable slots for a service on a date.
 * staffId = "any" → slot is available when at least one eligible stylist is free.
 * Pass a transaction client to make check-then-create atomic.
 */
export async function computeSlots(
  serviceId: string,
  staffId: string,
  date: string,
  client: DbLike = db as PrismaClient
): Promise<Slot[]> {
  const service = await client.service.findUnique({ where: { id: serviceId } });
  if (!service || !service.active) return [];

  const setting = await client.setting.findUnique({ where: { id: "main" } });
  if (!setting) return [];

  const openMin = setting.openMin;
  const closeMin = setting.closeMin;
  const step = Math.max(5, setting.slotStepMin);
  const closedDays = setting.closedDays.split(",").filter(Boolean);
  const weekday = weekdayOf(date);

  if (closedDays.includes(String(weekday))) return [];

  // eligible staff
  const links = await client.serviceStaff.findMany({
    where: { serviceId },
    include: { staff: true },
  });
  let eligible = links.map((l) => l.staff).filter((st) => st.active);
  if (staffId !== "any") eligible = eligible.filter((st) => st.id === staffId);
  // must be working that weekday
  eligible = eligible.filter((st) =>
    st.workingDays.split(",").map(Number).includes(weekday)
  );
  if (eligible.length === 0) return [];

  // busy windows per staff
  const appts = await client.appointment.findMany({
    where: { date, staffId: { in: eligible.map((s) => s.id) }, status: { in: OPEN_STATUSES } },
    select: { staffId: true, startMin: true, endMin: true },
  });

  const dur = service.durationMin;
  // booking cutoff runs on the SALON's clock, not the server's (Vercel = UTC)
  const now = salonClock(setting.timeZone);
  const isToday = date === now.date;
  const cutoff = isToday ? now.min + 30 : -1; // 30 min lead time

  const slots: Slot[] = [];
  for (let t = openMin; t + dur <= closeMin; t += step) {
    if (t <= cutoff) {
      slots.push({ min: t, label: minToLabel(t), available: false });
      continue;
    }
    let free = false;
    for (const st of eligible) {
      if (t < st.shiftStartMin || t + dur > st.shiftEndMin) continue;
      const clash = appts.some(
        (a) => a.staffId === st.id && overlaps(t, t + dur, a.startMin, a.endMin)
      );
      if (!clash) { free = true; break; }
    }
    slots.push({ min: t, label: minToLabel(t), available: free });
  }
  return slots;
}

/** Verify one concrete slot is bookable (used before creating an appointment). */
export async function isSlotBookable(
  serviceId: string,
  staffId: string,
  date: string,
  startMin: number,
  client: DbLike = db as PrismaClient
): Promise<boolean> {
  const slots = await computeSlots(serviceId, staffId, date, client);
  const slot = slots.find((s) => s.min === startMin);
  return !!slot?.available;
}

/**
 * First specialist who is actually free at this exact slot — the correct
 * resolution for "any". Order of preference follows the staff sort order.
 */
export async function firstFreeStaff(
  serviceId: string,
  date: string,
  startMin: number,
  client: DbLike = db as PrismaClient
): Promise<string | null> {
  const links = await client.serviceStaff.findMany({
    where: { serviceId },
    include: { staff: true },
  });
  const weekday = weekdayOf(date);
  const candidates = links
    .map((l) => l.staff)
    .filter((st) => st.active && st.workingDays.split(",").map(Number).includes(weekday))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  for (const st of candidates) {
    if (await isSlotBookable(serviceId, st.id, date, startMin, client)) return st.id;
  }
  return null;
}
