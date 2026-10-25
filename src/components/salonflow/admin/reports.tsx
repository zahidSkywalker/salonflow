"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { money, prettyDate } from "../shared";
import { cn } from "@/lib/utils";
import { Download } from "lucide-react";

interface ReportData {
  days: number;
  totals: {
    revenue: number; tips: number; discounts: number; retailRevenue: number;
    sales: number; avgTicket: number; serviceCount: number; retailCount: number;
    newCustomers: number; appointments: number; noShowRate: number;
  };
  revenueByDay: { date: string; revenue: number }[];
  revenueByCategory: { category: string; revenue: number }[];
  topServices: { name: string; category: string; revenue: number; count: number }[];
  staffPerformance: {
    name: string; title: string; serviceRevenue: number; retailRevenue: number;
    services: number; tips: number; commission: number; sales: number;
  }[];
  paymentSplit: { method: string; amount: number }[];
}

const METHOD_LABEL: Record<string, string> = { CASH: "Cash", CARD: "Card", MOBILE: "Mobile" };
const METHOD_COLOR: Record<string, string> = { CASH: "#7e9680", CARD: "#b76e79", MOBILE: "#c9a227" };

export default function Reports({ currencySymbol }: { currencySymbol: string }) {
  const cs = currencySymbol;
  const [range, setRange] = useState(30);

  const { data, isLoading } = useQuery<ReportData>({
    queryKey: ["reports", range],
    queryFn: async () => {
      const res = await fetch(`/api/admin/reports?days=${range}`);
      if (!res.ok) throw new Error("Failed to load reports");
      return res.json();
    },
  });

  const exportCsv = () => {
    if (!data) return;
    const lines = [
      "date,revenue",
      ...data.revenueByDay.map((d) => `${d.date},${(d.revenue / 100).toFixed(2)}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aurelia-revenue-${data.days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading || !data) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-9 w-64" />
        </div>
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid lg:grid-cols-3 gap-5">
          <Skeleton className="h-72 lg:col-span-2 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  const t = data.totals;
  const maxDay = Math.max(1, ...data.revenueByDay.map((d) => d.revenue));
  const catTotal = Math.max(1, data.revenueByCategory.reduce((a, c) => a + c.revenue, 0));
  const payTotal = Math.max(1, data.paymentSplit.reduce((a, p) => a + p.amount, 0));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Reports</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {prettyDate(data.revenueByDay[0]?.date ?? "")} – {prettyDate(data.revenueByDay[data.revenueByDay.length - 1]?.date ?? "")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border p-0.5 gap-0.5">
            {[7, 30, 90].map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  range === r ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {r}d
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="w-3.5 h-3.5 mr-1.5" />CSV
          </Button>
        </div>
      </div>

      {/* headline strip — asymmetric on purpose */}
      <Card>
        <CardContent className="p-5 flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Revenue</p>
            <p className="font-display text-4xl font-medium tabular-nums mt-1">{money(t.revenue, cs)}</p>
            <p className="text-xs text-muted-foreground mt-1">before {money(t.tips, cs)} in tips</p>
          </div>
          <HeadStat label="Average ticket" value={money(t.avgTicket, cs)} sub={`${t.sales} receipts`} />
          <HeadStat label="Services sold" value={t.serviceCount.toLocaleString()} sub={money(t.revenue - t.retailRevenue, cs)} />
          <HeadStat label="Retail sold" value={t.retailCount.toLocaleString()} sub={money(t.retailRevenue, cs)} />
          <HeadStat label="No-show rate" value={`${t.noShowRate}%`} sub={`${t.appointments} appointments`} />
          <HeadStat label="New clients" value={t.newCustomers.toLocaleString()} sub="first visits" />
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-5 items-start">
        {/* daily revenue */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-0">
            <CardTitle className="font-display text-lg">Revenue, day by day</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-[2px] h-44">
              {data.revenueByDay.map((d) => {
                const h = Math.max(2, (d.revenue / maxDay) * 100);
                const weekend = [0, 6].includes(new Date(`${d.date}T12:00:00`).getDay());
                return (
                  <div
                    key={d.date}
                    className="flex-1 min-w-0 flex flex-col"
                    title={`${prettyDate(d.date)} · ${money(d.revenue, cs)}`}
                  >
                    <div className="flex-1 flex items-end">
                      <div
                        className={cn(
                          "w-full rounded-t-[3px] transition-colors",
                          weekend ? "bg-[#b76e79]" : "bg-[#ded3c6] hover:bg-[#cbb8a5]"
                        )}
                        style={{ height: `${h}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
              <span>{data.revenueByDay[0]?.date.slice(5)}</span>
              <span>{data.revenueByDay[data.revenueByDay.length - 1]?.date.slice(5)}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              <span className="inline-block w-2 h-2 rounded-sm bg-[#b76e79] align-middle mr-1" />
              weekends · hover a bar for the day&apos;s total
            </p>
          </CardContent>
        </Card>

        {/* payment mix + categories */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-lg">How guests paid</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {data.paymentSplit.map((p) => (
                <div key={p.method} className="flex items-center gap-2 text-sm">
                  <span className="w-14 text-muted-foreground">{METHOD_LABEL[p.method] ?? p.method}</span>
                  <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(p.amount / payTotal) * 100}%`, background: METHOD_COLOR[p.method] ?? "#a98467" }}
                    />
                  </div>
                  <span className="tabular-nums text-xs text-muted-foreground w-20 text-right">{money(p.amount, cs)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-lg">By department</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {data.revenueByCategory.map((c) => (
                <div key={c.category}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span>{c.category}</span>
                    <span className="text-muted-foreground tabular-nums text-xs">{money(c.revenue, cs)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary mt-1 overflow-hidden">
                    <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.max(3, (c.revenue / catTotal) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* staff payouts */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-lg">The team &amp; the till</CardTitle>
          <p className="text-xs text-muted-foreground">
            Commission is a share of service revenue only — tips already went home in their pocket.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b">
                  <th className="pb-2 font-medium">Specialist</th>
                  <th className="pb-2 font-medium text-right">Services</th>
                  <th className="pb-2 font-medium text-right">Service revenue</th>
                  <th className="pb-2 font-medium text-right">Retail</th>
                  <th className="pb-2 font-medium text-right">Tips</th>
                  <th className="pb-2 font-medium text-right">Commission owed</th>
                </tr>
              </thead>
              <tbody>
                {data.staffPerformance.map((s) => (
                  <tr key={s.name} className="border-b last:border-0">
                    <td className="py-2.5">
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.title}</p>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{s.services}</td>
                    <td className="py-2.5 text-right tabular-nums">{money(s.serviceRevenue, cs)}</td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">{money(s.retailRevenue, cs)}</td>
                    <td className="py-2.5 text-right tabular-nums text-emerald-800">{money(s.tips, cs)}</td>
                    <td className="py-2.5 text-right tabular-nums font-semibold">{money(s.commission, cs)}</td>
                  </tr>
                ))}
                {data.staffPerformance.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No sales in this window yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* top services */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-lg">Busiest services</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2.5">
            {data.topServices.map((s, i) => (
              <div key={s.name} className="flex items-center gap-3 text-sm">
                <span className="font-mono text-xs text-muted-foreground w-5">{String(i + 1).padStart(2, "0")}</span>
                <div className="flex-1 min-w-0">
                  <p className="truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.category} · {s.count}×</p>
                </div>
                <span className="tabular-nums">{money(s.revenue, cs)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function HeadStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="font-display text-2xl font-medium tabular-nums mt-1">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}
