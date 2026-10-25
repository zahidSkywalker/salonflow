import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, requireAdmin } from "@/lib/salonflow/auth";
import { daysAgoStr, parseItems } from "@/lib/salonflow/time";

// DB-driven: never prerender at build time.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const days = Math.min(180, Math.max(7, Number(searchParams.get("days") ?? 30)));

  const from = daysAgoStr(-(days - 1));
  const [sales, services, newCustomers, apptCount] = await Promise.all([
    db.sale.findMany({
      where: { createdAt: { gte: new Date(`${from}T00:00:00`) } },
      include: { staff: { select: { id: true, name: true, commissionPct: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.service.findMany({ select: { id: true, name: true, category: true } }),
    db.customer.count({
      where: { createdAt: { gte: new Date(`${from}T00:00:00`) } },
    }),
    db.appointment.count({
      where: { createdAt: { gte: new Date(`${from}T00:00:00`) } },
    }),
  ]);

  const svcMap = new Map(services.map((s) => [s.id, s]));

  // revenue by day
  const byDay = new Map<string, number>();
  for (const s of sales) {
    const d = new Date(s.createdAt);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    byDay.set(iso, (byDay.get(iso) ?? 0) + s.total);
  }
  const revenueByDay: { date: string; revenue: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = daysAgoStr(-i);
    revenueByDay.push({ date: d, revenue: byDay.get(d) ?? 0 });
  }

  // category + service + staff commission aggregates
  const catMap = new Map<string, number>();
  const svcAgg = new Map<string, { name: string; revenue: number; count: number }>();
  const staffAgg = new Map<string, { name: string; revenue: number; commission: number }>();
  const methodAgg: Record<string, number> = { CASH: 0, CARD: 0, MOBILE: 0 };
  let totalRevenue = 0;

  for (const sale of sales) {
    totalRevenue += sale.total;
    methodAgg[sale.method] = (methodAgg[sale.method] ?? 0) + sale.total;

    const items = parseItems(sale.items);
    for (const it of items) {
      const lineRevenue = it.price * it.qty;
      if (it.kind === "service") {
        const cat = svcMap.get(it.id)?.category ?? "Other";
        catMap.set(cat, (catMap.get(cat) ?? 0) + lineRevenue);
        const agg = svcAgg.get(it.id) ?? { name: it.name, revenue: 0, count: 0 };
        agg.revenue += lineRevenue;
        agg.count += it.qty;
        svcAgg.set(it.id, agg);
      }
    }
    if (sale.staff && sale.staff.commissionPct > 0) {
      const serviceRevenue = items
        .filter((i) => i.kind === "service")
        .reduce((a, i) => a + i.price * i.qty, 0);
      if (serviceRevenue > 0) {
        const agg = staffAgg.get(sale.staff.id) ?? {
          name: sale.staff.name, revenue: 0, commission: 0,
        };
        agg.revenue += serviceRevenue;
        agg.commission += Math.round((serviceRevenue * sale.staff.commissionPct) / 100);
        staffAgg.set(sale.staff.id, agg);
      }
    }
  }

  const revenueByCategory = [...catMap.entries()]
    .map(([category, revenue]) => ({ category, revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  const topServices = [...svcAgg.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 6);

  const staffPerformance = [...staffAgg.values()].sort((a, b) => b.revenue - a.revenue);

  return ok({
    days,
    totals: {
      revenue: totalRevenue,
      sales: sales.length,
      avgTicket: sales.length ? Math.round(totalRevenue / sales.length) : 0,
      newCustomers,
      appointments: apptCount,
    },
    revenueByDay,
    revenueByCategory,
    topServices,
    staffPerformance,
    paymentSplit: Object.entries(methodAgg).map(([method, amount]) => ({ method, amount })),
  });
}