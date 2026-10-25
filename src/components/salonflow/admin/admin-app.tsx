"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import Dashboard from "./dashboard";
import Appointments from "./appointments";
import POS from "./pos";
import Customers from "./customers";
import StaffAdmin from "./staff";
import ServicesAdmin from "./services-admin";
import Reports from "./reports";
import SettingsAdmin from "./settings";
import {
  LayoutDashboard, CalendarDays, ShoppingBag, Users, Scissors,
  Sparkles, BarChart3, Settings, LogOut, Menu, ExternalLink, Lock,
} from "lucide-react";

const NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "appointments", label: "Appointments", icon: CalendarDays },
  { key: "pos", label: "POS · Checkout", icon: ShoppingBag },
  { key: "customers", label: "Customers", icon: Users },
  { key: "services", label: "Services", icon: Sparkles },
  { key: "staff", label: "Staff", icon: Scissors },
  { key: "reports", label: "Reports", icon: BarChart3 },
  { key: "settings", label: "Settings", icon: Settings },
] as const;

type ViewKey = (typeof NAV)[number]["key"];

export default function AdminApp() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewKey>(() => {
    const h = window.location.hash.replace("#/admin", "").replace("/", "");
    return (NAV.find((n) => n.key === h)?.key ?? "dashboard") as ViewKey;
  });
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["admin-me"],
    queryFn: async () => {
      const res = await fetch("/api/admin/me");
      if (res.status === 401) return { authed: false as const };
      if (!res.ok) throw new Error("Failed");
      const body = await res.json();
      return { authed: true as const, name: body.name, currencySymbol: body.currencySymbol };
    },
  });

  useEffect(() => {
    window.location.hash = view === "dashboard" ? "#/admin" : `#/admin/${view}`;
  }, [view]);

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    queryClient.clear();
    window.location.hash = "";
    window.location.reload();
  };

  const go = (key: ViewKey) => {
    setView(key);
    setMenuOpen(false);
  };

  const sidebarNav = (
    <nav className="flex flex-col gap-1 p-3 flex-1">
      {NAV.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            onClick={() => go(item.key)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-left transition-colors",
              view === item.key
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
      <div className="mt-auto pt-4 border-t border-sidebar-border">
        <a
          href="#"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent transition-colors"
        >
          <ExternalLink className="w-4 h-4" />View storefront
        </a>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent transition-colors"
        >
          <LogOut className="w-4 h-4" />Sign out
        </button>
      </div>
    </nav>
  );

  if (meLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Opening the shop…</div>
      </div>
    );
  }

  if (!me?.authed) return <Login onSuccess={() => queryClient.invalidateQueries({ queryKey: ["admin-me"] })} />;

  const shared = { currencySymbol: me.currencySymbol ?? "$" };

  return (
    <div className="min-h-screen flex bg-background">
      {/* desktop sidebar */}
      <aside className="hidden lg:flex w-60 flex-col bg-sidebar text-sidebar-foreground sticky top-0 h-screen">
        <div className="px-5 py-5 border-b border-sidebar-border">
          <p className="font-display text-lg font-bold leading-tight">{me.name}</p>
          <p className="text-[11px] text-sidebar-foreground/50 tracking-widest uppercase mt-0.5">SalonFlow OS</p>
        </div>
        {sidebarNav}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* mobile topbar */}
        <div className="lg:hidden sticky top-0 z-30 bg-sidebar text-sidebar-foreground h-14 flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 bg-sidebar text-sidebar-foreground border-sidebar-border">
                <SheetTitle className="px-5 py-5 font-display border-b border-sidebar-border">
                  {me.name}
                </SheetTitle>
                {sidebarNav}
              </SheetContent>
            </Sheet>
            <span className="font-display font-bold">{me.name}</span>
          </div>
          <span className="text-xs text-sidebar-foreground/50 uppercase tracking-widest">SalonFlow</span>
        </div>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto">
          {view === "dashboard" && <Dashboard {...shared} onNavigate={go} />}
          {view === "appointments" && <Appointments {...shared} />}
          {view === "pos" && <POS {...shared} />}
          {view === "customers" && <Customers {...shared} />}
          {view === "services" && <ServicesAdmin {...shared} />}
          {view === "staff" && <StaffAdmin {...shared} />}
          {view === "reports" && <Reports {...shared} />}
          {view === "settings" && <SettingsAdmin />}
        </main>
      </div>
    </div>
  );
}

/* ── login screen ────────────────────────────────────────────────────────── */
function Login({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Login failed");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#2b211b] p-4">
      <div className="w-full max-w-sm rounded-3xl bg-card p-8 shadow-2xl">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mb-5">
          <Lock className="w-6 h-6 text-primary-foreground" />
        </div>
        <h1 className="font-display text-2xl font-bold text-center">SalonFlow</h1>
        <p className="text-sm text-muted-foreground text-center mt-1">
          Owner &amp; staff area — enter your PIN
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="• • • •"
            className="text-center text-xl tracking-[0.5em] font-mono h-12"
            autoFocus
          />
          {error && (
            <p className="rounded-lg bg-destructive/10 text-destructive text-sm px-4 py-2.5 text-center">{error}</p>
          )}
          <Button type="submit" className="w-full h-11" disabled={busy || pin.length < 4}>
            {busy ? "Unlocking…" : "Unlock dashboard"}
          </Button>
          <a href="#" className="block text-center text-xs text-muted-foreground hover:text-foreground">
            ← Back to storefront
          </a>
          <p className="text-center text-[11px] text-muted-foreground/70">
            Demo PIN: <span className="font-mono">aurelia2024</span>
          </p>
        </form>
      </div>
    </div>
  );
}
