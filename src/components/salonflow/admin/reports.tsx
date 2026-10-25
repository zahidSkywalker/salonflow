"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { money, SectionTitle, initials } from "../shared";

interface ReportData {
  days: number;
  totals: { revenue: number; sales: number; avgTicket: number; newCustomers: number; appointments: number };
  revenueByDay: { date: string; revenue: number }[];
  revenueByCategory: { category: string; revenue: number }[];
  topServices: { name: string; revenue: number; count: number }[];
  staffPerformance: { name: string; revenue: number; commission: number }[];
  paymentSplit: { method: string; amount: number }[];
}

const PIE_COLORS = ["#b76e79", "#c9a227", "#7e9680", "#a98467", "#d4a5a5", "#8a7a6d"];
const METHOD_LABEL: Record<string, string> = { CASH: "Cash", CARD: "Card", MOBILE: "Mobile" };

export default function Reports({ currencySymbol }: { currencySymbol: string }) {
  const [days, setDays] = useState("30");

  const { data, isLoading } = useQuery<ReportData>({
    queryKey: ["reports", days],
    queryFn: async () => {
      const res = await fetch(`/api/admin/reports?days=${days}`);
      if (!res.ok) throw new Error("Failed to load reports");
      return res.json();
    },
  });

  const cs = currencySymbol;

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
        <div className="grid lg:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  const trend = data.revenueByDay.map((p) => ({
    label: new Date(`${p.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    revenue: p.revenue / 100,
  }));
  const cats = data.revenueByCategory.map((c) => ({ ...c, revenue: c.revenue / 100 }));
  const methods = data.paymentSplit
    .filter((m) => m.amount > 0)
    .map((m) => ({ name: METHOD_LABEL[m.method] ?? m.method, value: m.amount / 100 }));
  const staffBars = data.staffPerformance.slice(0, 6).map((s) => ({
    name: s.name.split(" ")[0],
    revenue: s.revenue / 100,
    commission: s.commission / 100,
  }));

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Reports"
        sub="Where the money comes from — and who earns it."
        right={
          <Tabs value={days} onValueChange={setDays}>
            <TabsList>
              <TabsTrigger value="7">7d</TabsTrigger>
              <TabsTrigger value="30">30d</TabsTrigger>
              <TabsTrigger value="90">90d</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: "Revenue", value: money(data.totals.revenue, cs), sub: `${data.totals.sales} sales` },
          { label: "Avg ticket", value: money(data.totals.avgTicket, cs), sub: "per sale" },
          { label: "Appointments", value: String(data.totals.appointments), sub: "booked in period" },
          { label: "New guests", value: String(data.totals.newCustomers), sub: "first-timers" },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="pt-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">{k.label}</p>
              <p className="font-display text-3xl font-bold mt-1.5">{k.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{k.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="font-display text-lg">Revenue trend</CardTitle></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="rep-rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#b76e79" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#b76e79" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e9dfd4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8a7a6d" }} tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(trend.length / 8) - 1)} />
              <YAxis tick={{ fontSize: 11, fill: "#8a7a6d" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${cs}${v}`} width={56} />
              <Tooltip formatter={(v: number) => [`${cs}${v.toLocaleString()}`, "Revenue"]} contentStyle={{ borderRadius: 12, border: "1px solid #e9dfd4", background: "#fffdfb" }} />
              <Area type="monotone" dataKey="revenue" stroke="#b76e79" strokeWidth={2} fill="url(#rep-rev)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="font-display text-lg">Revenue by category</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={cats} dataKey="revenue" nameKey="category" innerRadius={55} outerRadius={90} paddingAngle={3}>
                  {cats.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => `${cs}${v.toLocaleString()}`} contentStyle={{ borderRadius: 12, border: "1px solid #e9dfd4", background: "#fffdfb" }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-display text-lg">Payment methods</CardTitle></CardHeader>
          <CardContent className="h-64">
            {methods.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center pt-20">No payments in this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={methods} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                    {methods.map((_, i) => <Cell key={i} fill={PIE_COLORS[(i + 2) % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${cs}${v.toLocaleString()}`} contentStyle={{ borderRadius: 12, border: "1px solid #e9dfd4", background: "#fffdfb" }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="font-display text-lg">Top services</CardTitle></CardHeader>
          <CardContent className="space-y-2.5">
            {data.topServices.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No service sales yet.</p>}
            {data.topServices.map((s, i) => {
              const max = data.topServices[0]?.revenue || 1;
              return (
                <div key={s.name} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-secondary text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium truncate pr-2">{s.name}</span>
                      <span className="text-muted-foreground whitespace-nowrap">{money(s.revenue, cs)} · {s.count}×</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full mt-1.5 overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${(s.revenue / max) * 100}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-display text-lg">Staff performance &amp; commissions</CardTitle></CardHeader>
          <CardContent className="h-72">
            {staffBars.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center pt-20">No staff-linked sales yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={staffBars} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e9dfd4" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#8a7a6d" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#8a7a6d" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${cs}${v}`} width={56} />
                  <Tooltip formatter={(v: number) => `${cs}${v.toLocaleString()}`} contentStyle={{ borderRadius: 12, border: "1px solid #e9dfd4", background: "#fffdfb" }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenue" name="Service revenue" fill="#b76e79" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="commission" name="Commission" fill="#c9a227" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
          {data.staffPerformance.length > 0 && (
            <CardContent className="pt-0 flex flex-wrap gap-2">
              {data.staffPerformance.map((s) => (
                <span key={s.name} className="inline-flex items-center gap-1.5 rounded-full bg-secondary/60 px-3 py-1 text-xs">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[9px] font-bold">{initials(s.name)}</span>
                  {s.name}: {money(s.commission, cs)} earned
                </span>
              ))}
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
