"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, money, SectionTitle, prettyDate } from "../shared";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarCheck, Wallet, TrendingUp, Users, Clock, Plus, ShoppingBag,
  CheckCircle2, XCircle, UserX,
} from "lucide-react";

interface DashData {
  date: string;
  salonName: string;
  currencySymbol: string;
  openMin: number;
  closeMin: number;
  schedule: {
    id: string; ref: string; timeLabel: string; status: string; source: string;
    customer: { name: string; phone: string };
    staff: { name: string };
    service: { name: string; price: number; durationMin: number };
  }[];
  statusCount: Record<string, number>;
  revenueToday: number;
  expectedRevenue: number;
  paymentSplit: Record<string, number>;
  revenueSeries: { date: string; revenue: number }[];
  occupancyPct: number;
  totalCustomers: number;
  workingStaffCount: number;
}

type ViewKey = "dashboard" | "appointments" | "pos" | "customers" | "services" | "staff" | "reports" | "settings";

export default function Dashboard({ currencySymbol, onNavigate }: { currencySymbol: string; onNavigate: (v: ViewKey) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [actingId, setActingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<DashData>({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/admin/dashboard");
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const setStatus = async (id: string, status: string) => {
    setActingId(id);
    try {
      const res = await fetch(`/api/admin/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast({ title: status === "COMPLETED" ? "Marked completed" : status === "NO_SHOW" ? "Marked no-show" : "Cancelled" });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e) {
      toast({ title: "Could not update", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setActingId(null);
    }
  };

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const cs = currencySymbol;
  const chart = data.revenueSeries.map((p) => ({
    ...p,
    label: new Date(`${p.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    revenue: p.revenue / 100,
  }));

  const active = data.schedule.filter((a) => a.status === "CONFIRMED" || a.status === "PENDING");

  return (
    <div className="space-y-7">
      <SectionTitle
        title="Today at the salon"
        sub={`${prettyDate(data.date)} · ${data.workingStaffCount} specialists on the floor`}
        right={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => onNavigate("appointments")}>
              <Plus className="w-4 h-4 mr-1.5" />New appointment
            </Button>
            <Button size="sm" onClick={() => onNavigate("pos")}>
              <ShoppingBag className="w-4 h-4 mr-1.5" />Open POS
            </Button>
          </div>
        }
      />

      {/* stat cards */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Wallet className="w-3.5 h-3.5 text-primary" />Revenue today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-bold">{money(data.revenueToday, cs)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              booked: {money(data.expectedRevenue, cs)} · {data.paymentSplit.CARD + data.paymentSplit.CASH + data.paymentSplit.MOBILE > 0 ? `${Object.values(data.paymentSplit).filter((v) => v > 0).length} payment streams` : "no payments yet"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <CalendarCheck className="w-3.5 h-3.5 text-primary" />Appointments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-bold">{data.schedule.length}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {data.statusCount.CONFIRMED} confirmed · {data.statusCount.PENDING} pending · {data.statusCount.COMPLETED} done
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-primary" />Chair occupancy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-bold">{data.occupancyPct}%</p>
            <div className="h-1.5 rounded-full bg-secondary mt-2 overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${data.occupancyPct}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-primary" />Client book
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-bold">{data.totalCustomers}</p>
            <p className="text-xs text-muted-foreground mt-1">guests on record</p>
          </CardContent>
        </Card>
      </div>

      {/* 30-day revenue */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Revenue · last 30 days</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#b76e79" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#b76e79" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e9dfd4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8a7a6d" }} tickLine={false} axisLine={false} interval={4} />
              <YAxis tick={{ fontSize: 11, fill: "#8a7a6d" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${cs}${v}`} width={52} />
              <Tooltip
                formatter={(v: number) => [`${cs}${v.toLocaleString()}`, "Revenue"]}
                contentStyle={{ borderRadius: 12, border: "1px solid #e9dfd4", background: "#fffdfb" }}
              />
              <Area type="monotone" dataKey="revenue" stroke="#b76e79" strokeWidth={2} fill="url(#rev)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* today's schedule */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="font-display text-lg">Today&apos;s schedule</CardTitle>
          <Button size="sm" variant="ghost" onClick={() => onNavigate("appointments")}>Manage all</Button>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {data.schedule.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">A quiet day — no appointments yet.</p>
          )}
          {data.schedule.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 bg-card hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground w-28 shrink-0">
                <Clock className="w-3.5 h-3.5" />{a.timeLabel}
              </div>
              <div className="flex-1 min-w-40">
                <p className="font-medium text-sm leading-tight">{a.service.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {a.customer.name} · with {a.staff.name} · {money(a.service.price, cs)}
                  {a.source === "WALK_IN" && <span className="ml-2 text-[10px] uppercase tracking-wider text-primary">walk-in</span>}
                </p>
              </div>
              <StatusBadge status={a.status} />
              {(a.status === "CONFIRMED" || a.status === "PENDING") && (
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="h-8 text-emerald-700 border-emerald-200 hover:bg-emerald-50" disabled={actingId === a.id} onClick={() => setStatus(a.id, "COMPLETED")}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Done
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-red-700 border-red-200 hover:bg-red-50" disabled={actingId === a.id} onClick={() => setStatus(a.id, "NO_SHOW")}>
                    <UserX className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
          {active.length > 0 && (
            <p className="text-[11px] text-muted-foreground pt-1">
              Tip: finishing an appointment here takes it off the floor — charge it in the POS right after.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
