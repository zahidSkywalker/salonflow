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
import { money, SectionTitle } from "../shared";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Plus, Pencil, Search } from "lucide-react";

interface Svc {
  id: string; name: string; category: string; description: string; price: number;
  durationMin: number; imageUrl: string; active: boolean;
  staff: { id: string; name: string }[];
}

export default function ServicesAdmin({ currencySymbol }: { currencySymbol: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Svc | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "", category: "Hair", description: "", price: 3000, durationMin: 30,
    imageUrl: "", staffIds: [] as string[],
  });

  const { data, isLoading } = useQuery<{ services: Svc[] }>({
    queryKey: ["admin-services"],
    queryFn: async () => (await fetch("/api/admin/services")).json(),
  });
  const { data: staffData } = useQuery<{ staff: { id: string; name: string; active: boolean }[] }>({
    queryKey: ["admin-staff"],
    queryFn: async () => (await fetch("/api/admin/staff")).json(),
  });

  const categories = Array.from(new Set((data?.services ?? []).map((s) => s.category)));
  const list = (data?.services ?? []).filter((s) =>
    q.trim() ? s.name.toLowerCase().includes(q.trim().toLowerCase()) : true
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", category: categories[0] ?? "Hair", description: "", price: 3000, durationMin: 30, imageUrl: "", staffIds: [] });
    setOpen(true);
  };
  const openEdit = (s: Svc) => {
    setEditing(s);
    setForm({
      name: s.name, category: s.category, description: s.description, price: s.price,
      durationMin: s.durationMin, imageUrl: s.imageUrl, staffIds: s.staff.map((x) => x.id),
    });
    setOpen(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      const url = editing ? `/api/admin/services/${editing.id}` : "/api/admin/services";
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      toast({ title: editing ? "Service updated" : "Service added" });
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-services"] });
      queryClient.invalidateQueries({ queryKey: ["site"] });
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (s: Svc) => {
    await fetch(`/api/admin/services/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !s.active }),
    });
    queryClient.invalidateQueries({ queryKey: ["admin-services"] });
    queryClient.invalidateQueries({ queryKey: ["site"] });
  };

  const toggleStaff = (id: string) => {
    setForm((f) => ({
      ...f,
      staffIds: f.staffIds.includes(id) ? f.staffIds.filter((x) => x !== id) : [...f.staffIds, id],
    }));
  };

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Services"
        sub="The menu guests see — prices, durations and who performs what."
        right={<Button onClick={openCreate}><Plus className="w-4 h-4 mr-1.5" />Add service</Button>}
      />

      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services…" className="pl-9 bg-card" />
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)
          : list.map((s) => (
              <Card key={s.id} className={cn(!s.active && "opacity-55")}>
                <CardContent className="p-0">
                  {s.imageUrl && (
                     
                    <img src={s.imageUrl} alt={s.name} className="w-full h-28 object-cover rounded-t-2xl" />
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-primary font-semibold">{s.category}</p>
                        <p className="font-semibold text-sm leading-snug mt-0.5">{s.name}</p>
                      </div>
                      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => openEdit(s)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{s.description}</p>
                    <div className="flex items-center justify-between mt-3 text-sm">
                      <span className="font-display font-bold">{money(s.price, currencySymbol)}</span>
                      <span className="text-xs text-muted-foreground">{s.durationMin} min · {s.staff.length} specialists</span>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t">
                      <span className="text-xs text-muted-foreground">{s.active ? "Bookable" : "Hidden"}</span>
                      <Switch checked={s.active} onCheckedChange={() => toggleActive(s)} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{editing ? "Edit service" : "Add service"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Signature Cut & Style" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} list="svc-cats" />
                <datalist id="svc-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div className="space-y-1.5">
                <Label>Duration (min) *</Label>
                <Input type="number" min={5} step={5} value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Price (cents) * — {money(form.price, currencySymbol)}</Label>
              <Input type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-16" />
            </div>
            <div className="space-y-1.5">
              <Label>Image URL</Label>
              <Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://…" />
            </div>
            <div className="space-y-1.5">
              <Label>Who performs it ({form.staffIds.length})</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {(staffData?.staff ?? []).filter((s) => s.active).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => toggleStaff(st.id)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs text-left transition-all",
                      form.staffIds.includes(st.id) ? "border-primary bg-accent font-medium" : "hover:border-primary/50"
                    )}
                  >
                    {st.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={busy || form.name.trim().length < 2} onClick={save}>
              {busy ? "Saving…" : editing ? "Save changes" : "Add service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
