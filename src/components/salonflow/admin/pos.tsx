"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { money, minToLabel, initials } from "../shared";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ShoppingBag, Plus, Minus, Trash2, Banknote, CreditCard, Smartphone,
  ReceiptText, Printer, RotateCcw, Search,
} from "lucide-react";

interface Svc { id: string; name: string; category: string; price: number; durationMin: number; active: boolean }
interface Prod { id: string; name: string; brand: string; price: number; stock: number; active: boolean }
interface Stf { id: string; name: string; title: string; active: boolean }
interface Cust { id: string; name: string; phone: string }
interface SaleItem { kind: "service" | "product"; id: string; name: string; price: number; qty: number }
interface Receipt {
  receiptNo: string; items: SaleItem[]; subtotal: number; discount: number; total: number;
  method: string; createdAt: string;
  customer?: { name: string } | null;
  staff?: { name: string } | null;
}

type CartItem = SaleItem & { key: string };

export default function POS({ currencySymbol }: { currencySymbol: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const cs = currencySymbol;

  const [tab, setTab] = useState<"services" | "products">("services");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [staffId, setStaffId] = useState("none");
  const [customerId, setCustomerId] = useState("walkin");
  const [discount, setDiscount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const { data: svcData } = useQuery<{ services: Svc[] }>({
    queryKey: ["admin-services"], queryFn: async () => (await fetch("/api/admin/services")).json(),
  });
  const { data: prodData } = useQuery<{ products: Prod[] }>({
    queryKey: ["admin-products"], queryFn: async () => (await fetch("/api/admin/products")).json(),
  });
  const { data: staffData } = useQuery<{ staff: Stf[] }>({
    queryKey: ["admin-staff"], queryFn: async () => (await fetch("/api/admin/staff")).json(),
  });
  const { data: custData } = useQuery<{ customers: Cust[] }>({
    queryKey: ["admin-customers"], queryFn: async () => (await fetch("/api/admin/customers")).json(),
  });

  const catalog = useMemo(() => {
    const items: { key: string; id: string; kind: "service" | "product"; name: string; meta: string; price: number; disabled?: boolean }[] = [];
    if (tab === "services") {
      for (const s of svcData?.services ?? []) {
        if (!s.active) continue;
        items.push({ key: `s-${s.id}`, id: s.id, kind: "service", name: s.name, meta: `${s.category} · ${s.durationMin}m`, price: s.price });
      }
    } else {
      for (const p of prodData?.products ?? []) {
        if (!p.active) continue;
        items.push({ key: `p-${p.id}`, id: p.id, kind: "product", name: p.name, meta: `${p.brand || "Retail"} · ${p.stock} in stock`, price: p.price, disabled: p.stock < 1 });
      }
    }
    const needle = search.trim().toLowerCase();
    return needle ? items.filter((i) => i.name.toLowerCase().includes(needle)) : items;
  }, [tab, svcData, prodData, search]);

  const addToCart = (item: { id: string; kind: "service" | "product"; name: string; price: number }) => {
    setCart((prev) => {
      const key = `${item.kind}-${item.id}`;
      const existing = prev.find((c) => c.key === key);
      if (existing) return prev.map((c) => (c.key === key ? { ...c, qty: c.qty + 1 } : c));
      return [...prev, { key, ...item, qty: 1 }];
    });
  };

  const changeQty = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.key === key ? { ...c, qty: c.qty + delta } : c))
        .filter((c) => c.qty > 0)
    );
  };

  const subtotal = cart.reduce((a, c) => a + c.price * c.qty, 0);
  const disc = Math.min(Math.max(0, Math.round(Number(discount) * 100) || 0), subtotal);
  const total = subtotal - disc;

  const checkout = async () => {
    if (cart.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/pos/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((c) => ({ kind: c.kind, id: c.id, qty: c.qty })),
          discount: disc,
          method,
          customerId: customerId === "walkin" ? undefined : customerId,
          staffId: staffId === "none" ? undefined : staffId,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Checkout failed");
      setReceipt(body);
      setCart([]);
      setDiscount("");
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["recent-sales"] });
    } catch (e) {
      toast({ title: "Checkout failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-semibold">Point of sale</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Ring up services and retail — cash, card or mobile.</p>
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        {/* catalog */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="font-display text-lg flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-primary" />Catalog
              </CardTitle>
              <Tabs value={tab} onValueChange={(v) => setTab(v as "services" | "products")}>
                <TabsList>
                  <TabsTrigger value="services">Services</TabsTrigger>
                  <TabsTrigger value="products">Products</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="relative mt-2">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search catalog…" className="pl-9" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-2.5 max-h-[520px] overflow-y-auto pr-1">
              {catalog.map((item) => (
                <button
                  key={item.key}
                  disabled={item.disabled}
                  onClick={() => addToCart(item)}
                  className={cn(
                    "text-left rounded-xl border p-3.5 transition-all hover:border-primary hover:shadow-sm",
                    item.disabled && "opacity-40 cursor-not-allowed"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm leading-snug">{item.name}</p>
                    <Plus className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{item.meta}</p>
                  <p className="font-semibold text-sm mt-1.5">{money(item.price, cs)}</p>
                </button>
              ))}
              {catalog.length === 0 && (
                <p className="text-sm text-muted-foreground col-span-full text-center py-10">Nothing matches.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* cart */}
        <Card className="lg:col-span-2 self-start">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-lg">Current sale</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {cart.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <ReceiptText className="w-10 h-10 mx-auto opacity-30" />
                <p className="text-sm mt-3">Tap catalog items to add them.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {cart.map((c) => (
                  <div key={c.key} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{money(c.price, cs)} × {c.qty}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => changeQty(c.key, -1)}><Minus className="w-3.5 h-3.5" /></Button>
                      <span className="w-6 text-center text-sm font-semibold">{c.qty}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => changeQty(c.key, 1)}><Plus className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => changeQty(c.key, -c.qty)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1.5">
                <Label className="text-xs">Specialist (commission)</Label>
                <Select value={staffId} onValueChange={setStaffId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— none —</SelectItem>
                    {(staffData?.staff ?? []).filter((s) => s.active).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Guest</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="walkin">Walk-in</SelectItem>
                    {(custData?.customers ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Discount ({cs})</Label>
              <Input type="number" min={0} step="0.5" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00" />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {([
                { id: "CASH", icon: Banknote, label: "Cash" },
                { id: "CARD", icon: CreditCard, label: "Card" },
                { id: "MOBILE", icon: Smartphone, label: "Mobile" },
              ]).map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMethod(m.id)}
                    className={cn(
                      "rounded-xl border py-2.5 flex flex-col items-center gap-1 text-xs font-medium transition-all",
                      method === m.id ? "border-primary bg-accent text-accent-foreground" : "hover:border-primary/50 text-muted-foreground"
                    )}
                  >
                    <Icon className="w-4 h-4" />{m.label}
                  </button>
                );
              })}
            </div>

            <Separator />
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{money(subtotal, cs)}</span></div>
              {disc > 0 && (
                <div className="flex justify-between text-destructive"><span>Discount</span><span>−{money(disc, cs)}</span></div>
              )}
              <div className="flex justify-between items-baseline pt-1">
                <span className="font-semibold">Total</span>
                <span className="font-display text-3xl font-bold">{money(total, cs)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setCart([]); setDiscount(""); }} disabled={cart.length === 0}>
                <RotateCcw className="w-4 h-4 mr-1.5" />Reset
              </Button>
              <Button className="flex-[2]" disabled={busy || cart.length === 0} onClick={checkout}>
                {busy ? "Processing…" : `Charge ${money(total, cs)}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* receipt dialog */}
      <Dialog open={!!receipt} onOpenChange={(v) => { if (!v) setReceipt(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl flex items-center gap-2">
              <ReceiptText className="w-5 h-5 text-primary" />Sale complete
            </DialogTitle>
          </DialogHeader>
          {receipt && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-secondary/30 p-4 font-mono text-xs space-y-2">
                <div className="text-center">
                  <p className="font-bold text-sm">RECEIPT {receipt.receiptNo}</p>
                  <p className="text-muted-foreground">{new Date(receipt.createdAt).toLocaleString()}</p>
                </div>
                <Separator />
                {receipt.items.map((it, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="truncate pr-2">{it.name} ×{it.qty}</span>
                    <span>{money(it.price * it.qty, cs)}</span>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between"><span>Subtotal</span><span>{money(receipt.subtotal, cs)}</span></div>
                {receipt.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>−{money(receipt.discount, cs)}</span></div>}
                <div className="flex justify-between font-bold text-sm"><span>TOTAL</span><span>{money(receipt.total, cs)}</span></div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Paid via {receipt.method}</span>
                  <span>{receipt.staff?.name ?? "—"}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => window.print()}>
                  <Printer className="w-4 h-4 mr-1.5" />Print
                </Button>
                <Button className="flex-1" onClick={() => setReceipt(null)}>New sale</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
