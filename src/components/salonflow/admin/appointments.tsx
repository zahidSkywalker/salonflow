"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge, money, minToLabel, prettyDate, todayISO } from "../shared";
import { useToast } from "@/hooks/use-toast";
import { CalendarPlus, CheckCircle2, XCircle, UserX, Trash2, Search, CalendarDays, List } from "lucide-react";
import DayGrid, { useNowMin, type GridStaff } from "./daygrid";
import { cn } from "@/lib/utils";

const GRID_COLORS = ["#b76e79", "#7e9680", "#c9a227", "#a98467", "#8d7b9e", "#5f8a8b"];

interface Appt {
  id: string; ref: string; date: string; startMin: number; endMin: number;
  status: string; source: string; notes: string | null;
  customer: { id: string; name: string; phone: string };
  staff: { id: string; name: string };
  service: { id: string; name: string; price: number; durationMin: number; category: string };
}
interface Svc { id: string; name: string; price: number; durationMin: number; category: string; active: boolean }
interface Stf { id: string; name: string; title: string; active: boolean; serviceIds?: string[] }
interface Slot { min: number; label: string; available: boolean }
interface Cust { id: string; name: string; phone: string }

export default function Appointments({ currencySymbol }: { currencySymbol: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [status, setStatus] = useState("all");
  const [scope, setScope] = useState<"day" | "upcoming">("day");
  const [createOpen, setCreateOpen] = useState(false);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"timeline" | "list">("timeline");
  const [prefill, setPrefill] = useState<{ staffId: string; startMin: number } | null>(null);
  const nowMin = useNowMin();

  const { data, isLoading } = useQuery<{ appointments: Appt[] }>({
    queryKey: ["admin-appts", date, status, scope],
    queryFn: async () => {
      const params = new URLSearchParams({ scope });
      if (scope === "day") params.set("date", date);
      if (status !== "all") params.set("status", status);
      const res = await fetch(`/api/admin/appointments?${params}`);
      if (!res.ok) throw new Error("Failed to load appointments");
      return res.json();
    },
  });

  const { data: svcData } = useQuery<{ services: Svc[] }>({
    queryKey: ["admin-services"], queryFn: async () => (await fetch("/api/admin/services")).json(),
  });
  const { data: staffData } = useQuery<{ staff: (Stf & { workingDays: string; shiftStartMin: number; shiftEndMin: number; imageUrl: string })[] }>({
    queryKey: ["admin-staff"], queryFn: async () => (await fetch("/api/admin/staff")).json(),
  });
  const { data: settingData } = useQuery<{ openMin: number; closeMin: number }>({
    queryKey: ["admin-settings-hours"], queryFn: async () => (await fetch("/api/admin/settings")).json(),
    staleTime: 5 * 60_000,
  });

  const gridStaff: GridStaff[] = (staffData?.staff ?? [])
    .filter((s) => s.active)
    .filter((s) => scope !== "day" || s.workingDays.split(",").map(Number).includes(new Date(`${date}T12:00:00`).getDay()))
    .map((s, i) => ({
      id: s.id, name: s.name, title: s.title, imageUrl: s.imageUrl,
      shiftStartMin: s.shiftStartMin, shiftEndMin: s.shiftEndMin,
      color: GRID_COLORS[i % GRID_COLORS.length],
    }));

  const list = useMemo(() => {
    let items = data?.appointments ?? [];
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      items = items.filter((a) =>
        a.customer.name.toLowerCase().includes(needle) ||
        a.service.name.toLowerCase().includes(needle) ||
        a.ref.toLowerCase().includes(needle) ||
        a.customer.phone.includes(needle)
      );
    }
    return items;
  }, [data, q]);

  const changeStatus = async (id: string, next: string) => {
    const res = await fetch(`/api/admin/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) {
      toast({ title: `Marked ${next.toLowerCase().replace("_", "-")}` });
      queryClient.invalidateQueries({ queryKey: ["admin-appts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } else {
      toast({ title: "Update failed", description: (await res.json()).error, variant: "destructive" });
    }
  };

  const remove = async (id: string) => {
    const res = await fetch(`/api/admin/appointments/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Appointment removed" });
      queryClient.invalidateQueries({ queryKey: ["admin-appts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } else {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Appointments</h2>
          <p className="text-sm text-muted-foreground mt-0.5">The book — every visit, every specialist.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <CalendarPlus className="w-4 h-4 mr-1.5" />New appointment
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <Tabs value={scope} onValueChange={(v) => setScope(v as "day" | "upcoming")}>
            <TabsList>
              <TabsTrigger value="day">By day</TabsTrigger>
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            </TabsList>
          </Tabs>
          {scope === "day" && (
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          )}
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="CONFIRMED">Confirmed</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
              <SelectItem value="NO_SHOW">No-show</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1 min-w-48">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guest, service, ref…" className="pl-9" />
          </div>
          {scope === "day" && (
            <div className="flex items-center rounded-lg border p-0.5 gap-0.5">
              <button
                onClick={() => setMode("timeline")}
                className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors", mode === "timeline" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <CalendarDays className="w-3.5 h-3.5" />Timeline
              </button>
              <button
                onClick={() => setMode("list")}
                className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors", mode === "list" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <List className="w-3.5 h-3.5" />List
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* timeline view — click any gap in a lane to book it */}
      {scope === "day" && mode === "timeline" && (
        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <CardTitle className="font-display text-lg">The book · {prettyDate(date)}</CardTitle>
            <p className="text-xs text-muted-foreground">Click an empty stretch of a lane to book it</p>
          </CardHeader>
          <CardContent>
            {gridStaff.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">Nobody scheduled this day.</p>
            ) : (
              <DayGrid
                staff={gridStaff}
                appointments={(data?.appointments ?? []) as never}
                openMin={settingData?.openMin ?? 540}
                closeMin={settingData?.closeMin ?? 1140}
                nowMin={nowMin}
                currencySymbol={currencySymbol}
                onSlotClick={(staffId, startMin) => {
                  setPrefill({ staffId, startMin });
                  setCreateOpen(true);
                }}
              />
            )}
          </CardContent>
        </Card>
      )}

      <Card className={cn(scope === "day" && mode === "timeline" && "hidden")}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {isLoading ? "Loading…" : `${list.length} appointment${list.length === 1 ? "" : "s"}`}
            {scope === "day" && date ? ` · ${prettyDate(date)}` : " · upcoming"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)
            : list.length === 0 && (
                <p className="text-sm text-muted-foreground py-10 text-center">Nothing here — enjoy the calm.</p>
              )}
          {list.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 bg-card">
              <div className="w-32 shrink-0">
                <p className="text-sm font-medium">{prettyDate(a.date)}</p>
                <p className="text-xs font-mono text-muted-foreground">{minToLabel(a.startMin)}–{minToLabel(a.endMin)}</p>
              </div>
              <div className="flex-1 min-w-44">
                <p className="font-medium text-sm">{a.service.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {a.customer.name} · {a.staff.name} · {money(a.service.price, currencySymbol)}
                </p>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground hidden md:block">{a.ref}</span>
              <StatusBadge status={a.status} />
              <div className="flex gap-1.5">
                {(a.status === "PENDING" || a.status === "CONFIRMED") && (
                  <>
                    {a.status === "PENDING" && (
                      <Button size="sm" variant="outline" className="h-8 text-emerald-700 border-emerald-200" onClick={() => changeStatus(a.id, "CONFIRMED")}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Confirm
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-8" onClick={() => changeStatus(a.id, "COMPLETED")}>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Done
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-red-700 border-red-200" onClick={() => changeStatus(a.id, "NO_SHOW")}>
                      <UserX className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" className="h-8 text-muted-foreground hover:text-destructive" onClick={() => remove(a.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <CreateDialog
        open={createOpen}
        onOpenChange={(v) => { if (!v) setPrefill(null); setCreateOpen(v); }}
        services={(svcData?.services ?? []).filter((s) => s.active)}
        staff={(staffData?.staff ?? []).filter((s) => s.active)}
        currencySymbol={currencySymbol}
        prefill={prefill}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["admin-appts"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        }}
      />
    </div>
  );
}

/* ── create appointment (admin / walk-in) ─────────────────────────────────── */
function CreateDialog({
  open, onOpenChange, services, staff, currencySymbol, onCreated, prefill,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  services: Svc[];
  staff: Stf[];
  currencySymbol: string;
  onCreated: () => void;
  prefill?: { staffId: string; startMin: number } | null;
}) {
  const { toast } = useToast();
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("any");
  const [date, setDate] = useState(todayISO());
  const [slotMin, setSlotMin] = useState<number | null>(null);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [customerId, setCustomerId] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [source, setSource] = useState("ADMIN");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: custData } = useQuery<{ customers: Cust[] }>({
    queryKey: ["admin-customers"],
    queryFn: async () => (await fetch("/api/admin/customers")).json(),
    enabled: open,
  });

  // arrived from a timeline click → preselect the specialist + time
  useEffect(() => {
    if (open && prefill) {
      setStaffId(prefill.staffId);
      setSlotMin(prefill.startMin);
      setError(null);
    }
  }, [open, prefill]);

  const { data: slotData, isFetching: slotsLoading } = useQuery<{ slots: Slot[] }>({
    queryKey: ["admin-slots", serviceId, staffId, date],
    queryFn: async () => {
      const res = await fetch(`/api/public/availability?serviceId=${serviceId}&staffId=${staffId}&date=${date}`);
      return res.json();
    },
    enabled: open && !!serviceId && !!date,
  });

  const service = services.find((s) => s.id === serviceId);
  const eligibleStaff = service
    ? staff.filter((st) => (st.serviceIds ?? []).includes(service.id))
    : staff;

  const reset = () => {
    setServiceId(""); setStaffId("any"); setSlotMin(null); setMode("existing");
    setCustomerId(""); setNewName(""); setNewPhone(""); setSource("ADMIN");
    setError(null);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId, staffId, date, startMin: slotMin, source,
          ...(mode === "existing" ? { customerId } : { newCustomer: { name: newName, phone: newPhone } }),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not create appointment");
      toast({ title: "Booked!", description: `Ref ${body.ref}` });
      reset();
      onCreated();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const valid =
    !!serviceId && slotMin !== null && !!date &&
    (mode === "existing" ? !!customerId : newName.trim().length > 1 && newPhone.trim().length >= 6);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">New appointment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Service</Label>
            <Select value={serviceId} onValueChange={(v) => { setServiceId(v); setStaffId("any"); setSlotMin(null); }}>
              <SelectTrigger><SelectValue placeholder="Choose a service" /></SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} · {s.durationMin}m · {money(s.price, currencySymbol)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Specialist</Label>
            <Select value={staffId} onValueChange={(v) => { setStaffId(v); setSlotMin(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">First available</SelectItem>
                {eligibleStaff.map((st) => (
                  <SelectItem key={st.id} value={st.id}>{st.name} — {st.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} min={todayISO()} onChange={(e) => { setDate(e.target.value); setSlotMin(null); }} />
          </div>
          <div className="space-y-1.5">
            <Label>Time slot</Label>
            {!serviceId ? (
              <p className="text-sm text-muted-foreground">Pick a service first</p>
            ) : slotsLoading ? (
              <div className="grid grid-cols-5 gap-2">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
            ) : (slotData?.slots ?? []).filter((s) => s.available).length === 0 ? (
              <p className="text-sm text-muted-foreground">No free slots that day</p>
            ) : (
              <div className="grid grid-cols-5 gap-2 max-h-40 overflow-y-auto pr-1">
                {(slotData?.slots ?? []).filter((s) => s.available).map((s) => (
                  <button
                    key={s.min}
                    onClick={() => setSlotMin(s.min)}
                    className={`h-9 rounded-lg border text-xs font-medium transition-all ${
                      slotMin === s.min ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/60"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Tabs value={mode} onValueChange={(v) => setMode(v as "existing" | "new")}>
              <TabsList className="w-full">
                <TabsTrigger value="existing" className="flex-1">Existing guest</TabsTrigger>
                <TabsTrigger value="new" className="flex-1">New guest</TabsTrigger>
              </TabsList>
            </Tabs>
            {mode === "existing" ? (
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Pick a guest" /></SelectTrigger>
                <SelectContent>
                  {(custData?.customers ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} · {c.phone}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Guest name" />
                <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Phone" />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Source</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">Front desk booking</SelectItem>
                <SelectItem value="WALK_IN">Walk-in</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <p className="rounded-lg bg-destructive/10 text-destructive text-sm px-4 py-2.5">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid || busy} onClick={submit}>{busy ? "Booking…" : "Book it"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
