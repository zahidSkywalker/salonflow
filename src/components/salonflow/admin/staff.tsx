"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { money, initials, SectionTitle, WEEKDAYS } from "../shared";
import ImagePicker from "./image-picker";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { UserPlus, Pencil, Percent, Clock } from "lucide-react";

interface Stf {
  id: string; name: string; title: string; bio: string; imageUrl: string;
  commissionPct: number; workingDays: string; shiftStartMin: number; shiftEndMin: number;
  active: boolean; serviceIds: string[];
}
interface Svc { id: string; name: string; price: number; active: boolean }

const WD_KEYS = ["0", "1", "2", "3", "4", "5", "6"]; // Sunday..Saturday

export default function StaffAdmin({ currencySymbol }: { currencySymbol: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Stf | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "", title: "Stylist", bio: "", imageUrl: "", commissionPct: 10,
    workingDays: "1,2,3,4,5,6", shiftStartMin: 540, shiftEndMin: 1140, serviceIds: [] as string[],
  });

  const { data, isLoading } = useQuery<{ staff: Stf[] }>({
    queryKey: ["admin-staff"],
    queryFn: async () => (await fetch("/api/admin/staff")).json(),
  });
  const { data: svcData } = useQuery<{ services: Svc[] }>({
    queryKey: ["admin-services"],
    queryFn: async () => (await fetch("/api/admin/services")).json(),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", title: "Stylist", bio: "", imageUrl: "", commissionPct: 10, workingDays: "1,2,3,4,5,6", shiftStartMin: 540, shiftEndMin: 1140, serviceIds: [] });
    setDialogOpen(true);
  };
  const openEdit = (st: Stf) => {
    setEditing(st);
    setForm({
      name: st.name, title: st.title, bio: st.bio, imageUrl: st.imageUrl,
      commissionPct: st.commissionPct, workingDays: st.workingDays,
      shiftStartMin: st.shiftStartMin, shiftEndMin: st.shiftEndMin, serviceIds: st.serviceIds,
    });
    setDialogOpen(true);
  };

  const toggleDay = (d: string) => {
    const days = form.workingDays.split(",").filter(Boolean);
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    setForm({ ...form, workingDays: next.join(",") });
  };

  const toggleService = (id: string) => {
    setForm((f) => ({
      ...f,
      serviceIds: f.serviceIds.includes(id) ? f.serviceIds.filter((x) => x !== id) : [...f.serviceIds, id],
    }));
  };

  const save = async () => {
    setBusy(true);
    try {
      const url = editing ? `/api/admin/staff/${editing.id}` : "/api/admin/staff";
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      toast({ title: editing ? "Specialist updated" : "Specialist added" });
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-staff"] });
      queryClient.invalidateQueries({ queryKey: ["site"] });
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (st: Stf) => {
    await fetch(`/api/admin/staff/${st.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !st.active }),
    });
    queryClient.invalidateQueries({ queryKey: ["admin-staff"] });
    queryClient.invalidateQueries({ queryKey: ["site"] });
  };

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Staff"
        sub="Specialists, shifts and commission rates — the team behind the chairs."
        right={<Button onClick={openCreate}><UserPlus className="w-4 h-4 mr-1.5" />Add specialist</Button>}
      />

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)
          : (data?.staff ?? []).map((st) => (
              <Card key={st.id} className={cn(!st.active && "opacity-60")}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    {st.imageUrl ? (
                       
                      <img src={st.imageUrl} alt={st.name} className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center font-display font-bold">
                        {initials(st.name)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{st.name}</p>
                      <p className="text-xs text-primary">{st.title}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{st.bio}</p>
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(st)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                    <div className="rounded-lg bg-secondary/50 px-3 py-2 flex items-center gap-2">
                      <Percent className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>{st.commissionPct}% commission</span>
                    </div>
                    <div className="rounded-lg bg-secondary/50 px-3 py-2 flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>{String(Math.floor(st.shiftStartMin / 60)).padStart(2, "0")}:00–{String(Math.floor(st.shiftEndMin / 60)).padStart(2, "0")}:00</span>
                    </div>
                  </div>
                  <div className="flex gap-1 mt-3">
                    {WD_KEYS.map((d) => (
                      <span
                        key={d}
                        className={cn(
                          "w-7 h-7 rounded-full text-[10px] font-medium flex items-center justify-center",
                          st.workingDays.split(",").includes(d) ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                        )}
                      >
                        {WEEKDAYS[Number(d)][0]}
                      </span>
                    ))}
                    <span className="ml-auto text-[11px] text-muted-foreground self-center">{st.serviceIds.length} services</span>
                  </div>
                  <div className="flex items-center justify-between mt-4 pt-3 border-t">
                    <span className="text-xs text-muted-foreground">On storefront</span>
                    <Switch checked={st.active} onCheckedChange={() => toggleActive(st)} />
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{editing ? "Edit specialist" : "Add specialist"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Senior Colorist" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Bio (shown on storefront)</Label>
              <Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} className="min-h-16" />
            </div>
            <div className="space-y-1.5">
              <ImagePicker
                label="Team photo"
                shape="avatar"
                value={form.imageUrl}
                onChange={(url) => setForm({ ...form, imageUrl: url })}
                hint="A portrait from your device, or paste a hosted URL. Stored in the app's own database."
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Commission %</Label>
                <Input type="number" min={0} max={100} value={form.commissionPct} onChange={(e) => setForm({ ...form, commissionPct: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Shift start</Label>
                <Input type="time" value={`${String(Math.floor(form.shiftStartMin / 60)).padStart(2, "0")}:${String(form.shiftStartMin % 60).padStart(2, "0")}`}
                  onChange={(e) => { const [h, m] = e.target.value.split(":").map(Number); setForm({ ...form, shiftStartMin: h * 60 + m }); }} />
              </div>
              <div className="space-y-1.5">
                <Label>Shift end</Label>
                <Input type="time" value={`${String(Math.floor(form.shiftEndMin / 60)).padStart(2, "0")}:${String(form.shiftEndMin % 60).padStart(2, "0")}`}
                  onChange={(e) => { const [h, m] = e.target.value.split(":").map(Number); setForm({ ...form, shiftEndMin: h * 60 + m }); }} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Working days</Label>
              <div className="flex gap-1.5">
                {WD_KEYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={cn(
                      "w-9 h-9 rounded-full text-xs font-medium transition-all",
                      form.workingDays.split(",").includes(d)
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {WEEKDAYS[Number(d)]}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Services offered ({form.serviceIds.length})</Label>
              <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto p-1">
                {(svcData?.services ?? []).filter((s) => s.active).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleService(s.id)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-xs transition-all",
                      form.serviceIds.includes(s.id) ? "border-primary bg-accent" : "hover:border-primary/50"
                    )}
                  >
                    <p className="font-medium truncate">{s.name}</p>
                    <p className="text-muted-foreground">{money(s.price, currencySymbol)}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button disabled={busy || form.name.trim().length < 2} onClick={save}>
              {busy ? "Saving…" : editing ? "Save changes" : "Add specialist"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
