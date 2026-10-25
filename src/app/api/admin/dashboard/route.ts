import { NextRequest } from "next/server";
import { db, dbReady } from "@/lib/db";
import { ok, requireAdmin } from "@/lib/salonflow/auth";
import { salonClock, salonDaysAgo, minToLabel, weekdayOf } from "@/lib/salonflow/time";

/** Row colors for the day grid — kept in sync with the UI palette. */
const STAFF_COLORS = ["#b76e79", "#7e9680", "#c9a227", "#a98467", "#8d7b9e", "#5f8a8b"];

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  await dbReady;

  const date = todayStr();
  const setting = await db.setting.findUnique({ where: { id: "main" } });
  const nm = nowMin();

  const [allAppts, daySales, fortnightSales, pendingRaw, lowStockRaw, staffAll, topSvcRaw] =
    await Promise.all([
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
        where: { createdAt: { gte: new Date(`${date}T00:00:00`), lte: new Date(`${date}T23:59:59`) } },
        select: { subtotal: true, discount: true, tip: true, total: true, method: true },
      }),
      db.sale.findMany({
        where: { createdAt: { gte: new Date(`${daysAgoStr(-13)}T00:00:00`) } },
        select: { subtotal: true, discount: true, createdAt: true },
      }),
      db.appointment.findMany({
        where: { status: "PENDING", date: { gte: date } },
        include: {
          customer: { select: { name: true } },
          staff: { select: { name: true } },
          service: { select: { name: true } },
        },
        orderBy: [{ date: "asc" }, { startMin: "asc" }],
        take: 5,
      }),
      db.product.findMany({
        where: { active: true },
        orderBy: { stock: "asc" },
        take: 6,
      }),
      db.staff.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
      db.$queryRaw<{ name: string; c: number; rev: number }[]>`
        SELECT json_extract(s.items, '$[0].name') as name, COUNT(*) as c, SUM(s.subtotal - s.discount) as rev
        FROM Sale s
        WHERE s.createdAt >= ${new Date(`${daysAgoStr(-6)}T00:00:00`)}
          AND json_extract(s.items, '$[0].kind') = 'service'
        GROUP BY name ORDER BY rev DESC LIMIT 5
      `,
    ]);

  // staff working today, with a grid color each
  const wd = weekdayOf(date);
  const workingStaff = staffAll
    .filter((st) => st.workingDays.split(",").map(Number).includes(wd))
    .map((st, i) => ({
      id: st.id,
      name: st.name,
      title: st.title,
      imageUrl: st.imageUrl,
      shiftStartMin: st.shiftStartMin,
      shiftEndMin: st.shiftEndMin,
      color: STAFF_COLORS[i % STAFF_COLORS.length],
    }));

  const schedule = allAppts.map((a) => ({
    id: a.id, ref: a.ref, staffId: a.staffId, startMin: a.startMin, endMin: a.endMin,
    timeLabel: `${minToLabel(a.startMin)}–${minToLabel(a.endMin)}`,
    status: a.status, source: a.source, notes: a.notes,
    customer: a.customer, staff: a.staff, service: a.service,
  }));

  // ── money: revenue excludes tips, collected includes them ──────────────
  const revenueToday = daySales.reduce((a, s) => a + s.subtotal - s.discount, 0);
  const tipsToday = daySales.reduce((a, s) => a + s.tip, 0);
  const collectedToday = daySales.reduce((a, s) => a + s.total, 0);
  const expectedRevenue = allAppts
    .filter((a) => a.status === "CONFIRMED" || a.status === "COMPLETED")
    .reduce((a, x) => a + x.service.price, 0);

  const split = { CASH: 0, CARD: 0, MOBILE: 0 };
  for (const s of daySales) split[s.method as keyof typeof split] = (split[s.method as keyof typeof split] ?? 0) + s.total;

  // 14-day series (net revenue, tips excluded)
  const byDay = new Map<string, number>();
  for (const s of fortnightSales) {
    const d = new Date(s.createdAt);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    byDay.set(iso, (byDay.get(iso) ?? 0) + s.subtotal - s.discount);
  }
  const revenueSeries = Array.from({ length: 14 }, (_, i) => {
    const d = daysAgoStr(-13 + i);
    return { date: d, revenue: byDay.get(d) ?? 0 };
  });

  const thisWeek = revenueSeries.slice(7).reduce((a, p) => a + p.revenue, 0);
  const lastWeek = revenueSeries.slice(0, 7).reduce((a, p) => a + p.revenue, 0);
  const weekDelta = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;

  // occupancy
  const openMinutes = (setting?.closeMin ?? 1140) - (setting?.openMin ?? 540);
  const capacity = Math.max(1, workingStaff.length * openMinutes);
  const bookedMinutes = allAppts
    .filter((a) => a.status !== "CANCELLED" && a.status !== "NO_SHOW")
    .reduce((a, x) => a + x.service.durationMin, 0);

  const lowStock = lowStockRaw
    .filter((p) => p.stock <= p.lowStockAt)
    .map((p) => ({ id: p.id, name: p.name, brand: p.brand, stock: p.stock, lowStockAt: p.lowStockAt }));

  return ok({
    date,
    salonName: setting?.salonName,
    currencySymbol: setting?.currencySymbol ?? "$",
    openMin: setting?.openMin ?? 540,
    closeMin: setting?.closeMin ?? 1140,
    nowMin: nm,
    greeting: nm < 720 ? "Good morning" : nm < 1020 ? "Good afternoon" : "Good evening",
    staff: workingStaff,
    schedule,
    pending: pendingRaw.map((a) => ({
      id: a.id, ref: a.ref, date: a.date, startMin: a.startMin,
      customerName: a.customer.name, staffName: a.staff.name, serviceName: a.service.name,
    })),
    metrics: {
      revenueToday,
      tipsToday,
      collectedToday,
      expectedRevenue,
      salesCount: daySales.length,
      paymentSplit: split,
      occupancyPct: Math.min(100, Math.round((bookedMinutes / capacity) * 100)),
      totalAppointments: allAppts.length,
      completedCount: allAppts.filter((a) => a.status === "COMPLETED").length,
      noShowCount: allAppts.filter((a) => a.status === "NO_SHOW").length,
      weekDelta,
      clientCount: await db.customer.count(),
    },
    revenueSeries,
    topServices7d: topSvcRaw.map((r) => ({ name: String(r.name), count: Number(r.c), revenue: Number(r.rev) })),
    lowStock,
  });
}
