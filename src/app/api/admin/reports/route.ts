import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, requireAdmin } from "@/lib/salonflow/auth";
import { daysAgoStr, parseItems } from "@/lib/salonflow/time";

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const days = Math.min(180, Math.max(7, Number(searchParams.get("days") ?? 30)));
  const from = daysAgoStr(-(days - 1));

  const [sales, services, newCustomers, apptAgg] = await Promise.all([
    db.sale.findMany({
      where: { createdAt: { gte: new Date(`${from}T00:00:00`) } },
      include: { staff: { select: { id: true, name: true, title: true, commissionPct: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.service.findMany({ select: { id: true, name: true, category: true } }),
    db.customer.count({ where: { createdAt: { gte: new Date(`${from}T00:00:00`) } } }),
    db.appointment.groupBy({ by: ["status"], where: { date: { gte: from } }, _count: true }),
  ]);

  const svcMap = new Map(services.map((s) => [s.id, s]));

  /* revenue by day (net of discounts, tips excluded) */
  const byDay = new Map<string, number>();
  for (const s of sales) {
    const d = new Date(s.createdAt);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    byDay.set(iso, (byDay.get(iso) ?? 0) + s.subtotal - s.discount);
  }
  const revenueByDay: { date: string; revenue: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = daysAgoStr(-i);
    revenueByDay.push({ date: d, revenue: byDay.get(d) ?? 0 });
  }

  /* item-level aggregates */
  const catMap = new Map<string, number>();
  const svcAgg = new Map<string, { name: string; category: string; revenue: number; count: number }>();
  const staffAgg = new Map<string, {
    name: string; title: string; serviceRevenue: number; retailRevenue: number;
    services: number; tips: number; commission: number; sales: number;
  }>();
  const methodAgg: Record<string, number> = { CASH: 0, CARD: 0, MOBILE: 0 };

  let revenue = 0, tips = 0, discounts = 0, serviceCount = 0, retailCount = 0, retailRevenue = 0;

  for (const sale of sales) {
    const net = sale.subtotal - sale.discount;
    revenue += net;
    tips += sale.tip;
    discounts += sale.discount;
    methodAgg[sale.method] = (methodAgg[sale.method] ?? 0) + sale.total;

    const items = parseItems(sale.items);
    for (const it of items) {
      const line = it.price * it.qty;
      if (it.kind === "service") {
        serviceCount += it.qty;
        const svc = svcMap.get(it.id);
        const cat = svc?.category ?? "Other";
        catMap.set(cat, (catMap.get(cat) ?? 0) + line);
        const agg = svcAgg.get(it.id) ?? { name: it.name, category: cat, revenue: 0, count: 0 };
        agg.revenue += line;
        agg.count += it.qty;
        svcAgg.set(it.id, agg);
      } else {
        retailCount += it.qty;
        retailRevenue += line;
      }
    }

    const staffKey = sale.staff?.id ?? "desk";
    const st = staffAgg.get(staffKey) ?? {
      name: sale.staff?.name ?? "Front desk", title: sale.staff?.title ?? "Reception",
      serviceRevenue: 0, retailRevenue: 0, services: 0, tips: 0, commission: 0, sales: 0,
    };
    const serviceLine = items.filter((i) => i.kind === "service").reduce((a, i) => a + i.price * i.qty, 0);
    const retailLine = items.filter((i) => i.kind === "product").reduce((a, i) => a + i.price * i.qty, 0);
    st.serviceRevenue += serviceLine;
    st.retailRevenue += retailLine;
    st.services += items.filter((i) => i.kind === "service").reduce((a, i) => a + i.qty, 0);
    st.tips += sale.tip;
    st.sales += 1;
    if (sale.staff && sale.staff.commissionPct > 0 && serviceLine > 0) {
      st.commission += Math.round((serviceLine * sale.staff.commissionPct) / 100);
    }
    staffAgg.set(staffKey, st);
  }

  const apptStatuses = Object.fromEntries(apptAgg.map((a) => [a.status, a._count]));
  const apptTotal = apptAgg.reduce((a, x) => a + x._count, 0);
  const noShowRate = apptTotal > 0 ? Math.round(((apptStatuses.NO_SHOW ?? 0) / apptTotal) * 1000) / 10 : 0;

  return ok({
    days,
    totals: {
      revenue,
      tips,
      discounts,
      retailRevenue,
      sales: sales.length,
      avgTicket: sales.length ? Math.round(revenue / sales.length) : 0,
      serviceCount,
      retailCount,
      newCustomers,
      appointments: apptTotal,
      noShowRate,
    },
    revenueByDay,
    revenueByCategory: [...catMap.entries()].map(([category, rev]) => ({ category, revenue: rev })).sort((a, b) => b.revenue - a.revenue),
    topServices: [...svcAgg.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8),
    staffPerformance: [...staffAgg.values()].sort((a, b) => b.serviceRevenue - a.serviceRevenue),
    paymentSplit: Object.entries(methodAgg).map(([method, amount]) => ({ method, amount })),
  });
}
