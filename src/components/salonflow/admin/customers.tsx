"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { money, initials, SectionTitle, StatusBadge, minToLabel, prettyDate } from "../shared";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Search, Star, Pencil, ReceiptText } from "lucide-react";
import { cn } from "@/lib/utils";

interface Cust {
  id: string; name: string; phone: string; email: string | null; notes: string | null;
  visits: number; upcoming: number; totalSpent: number; createdAt: string;
}

interface ProfileData {
  customer: Cust;
  stats: {
    visits: number; upcoming: number; noShows: number; cancelled: number;
    totalSpent: number; lastVisit: string | null;
    favouriteStaff: string | null; favouriteService: string | null;
  };
  appointments: {
    id: string; ref: string; date: string; startMin: number; endMin: number; status: string;
    staff: { name: string }; service: { name: string; price: number; category: string };
  }[];
  sales: {
    receiptNo: string; total: number; tip: number; method: string; createdAt: string;
    items: { kind: string; name: string; price: number; qty: number }[];
  }[];
}

interface ProfileData {
  customer: Cust;
  stats: {
    visits: number; upcoming: number; noShows: number; cancelled: number;
    totalSpent: number; lastVisit: string | null;
    favouriteStaff: string | null; favouriteService: string | null;
  };
  appointments: {
    id: string; ref: string; date: string; startMin: number; endMin: number; status: string;
    staff: { name: string }; service: { name: string; price: number; category: string };
  }[];
  sales: {
    receiptNo: string; total: number; tip: number; method: string; createdAt: string;
    items: { kind: string; name: string; price: number; qty: number }[];
  }[];
}

const emptyForm = { name: "", phone: "", email: "", notes: "" };

