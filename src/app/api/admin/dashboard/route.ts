import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, requireAdmin } from "@/lib/salonflow/auth";
import { daysAgoStr, minToLabel, todayStr, weekdayOf } from "@/lib/salonflow/time";

// DB-driven: never prerender at build time.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") ?? todayStr();

  const setting = await db.setting.findUnique({ where: { id: "main" } });
  const [appts, daySales, monthSales, customers] = await Promise.all([
    db.appointment.findMany({
      where: { date },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        staff: { select: { id: true, name: true } },
        service: { select: { id: true, name: true, price: true, durationMin: true, category: true } },
      },
      orderBy: { startMin: "asc" },
    }),
    db.sale.findMany({
      where: {
        createdAt: {
          gte: new Date(`${date}T00:00:00`),
          lte: new Date(`${date}T23:59:59`),
        },
      },
      select: { total: true, method: true },
    }),
    db.sale.findMany({
      where: { createdAt: { gte: new Date(`${daysAgoStr(-29)}T00:00:00`) } },
      select: { total: true, createdAt: true },
    }),
    db.customer.count(),
  ]);

  // 30-day revenue series
  const byDay = new Map<string, number>();
  for (const s of monthSales) {
    const key = new Date(s.createdAt);
    const iso = `${key.getFullYear()}-${String(key.getMonth() + 1).padStart(2, "0")}-${String(key.getDate()).padStart(2, "0")}`;
    byDay.set(iso, (byDay.get(iso) ?? 0) + s.total);
  }
  const series: { date: string; revenue: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = daysAgoStr(-i);
    series.push({ date: d, revenue: byDay.get(d) ?? 0 });
  }

  const statusCount = {
    CONFIRMED: appts.filter((a) => a.status === "CONFIRMED").length,
    PENDING: appts.filter((a) => a.status === "PENDING").length,
    COMPLETED: appts.filter((a) => a.status === "COMPLETED").length,
    CANCELLED: appts.filter((a) => a.status === "CANCELLED").length,
    NO_SHOW: appts.filter((a) => a.status === "NO_SHOW").length,
  };

  const revenueToday = daySales.reduce((a, s) => a + s.total, 0);
  const expectedRevenue = appts
    .filter((a) => a.status === "CONFIRMED" || a.status === "COMPLETED")
    .reduce((a, x) => a + x.service.price, 0);

  // occupancy: booked chair-minutes / available chair-minutes
  const workingStaff = (await db.staff.findMany({ where: { active: true } })).filter((st) =>
    st.workingDays.split(",").map(Number).includes(weekdayOf(date))
  );
  const openMinutes = (setting?.closeMin ?? 1140) - (setting?.openMin ?? 540);
  const capacity = Math.max(1, workingStaff.length * openMinutes);
  const bookedMinutes = appts
    .filter((a) => a.status !== "CANCELLED" && a.status !== "NO_SHOW")
    .reduce((a, x) => a + (x.service.durationMin ?? 0), 0);

  return ok({
    date,
    salonName: setting?.salonName,
    currencySymbol: setting?.currencySymbol ?? "$",
    openMin: setting?.openMin ?? 540,
    closeMin: setting?.closeMin ?? 1140,
    schedule: appts.map((a) => ({
      id: a.id, ref: a.ref, startMin: a.startMin, endMin: a.endMin,
      timeLabel: `${minToLabel(a.startMin)}–${minToLabel(a.endMin)}`,
      status: a.status, source: a.source, notes: a.notes,
      customer: a.customer, staff: a.staff, service: a.service,
    })),
    statusCount,
    revenueToday,
    expectedRevenue,
    paymentSplit: {
      CASH: daySales.filter((s) => s.method === "CASH").reduce((a, s) => a + s.total, 0),
      CARD: daySales.filter((s) => s.method === "CARD").reduce((a, s) => a + s.total, 0),
      MOBILE: daySales.filter((s) => s.method === "MOBILE").reduce((a, s) => a + s.total, 0),
    },
    revenueSeries: series,
    occupancyPct: Math.min(100, Math.round((bookedMinutes / capacity) * 100)),
    totalCustomers: customers,
    workingStaffCount: workingStaff.length,
  });
}