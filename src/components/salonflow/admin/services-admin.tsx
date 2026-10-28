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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { money, SectionTitle } from "../shared";
import ImagePicker from "./image-picker";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Plus, Pencil, Search, PackagePlus } from "lucide-react";

interface Svc {
  id: string; name: string; category: string; description: string; price: number;
  durationMin: number; imageUrl: string; active: boolean;
  staff: { id: string; name: string }[];
}

interface Prod {
  id: string; name: string; brand: string; price: number;
  stock: number; lowStockAt: number; active: boolean;
}

export default function ServicesAdmin({ currencySymbol, initialTab = "services" }: { currencySymbol: string; initialTab?: "services" | "retail" }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"services" | "retail">(initialTab);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Svc | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "", category: "Hair", description: "", priceDollars: "", durationMin: 30,
    imageUrl: "", staffIds: [] as string[],
  });

  // retail state
  const [prodOpen, setProdOpen] = useState(false);
  const [editingProd, setEditingProd] = useState<Prod | null>(null);
  const [prodForm, setProdForm] = useState({ name: "", brand: "", priceDollars: "", stock: "0", lowStockAt: "4" });

  const { data, isLoading } = useQuery<{ services: Svc[] }>({
    queryKey: ["admin-services"],
    queryFn: async () => (await fetch("/api/admin/services")).json(),
  });
  const { data: staffData } = useQuery<{ staff: { id: string; name: string; active: boolean }[] }>({
    queryKey: ["admin-staff"],
    queryFn: async () => (await fetch("/api/admin/staff")).json(),
  });
  const { data: prodData, isLoading: prodLoading } = useQuery<{ products: Prod[] }>({
    queryKey: ["admin-products"],
    queryFn: async () => (await fetch("/api/admin/products")).json(),
  });

  const categories = Array.from(new Set((data?.services ?? []).map((s) => s.category)));
  const list = (data?.services ?? []).filter((s) =>
    q.trim() ? s.name.toLowerCase().includes(q.trim().toLowerCase()) : true
  );
  const prodList = (prodData?.products ?? []).filter((p) =>
    q.trim() ? `${p.name} ${p.brand}`.toLowerCase().includes(q.trim().toLowerCase()) : true
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", category: categories[0] ?? "Hair", description: "", priceDollars: "", durationMin: 30, imageUrl: "", staffIds: [] });
    setOpen(true);
  };
  const openEdit = (s: Svc) => {
    setEditing(s);
    setForm({
      name: s.name, category: s.category, description: s.description, priceDollars: (s.price / 100).toFixed(2),
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
        body: JSON.stringify({ ...form, price: Math.round((Number(form.priceDollars) || 0) * 100) }),
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

  /* ── retail handlers ─────────────────────────────────────────────────── */
  const openProdCreate = () => {
    setEditingProd(null);
    setProdForm({ name: "", brand: "", priceDollars: "", stock: "0", lowStockAt: "4" });
    setProdOpen(true);
  };
  const openProdEdit = (p: Prod) => {
    setEditingProd(p);
    setProdForm({
      name: p.name, brand: p.brand, priceDollars: (p.price / 100).toFixed(2),
      stock: String(p.stock), lowStockAt: String(p.lowStockAt),
    });
    setProdOpen(true);
  };

  const saveProd = async () => {
    setBusy(true);
    try {
      const priceCents = Math.round(Number(prodForm.priceDollars) * 100);
      if (!Number.isFinite(priceCents) || priceCents < 0) throw new Error("Enter a valid price");
      const payload = {
        name: prodForm.name,
        brand: prodForm.brand,
        price: priceCents,
        stock: Math.max(0, Math.round(Number(prodForm.stock) || 0)),
        lowStockAt: Math.max(0, Math.round(Number(prodForm.lowStockAt) || 0)),
      };
      const url = editingProd ? `/api/admin/products/${editingProd.id}` : "/api/admin/products";
      const res = await fetch(url, {
        method: editingProd ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      toast({ title: editingProd ? "Product updated" : "Product added" });
      setProdOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const toggleProdActive = async (p: Prod) => {
    await fetch(`/api/admin/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !p.active }),
    });
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
  };

  const restock = async (p: Prod, n: number) => {
    await fetch(`/api/admin/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stock: p.stock + n }),
    });
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  return (
    <div className="space-y-5">
      <SectionTitle
        title={tab === "services" ? "Services" : "Retail & stock"}
        sub={
          tab === "services"
            ? "The menu guests see — prices, durations and who performs what."
            : "Shelf products sold through the register — stock counts and low-stock alerts."
        }
        right={
          tab === "services" ? (
            <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1.5" />Add service</Button>
          ) : (
            <Button onClick={openProdCreate}><PackagePlus className="w-4 h-4 mr-1.5" />Add product</Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => { setTab(v as "services" | "retail"); setQ(""); }}>
          <TabsList>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="retail">Retail</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 max-w-md min-w-56">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "services" ? "Search services…" : "Search products…"} className="pl-9 bg-card" />
        </div>
      </div>

      {tab === "services" ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)
            : list.map((s) => (
                <Card key={s.id} className={cn(!s.active && "opacity-55")}>
                  <CardContent className="p-0">
                    {s.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
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
          {!isLoading && list.length === 0 && (
            <p className="text-sm text-muted-foreground sm:col-span-2 xl:col-span-3 text-center py-16">No services found.</p>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {prodLoading
            ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)
            : prodList.map((p) => {
                const low = p.stock <= p.lowStockAt;
                const out = p.stock === 0;
                return (
                  <Card key={p.id} className={cn(!p.active && "opacity-55")}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-widest text-primary font-semibold">{p.brand || "Retail"}</p>
                          <p className="font-semibold text-sm leading-snug mt-0.5 truncate">{p.name}</p>
                        </div>
                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => openProdEdit(p)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between mt-3 text-sm">
                        <span className="font-display font-bold">{money(p.price, currencySymbol)}</span>
                        <span className={cn(
                          "text-xs font-mono tabular-nums rounded-full px-2.5 py-1",
                          out ? "bg-destructive/10 text-destructive font-semibold"
                            : low ? "bg-[#c9a227]/15 text-[#7a6210] font-medium"
                            : "bg-secondary text-muted-foreground"
                        )}>
                          {out ? "sold out" : low ? `low · ${p.stock} left` : `${p.stock} in stock`}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        Alert when stock ≤ {p.lowStockAt}
                      </p>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t">
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => restock(p, 5)} disabled={!p.active && out}>
                            +5
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => restock(p, 10)} disabled={!p.active && out}>
                            +10
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{p.active ? "In register" : "Hidden"}</span>
                          <Switch checked={p.active} onCheckedChange={() => toggleProdActive(p)} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          {!prodLoading && prodList.length === 0 && (
            <p className="text-sm text-muted-foreground sm:col-span-2 xl:col-span-3 text-center py-16">
              No retail products yet — add your first one.
            </p>
          )}
        </div>
      )}

      {/* ── service dialog ───────────────────────────────────────────────── */}
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
              <Label>Price ({currencySymbol}) *{form.priceDollars !== "" && Number(form.priceDollars) >= 0 ? ` — ${money(Math.round(Number(form.priceDollars) * 100), currencySymbol)}` : ""}</Label>
              <Input
                type="number" min={0} step="0.5"
                value={form.priceDollars}
                onChange={(e) => setForm({ ...form, priceDollars: e.target.value })}
                placeholder="45.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-16" />
            </div>
            <div className="space-y-1.5">
              <ImagePicker
                label="Service photo"
                shape="square"
                value={form.imageUrl}
                onChange={(url) => setForm({ ...form, imageUrl: url })}
                hint="Upload from your device, or paste a hosted URL. Stored in the app's own database."
              />
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

      {/* ── product dialog ───────────────────────────────────────────────── */}
      <Dialog open={prodOpen} onOpenChange={setProdOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{editingProd ? "Edit product" : "Add product"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={prodForm.name} onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })} placeholder="Velvet & Vine Dry Shampoo" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Brand</Label>
                <Input value={prodForm.brand} onChange={(e) => setProdForm({ ...prodForm, brand: e.target.value })} placeholder="optional" />
              </div>
              <div className="space-y-1.5">
                <Label>Price ({currencySymbol}) *</Label>
                <Input type="number" min={0} step="0.5" value={prodForm.priceDollars} onChange={(e) => setProdForm({ ...prodForm, priceDollars: e.target.value })} placeholder="24.00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Stock on shelf</Label>
                <Input type="number" min={0} value={prodForm.stock} onChange={(e) => setProdForm({ ...prodForm, stock: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Low-stock alert at</Label>
                <Input type="number" min={0} value={prodForm.lowStockAt} onChange={(e) => setProdForm({ ...prodForm, lowStockAt: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProdOpen(false)}>Cancel</Button>
            <Button disabled={busy || prodForm.name.trim().length < 2 || prodForm.priceDollars === ""} onClick={saveProd}>
              {busy ? "Saving…" : editingProd ? "Save changes" : "Add product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