export default function Customers({ currencySymbol }: { currencySymbol: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Cust | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ customers: Cust[] }>({
    queryKey: ["admin-customers", q],
    queryFn: async () => {
      const res = await fetch(`/api/admin/customers?q=${encodeURIComponent(q)}`);
      return res.json();
    },
  });

  const list = useMemo(() => data?.customers ?? [], [data]);
  const topSpender = useMemo(() => list.reduce<Cust | null>((best, c) => (!best || c.totalSpent > best.totalSpent ? c : best), null), [list]);

  const openAdd = () => { setForm(emptyForm); setAddOpen(true); };
  const openEdit = (c: Cust) => {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone, email: c.email ?? "", notes: c.notes ?? "" });
  };

  const save = async () => {
    setBusy(true);
    try {
      const url = editing ? `/api/admin/customers/${editing.id}` : "/api/admin/customers";
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      toast({ title: editing ? "Guest updated" : "Guest added" });
      setAddOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Customers"
        sub={topSpender ? `${list.length} guests · VIP: ${topSpender.name} (${money(topSpender.totalSpent, currencySymbol)} lifetime)` : `${list.length} guests`}
        right={
          <Button onClick={openAdd}><UserPlus className="w-4 h-4 mr-1.5" />Add guest</Button>
        }
      />

      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, email…" className="pl-9 bg-card" />
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)
          : list.map((c) => (
              <Card key={c.id} className="group cursor-pointer hover:border-primary/40 transition-colors" onClick={() => setProfileId(c.id)}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-full bg-primary/15 text-primary flex items-center justify-center font-display font-bold shrink-0">
                      {initials(c.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm truncate">{c.name}</p>
                        {c === topSpender && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400 shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground">{c.phone}{c.email ? ` · ${c.email}` : ""}</p>
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); openEdit(c); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {c.notes && <p className="text-xs text-muted-foreground mt-3 line-clamp-2 italic">&ldquo;{c.notes}&rdquo;</p>}
                  <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                    <div className="rounded-lg bg-secondary/50 py-2">
                      <p className="font-display text-lg font-bold leading-none">{c.visits}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">visits</p>
                    </div>
                    <div className="rounded-lg bg-secondary/50 py-2">
                      <p className="font-display text-lg font-bold leading-none">{c.upcoming}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">upcoming</p>
                    </div>
                    <div className="rounded-lg bg-secondary/50 py-2">
                      <p className="font-display text-lg font-bold leading-none">{money(c.totalSpent, currencySymbol).replace(/\.\d+$/, "")}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">spent</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
        {!isLoading && list.length === 0 && (
          <p className="text-sm text-muted-foreground sm:col-span-2 xl:col-span-3 text-center py-16">
            No guests found — add your first one.
          </p>
        )}
      </div>

      <ProfileDialog id={profileId} currencySymbol={currencySymbol} onClose={() => setProfileId(null)} />

      <Dialog open={addOpen || !!editing} onOpenChange={(v) => { if (!v) { setAddOpen(false); setEditing(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{editing ? "Edit guest" : "Add guest"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Charlotte Reeves" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone *</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 555 000 0000" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="optional" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Allergies, preferences, birthday…" className="min-h-20" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); setEditing(null); }}>Cancel</Button>
            <Button disabled={busy || form.name.trim().length < 2 || form.phone.trim().length < 6} onClick={save}>
              {busy ? "Saving…" : editing ? "Save changes" : "Add guest"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── guest profile: the story behind the card ────────────────────────────── */
function ProfileDialog({ id, currencySymbol, onClose }: { id: string | null; currencySymbol: string; onClose: () => void }) {
  const cs = currencySymbol;
  const { data, isLoading } = useQuery<ProfileData>({
    queryKey: ["customer-profile", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/customers/${id}`);
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
    enabled: !!id,
  });

  return (
    <Dialog open={!!id} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl flex items-center gap-3">
            {data ? (
              <>
                <span className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-display font-bold text-base">
                  {initials(data.customer.name)}
                </span>
                {data.customer.name}
              </>
            ) : (
              "Guest profile"
            )}
          </DialogTitle>
        </DialogHeader>
        {isLoading || !data ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-10 w-56" />
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : (
          <>

            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <span>{data.customer.phone}</span>
              {data.customer.email && <span>{data.customer.email}</span>}
              {data.customer.notes && <span className="italic w-full">&ldquo;{data.customer.notes}&rdquo;</span>}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Visits" value={String(data.stats.visits)} />
              <Stat label="Lifetime" value={money(data.stats.totalSpent, cs).replace(/\.\d+$/, "")} />
              <Stat label="Last seen" value={data.stats.lastVisit ? prettyDate(data.stats.lastVisit) : "—"} />
              <Stat label="No-shows" value={String(data.stats.noShows)} accent={data.stats.noShows > 1 ? "text-destructive" : undefined} />
            </div>

            {(data.stats.favouriteStaff || data.stats.favouriteService) && (
              <p className="text-xs text-muted-foreground">
                Usually books <span className="text-foreground font-medium">{data.stats.favouriteService ?? "—"}</span>
                {data.stats.favouriteStaff && <> with <span className="text-foreground font-medium">{data.stats.favouriteStaff}</span></>}
              </p>
            )}

            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Visit history</p>
              {data.appointments.length === 0 && (
                <p className="text-sm text-muted-foreground py-3">No bookings yet — a fresh face.</p>
              )}
              {data.appointments.slice(0, 8).map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">{a.date.slice(5)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{a.service.name}</p>
                    <p className="text-xs text-muted-foreground">{a.staff.name} · {money(a.service.price, cs)}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Receipts</p>
              {data.sales.length === 0 && (
                <p className="text-sm text-muted-foreground py-3">Nothing on the register yet.</p>
              )}
              {data.sales.slice(0, 6).map((s) => (
                <div key={s.receiptNo} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                  <ReceiptText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs">{s.receiptNo}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {s.items.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ""}`).join(", ")}
                    </p>
                  </div>
                  <span className="tabular-nums font-medium">{money(s.total, cs)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg bg-secondary/50 py-2.5 text-center">
      <p className={cn("font-display text-lg font-bold leading-none", accent)}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
