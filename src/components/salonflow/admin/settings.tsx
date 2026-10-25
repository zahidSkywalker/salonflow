"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionTitle } from "../shared";
import { useToast } from "@/hooks/use-toast";
import { Save, Store, Clock3, KeyRound } from "lucide-react";

interface SettingsData {
  salonName: string; tagline: string; about: string; address: string; phone: string;
  email: string; currencySymbol: string; openMin: number; closeMin: number;
  slotStepMin: number; closedDays: string; adminPin: string; heroImage: string;
}

const toTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SettingsAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SettingsData | null>(null);
  const [busy, setBusy] = useState(false);
  const [newPin, setNewPin] = useState("");

  const { data, isLoading } = useQuery<SettingsData>({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const res = await fetch("/api/admin/settings");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (isLoading || !form) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-52 rounded-2xl" />
      </div>
    );
  }

  const set = (patch: Partial<SettingsData>) => setForm({ ...form, ...patch });

  const toggleClosedDay = (d: string) => {
    const days = form.closedDays.split(",").filter(Boolean);
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    set({ closedDays: next.join(",") });
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, adminPin: newPin.length >= 4 ? newPin : undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      toast({ title: "Settings saved", description: newPin ? "PIN updated — session refreshed." : "Storefront updated." });
      setNewPin("");
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      queryClient.invalidateQueries({ queryKey: ["site"] });
      queryClient.invalidateQueries({ queryKey: ["admin-me"] });
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Settings"
        sub="Branding, hours and access — everything is whitelabel-ready."
        right={
          <Button onClick={save} disabled={busy}>
            <Save className="w-4 h-4 mr-1.5" />{busy ? "Saving…" : "Save all"}
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2"><Store className="w-4 h-4 text-primary" />Identity</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Salon name</Label>
            <Input value={form.salonName} onChange={(e) => set({ salonName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Tagline</Label>
            <Input value={form.tagline} onChange={(e) => set({ tagline: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>About (shown on storefront)</Label>
            <Textarea value={form.about} onChange={(e) => set({ about: e.target.value })} className="min-h-24" />
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => set({ address: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={form.email} onChange={(e) => set({ email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Currency symbol</Label>
            <Input value={form.currencySymbol} onChange={(e) => set({ currencySymbol: e.target.value })} maxLength={4} className="w-24" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Hero image URL</Label>
            <Input value={form.heroImage} onChange={(e) => set({ heroImage: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2"><Clock3 className="w-4 h-4 text-primary" />Hours &amp; booking</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Opens at</Label>
            <Input type="time" value={toTime(form.openMin)} onChange={(e) => set({ openMin: toMin(e.target.value) })} />
          </div>
          <div className="space-y-1.5">
            <Label>Closes at</Label>
            <Input type="time" value={toTime(form.closeMin)} onChange={(e) => set({ closeMin: toMin(e.target.value) })} />
          </div>
          <div className="space-y-1.5">
            <Label>Slot interval</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={form.slotStepMin}
              onChange={(e) => set({ slotStepMin: Number(e.target.value) })}
            >
              {[5, 10, 15, 20, 30].map((v) => <option key={v} value={v}>{v} minutes</option>)}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label>Closed days</Label>
            <div className="flex gap-1.5">
              {["0", "1", "2", "3", "4", "5", "6"].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleClosedDay(d)}
                  className={`w-11 h-9 rounded-lg text-xs font-medium transition-all ${
                    form.closedDays.split(",").includes(d)
                      ? "bg-destructive text-white"
                      : "bg-secondary text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {WD[Number(d)]}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">Highlighted days are closed for booking.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2"><KeyRound className="w-4 h-4 text-primary" />Access</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Current PIN</Label>
            <Input value={form.adminPin.replace(/./g, "•")} disabled className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label>New PIN (optional, min 4 chars)</Label>
            <Input type="text" value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="leave empty to keep current" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
