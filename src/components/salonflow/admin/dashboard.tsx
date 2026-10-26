"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { money, minToLabel, prettyDate } from "../shared";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import DayGrid, { useNowMin, type GridAppt, type GridStaff } from "./daygrid";
import {
  ShoppingBag, CalendarPlus, AlertTriangle, CheckCircle2, UserX,
  Banknote, CreditCard, Smartphone, ArrowRight, Package,
} from "lucide-react";

interface DashData {
  date: string;
  salonName: string;
  currencySymbol: string;
  openMin: number;
  closeMin: number;
  nowMin: number;
  greeting: string;
  staff: GridStaff[];
  schedule: (GridAppt & { ref: string; timeLabel: string; notes: string | null; staff: { id: string; name: string } })[];
  pending: {
    id: string; ref: string; date: string; startMin: number;
    customerName: string; staffName: string; serviceName: string;
  }[];
  metrics: {
    revenueToday: number;
    tipsToday: number;
    collectedToday: number;
    expectedRevenue: number;
    salesCount: number;
    paymentSplit: Record<string, number>;
    occupancyPct: number;
    totalAppointments: number;
    completedCount: number;
    noShowCount: number;
    weekDelta: number | null;
    clientCount: number;
  };
  revenueSeries: { date: string; revenue: number }[];
  topServices7d: { name: string; count: number; revenue: number }[];
  lowStock: { id: string; name: string; brand: string; stock: number; lowStockAt: number }[];
}

type ViewKey = "dashboard" | "appointments" | "pos" | "customers" | "services" | "retail" | "staff" | "reports" | "settings";

