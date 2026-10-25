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

const GROUPS: { label: string; items: { key: string; label: string }[] }[] = [
  {
    label: "Operate",
    items: [
      { key: "dashboard", label: "Dashboard" },
      { key: "appointments", label: "Appointments" },
      { key: "pos", label: "Register · POS" },
    ],
  },
  {
    label: "Manage",
    items: [
      { key: "customers", label: "Clients" },
      { key: "services", label: "Services & retail" },
      { key: "staff", label: "Team" },
    ],
  },
  {
    label: "Understand",
    items: [
      { key: "reports", label: "Reports" },
      { key: "settings", label: "Settings" },
    ],
  },
];

const ALL_KEYS = GROUPS.flatMap((g) => g.items.map((i) => i.key));
type ViewKey = (typeof ALL_KEYS)[number];

function Wordmark({ light }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center", light ? "bg-[#43332a]" : "bg-primary")}>
        {/* scissors mark */}
        <svg viewBox="0 0 24 24" className="w-4.5 h-4.5" fill="none" stroke="#f3ece4" strokeWidth="2" strokeLinecap="round">
          <circle cx="7" cy="17" r="2.6" />
          <circle cx="17" cy="17" r="2.6" />
          <path d="M9 15 L19 4" />
          <path d="M15 15 L5 4" />
        </svg>
      </span>
      <span className={cn("font-display font-semibold text-lg leading-none", light && "text-[#f3ece4]")}>
        SalonFlow
      </span>
    </span>
  );
}

export default function AdminApp() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewKey>(() => {
    const h = window.location.hash.replace("#/admin", "").replace("/", "");
    return (ALL_KEYS.includes(h) ? h : "dashboard") as ViewKey;
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

  // keep the active view in sync when the hash changes (back/forward, deep links)
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace("#/admin", "").replace("/", "");
      setView((ALL_KEYS.includes(h) ? h : "dashboard") as ViewKey);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    queryClient.clear();
    window.location.hash = "";
    window.location.reload();
  };

  const go = (key: string) => {
    setView(key as ViewKey);
    setMenuOpen(false);
  };

  const nav = (
    <nav className="flex flex-col gap-4 p-4 flex-1 overflow-y-auto">
      {GROUPS.map((g) => (
        <div key={g.label}>
          <p className="text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/40 px-2 mb-1.5">{g.label}</p>
          <div className="flex flex-col gap-0.5">
            {g.items.map((item) => (
              <button
                key={item.key}
                onClick={() => go(item.key)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-left transition-colors",
                  view === item.key
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                {view === item.key && <span className="w-1 h-1 rounded-full bg-sidebar-primary-foreground shrink-0" />}
                <span className={cn(view !== item.key && "pl-3.5")}>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="mt-auto pt-3 border-t border-sidebar-border space-y-0.5">
        <a
          href="#"
          className="flex items-center rounded-lg px-3 py-2 text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent transition-colors pl-3.5"
        >
          View storefront ↗
        </a>
        <button
          onClick={logout}
          className="w-full flex items-center rounded-lg px-3 py-2 text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent transition-colors pl-3.5"
        >
          Lock the console
        </button>
        <p className="text-[10px] text-sidebar-foreground/30 px-3.5 pt-1.5">SalonFlow · v1.5</p>
      </div>
    </nav>
  );

  if (meLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground text-sm">Opening the shop…</div>
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
          <Wordmark light />
          <p className="text-[11px] text-sidebar-foreground/50 mt-1.5 pl-[42px]">{me.name}</p>
        </div>
        {nav}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* mobile topbar */}
        <div className="lg:hidden sticky top-0 z-30 bg-sidebar text-sidebar-foreground h-14 flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent">
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 bg-sidebar text-sidebar-foreground border-sidebar-border">
                <SheetTitle className="px-5 py-4 border-b border-sidebar-border">
                  <Wordmark light />
                </SheetTitle>
                {nav}
              </SheetContent>
            </Sheet>
            <span className="font-display font-semibold">{me.name}</span>
          </div>
          <span className="text-[10px] text-sidebar-foreground/50 uppercase tracking-[0.18em]">Owner console</span>
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

/* ── login: half photo, half console ─────────────────────────────────────── */
function Login({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hero, setHero] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/public/site")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s?.settings?.heroImage && setHero(s.settings.heroImage))
      .catch(() => null);
  }, []);

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
    <div className="min-h-screen flex bg-[#2b211b]">
      {/* photo panel */}
      <div className="hidden md:block md:w-[46%] relative">
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero} alt="Inside the salon" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#43332a] to-[#2b211b]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#2b211b] via-[#2b211b]/35 to-transparent" />
        <div className="absolute bottom-10 left-10 right-10 text-[#f3ece4]">
          <p className="font-display italic text-2xl leading-snug">
            “The book is the shop. Keep it honest and the rest follows.”
          </p>
          <p className="text-sm text-[#b7a48f] mt-3">— pinned above the front desk since day one</p>
        </div>
      </div>

      {/* form panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="text-[#f3ece4] mb-8">
            <Wordmark light />
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#b7a48f] mt-3">Owner &amp; staff console</p>
          </div>
          <h1 className="font-display text-2xl text-[#f3ece4]">Good to see you.</h1>
          <p className="text-sm text-[#b7a48f] mt-1">Enter the shop PIN to open the book.</p>
          <form onSubmit={submit} className="mt-7 space-y-4">
            <Input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="• • • • • • • •"
              className="text-center text-lg tracking-[0.4em] font-mono h-12 bg-[#43332a] border-[#5a463a] text-[#f3ece4] placeholder:text-[#6b5647] focus-visible:ring-[#b76e79]"
              autoFocus
            />
            {error && (
              <p className="rounded-lg bg-[#b3453e]/15 text-[#eba49f] text-sm px-4 py-2.5 text-center">{error}</p>
            )}
            <Button type="submit" className="w-full h-11 bg-[#b76e79] hover:bg-[#a55e6a] text-white" disabled={busy || pin.length < 4}>
              {busy ? "Unlocking…" : "Open the book"}
            </Button>
            <a href="#" className="block text-center text-xs text-[#b7a48f] hover:text-[#f3ece4]">
              ← Back to the storefront
            </a>
          </form>
        </div>
      </div>
    </div>
  );
}