export default function Dashboard({ onNavigate }: { currencySymbol: string; onNavigate: (v: ViewKey) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // local ticking clock — only used for the first paint, before the server
  // payload arrives with the SALON's clock (see below)
  const tickNow = useNowMin(30_000);
  const [confirming, setConfirming] = useState<string | null>(null);

  const { data, isLoading } = useQuery<DashData>({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/admin/dashboard");
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  // "Right now" runs on the salon's clock — the server computes nowMin with
  // Setting.timeZone, so a demo viewed from another hemisphere still shows a
  // truthful board. The local tick only bridges the initial load.
  const nowMin = data?.nowMin ?? tickNow;

  const confirm = async (id: string) => {
    setConfirming(id);
    try {
      const res = await fetch(`/api/admin/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CONFIRMED" }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Booking confirmed", description: "The guest is locked in." });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch {
      toast({ title: "Could not confirm", variant: "destructive" });
    } finally {
      setConfirming(null);
    }
  };

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid lg:grid-cols-3 gap-5">
          <Skeleton className="h-[420px] rounded-2xl lg:col-span-2" />
          <div className="space-y-5">
            <Skeleton className="h-52 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  const cs = data.currencySymbol;
  const m = data.metrics;
  const inChair = data.schedule.filter((a) => a.startMin <= nowMin && a.endMin > nowMin && (a.status === "CONFIRMED" || a.status === "PENDING"));
  const nextUp = data.schedule
    .filter((a) => a.startMin > nowMin && (a.status === "CONFIRMED" || a.status === "PENDING"))
    .sort((a, b) => a.startMin - b.startMin)[0];

  return (
    <div className="space-y-6">
      {/* ── header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-medium tracking-tight">
            {data.greeting}. <span className="italic text-primary">The floor is yours.</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {prettyDate(data.date)} · {data.staff.length} specialist{data.staff.length === 1 ? "" : "s"} working ·{" "}
            {m.totalAppointments} in the book · {m.completedCount} already served
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onNavigate("appointments")}>
            <CalendarPlus className="w-4 h-4 mr-1.5" />New appointment
          </Button>
          <Button onClick={() => onNavigate("pos")}>
            <ShoppingBag className="w-4 h-4 mr-1.5" />Open register
          </Button>
        </div>
      </div>

      {/* ── right now strip ────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-[#2b211b] text-[#f3ece4] px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#b7a48f]">Right now</p>
          <p className="font-display text-2xl font-medium tabular-nums leading-tight">
            {minToLabel(nowMin)}
            <span className="text-sm text-[#b7a48f] font-sans ml-2">
              {nowMin < data.openMin ? `opens ${minToLabel(data.openMin)}` : nowMin > data.closeMin ? `closed ${minToLabel(data.closeMin)}` : `until ${minToLabel(data.closeMin)}`}
            </span>
          </p>
        </div>
        <div className="flex-1 min-w-56">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#b7a48f] mb-1">In the chairs</p>
          {inChair.length === 0 ? (
            <p className="text-sm text-[#d8cbbd]">
              {nextUp
                ? `Empty for ${Math.max(1, Math.floor((nextUp.startMin - nowMin) / 60)) ? `${Math.floor((nextUp.startMin - nowMin) / 60)}h ${((nextUp.startMin - nowMin) % 60)}m` : "a moment"} — next at ${minToLabel(nextUp.startMin)}`
                : "Quiet floor for the rest of the day"}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {inChair.map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full bg-[#43332a] px-2.5 py-1 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#e8a08e] animate-pulse" />
                  {a.staff.name} · {a.customer.name}
                  <span className="text-[#b7a48f]">till {minToLabel(a.endMin)}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        {nextUp && (
          <div className="min-w-48">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#b7a48f] mb-1">Next through the door</p>
            <p className="text-sm">
              <span className="font-mono tabular-nums">{minToLabel(nextUp.startMin)}</span>
              {" — "}
              {nextUp.customer.name}
              <span className="text-[#b7a48f]"> · {nextUp.service.name}</span>
            </p>
          </div>
        )}
      </div>

      {/* ── main grid ──────────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-5 items-start">
        {/* the floor */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <CardTitle className="font-display text-lg">The book · {prettyDate(data.date)}</CardTitle>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <Legend className="bg-[#b76e79]" label="Confirmed" />
              <Legend className="bg-[#c9a227]/40 border border-dashed border-[#c9a227]" label="Pending" />
              <Legend className="bg-[#ded3c6]" label="Done" />
              <Legend className="bg-[#f6dedd]" label="No-show" />
            </div>
          </CardHeader>
          <CardContent>
            <DayGrid
              staff={data.staff}
              appointments={data.schedule}
              openMin={data.openMin}
              closeMin={data.closeMin}
              nowMin={nowMin}
              currencySymbol={cs}
            />
          </CardContent>
        </Card>

        {/* right rail */}
        <div className="space-y-5">
          {/* today's money */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Today&apos;s register</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline justify-between">
                <p className="font-display text-4xl font-medium tabular-nums">{money(m.collectedToday, cs)}</p>
                <span className="text-xs text-muted-foreground">{m.salesCount} receipt{m.salesCount === 1 ? "" : "s"}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <MiniStat label="Revenue" value={money(m.revenueToday, cs)} />
                <MiniStat label="Tips" value={money(m.tipsToday, cs)} />
                <MiniStat label="Booked" value={money(m.expectedRevenue, cs)} />
              </div>
              {/* payment split */}
              <div className="pt-1 space-y-1.5">
                <PayBar icon={CreditCard} label="Card" amount={m.paymentSplit.CARD} total={m.collectedToday} cs={cs} color="#b76e79" />
                <PayBar icon={Banknote} label="Cash" amount={m.paymentSplit.CASH} total={m.collectedToday} cs={cs} color="#7e9680" />
                <PayBar icon={Smartphone} label="Mobile" amount={m.paymentSplit.MOBILE} total={m.collectedToday} cs={cs} color="#c9a227" />
              </div>
            </CardContent>
          </Card>

          {/* needs attention */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Needs a human</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {m.noShowCount > 0 && (
                <div className="flex items-center gap-2 text-sm rounded-lg bg-[#f6dedd] text-[#8f2d26] px-3 py-2">
                  <UserX className="w-4 h-4 shrink-0" />
                  {m.noShowCount} no-show{m.noShowCount === 1 ? "" : "s"} today — worth a call
                </div>
              )}
              {data.pending.length > 0 ? (
                data.pending.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{p.customerName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {p.serviceName} · {p.staffName} · {prettyDate(p.date)} {minToLabel(p.startMin)}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-800 border-emerald-300 hover:bg-emerald-50" disabled={confirming === p.id} onClick={() => confirm(p.id)}>
                      Confirm
                    </Button>
                  </div>
                ))
              ) : (
                m.noShowCount === 0 && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2 py-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" /> All clear — the book is tidy.
                  </p>
                )
              )}
              {data.lowStock.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-[#c9a227]" /> Shelf running low
                  </p>
                  {data.lowStock.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-sm py-0.5">
                      <span className="truncate pr-2">{p.name}</span>
                      <span className={cn("text-xs font-mono tabular-nums", p.stock === 0 ? "text-destructive font-semibold" : "text-[#a0650f]")}>
                        {p.stock === 0 ? "sold out" : `${p.stock} left`}
                      </span>
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" className="h-7 text-xs mt-1 px-2" onClick={() => onNavigate("retail")}>
                    <Package className="w-3.5 h-3.5 mr-1" />Manage retail
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── bottom row ─────────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-5 items-start">
        {/* 14-day revenue — hand-rolled */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-0 flex-row items-center justify-between">
            <CardTitle className="font-display text-lg">Last 14 days</CardTitle>
            {m.weekDelta !== null && (
              <span className={cn(
                "text-xs font-medium rounded-full px-2.5 py-1",
                m.weekDelta >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
              )}>
                {m.weekDelta >= 0 ? "+" : ""}{m.weekDelta}% vs the week before
              </span>
            )}
          </CardHeader>
          <CardContent>
            <RevenueBars data={data.revenueSeries} cs={cs} />
          </CardContent>
        </Card>

        {/* what's selling */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-lg">What&apos;s selling <span className="text-sm text-muted-foreground font-sans font-normal">· 7 days</span></CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {data.topServices7d.length === 0 && (
              <p className="text-sm text-muted-foreground">No sales this week yet.</p>
            )}
            {data.topServices7d.map((s, i) => {
              const max = data.topServices7d[0]?.revenue || 1;
              return (
                <div key={s.name}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="truncate pr-2">{i + 1}. {s.name}</span>
                    <span className="text-muted-foreground tabular-nums shrink-0">{money(s.revenue, cs)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary mt-1 overflow-hidden">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.max(4, (s.revenue / max) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
            <Button size="sm" variant="ghost" className="text-xs mt-1 px-2" onClick={() => onNavigate("reports")}>
              Full reports <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ── small pieces ──────────────────────────────────────────────────────── */
function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("w-2.5 h-2.5 rounded-sm", className)} />
      {label}
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/60 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function PayBar({ icon: Icon, label, amount, total, cs, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; amount: number; total: number; cs: string; color: string;
}) {
  const pct = total > 0 ? (amount / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="w-12 text-muted-foreground">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="tabular-nums text-muted-foreground w-16 text-right">{money(amount, cs)}</span>
    </div>
  );
}

function RevenueBars({ data, cs }: { data: { date: string; revenue: number }[]; cs: string }) {
  const max = Math.max(1, ...data.map((d) => d.revenue));
  return (
    <div className="flex gap-[3px] h-44">
      {data.map((d, i) => {
        const isToday = i === data.length - 1;
        const h = Math.max(2, (d.revenue / max) * 100);
        const label = new Date(`${d.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });
        const dayNum = d.date.slice(8);
        return (
          <div key={d.date} className="flex-1 min-w-0 flex flex-col group">
            <div className="flex-1 flex items-end relative" title={`${d.date} · ${money(d.revenue, cs)}`}>
              <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-mono tabular-nums text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {money(d.revenue, cs)}
              </span>
              <div
                className={cn(
                  "w-full rounded-t-[4px] transition-colors",
                  isToday ? "bg-[#b76e79]" : "bg-[#ded3c6] group-hover:bg-[#cbb8a5]"
                )}
                style={{ height: `${h}%` }}
              />
            </div>
            <span className={cn("text-[9px] text-center mt-1 shrink-0", isToday ? "font-bold text-foreground" : "text-muted-foreground")}>
              {i % 2 === 0 || isToday ? `${label[0]}${dayNum}` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
