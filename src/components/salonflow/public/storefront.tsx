"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { money, minToLabel, initials } from "../shared";
import BookingWizard, { WizService, WizStaff } from "./booking-wizard";
import BookingLookup from "./booking-lookup";
import {
  Sparkles, Star, Clock, MapPin, Phone, Mail, Menu, CalendarCheck,
  Search, ChevronDown, Scissors, Heart, Gem,
} from "lucide-react";

interface SiteData {
  settings: {
    salonName: string; tagline: string; about: string; address: string;
    phone: string; email: string; currencySymbol: string;
    openMin: number; closeMin: number; closedDays: string;
    heroImage: string; gallery: { url: string; caption: string }[];
  };
  services: WizService[];
  staff: WizStaff[];
}

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.55, ease: "easeOut" as const },
};

export default function Storefront() {
  const [bookingOpen, setBookingOpen] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [preselect, setPreselect] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState<string>("All");
  const [menuOpen, setMenuOpen] = useState(false);

  const { data, isLoading } = useQuery<SiteData>({
    queryKey: ["site"],
    queryFn: async () => {
      const res = await fetch("/api/public/site");
      if (!res.ok) throw new Error("Failed to load salon");
      return res.json();
    },
  });

  const s = data?.settings;
  const services = data?.services ?? [];
  const staff = data?.staff ?? [];

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(services.map((x) => x.category)))],
    [services]
  );
  const filtered = category === "All" ? services : services.filter((x) => x.category === category);

  const openBooking = (serviceId?: string) => {
    setPreselect(serviceId);
    setBookingOpen(true);
  };

  const closedDaysLabel = useMemo(() => {
    if (!s) return "";
    const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const closed = s.closedDays.split(",").filter(Boolean).map((n) => names[Number(n)]);
    return closed.length ? closed.join(" & ") : "Open every day";
  }, [s]);

  const navLinks = [
    { href: "#services", label: "Services" },
    { href: "#team", label: "Team" },
    { href: "#gallery", label: "Gallery" },
    { href: "#about", label: "About" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ── NAV ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-background/85 border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <a href="#" className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
              <Scissors className="w-4 h-4" />
            </span>
            <span className="font-display text-xl font-bold tracking-tight">
              {s?.salonName.split(" ")[0] ?? "Aurelia"}
            </span>
          </a>
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-muted-foreground">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className="hover:text-foreground transition-colors">{l.label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex text-muted-foreground" onClick={() => setLookupOpen(true)}>
              <Search className="w-4 h-4 mr-1.5" />My booking
            </Button>
            <Button size="sm" onClick={() => openBooking()}>
              <CalendarCheck className="w-4 h-4 mr-1.5" />Book now
            </Button>
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden"><Menu className="w-5 h-5" /></Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetTitle className="font-display">{s?.salonName ?? "Menu"}</SheetTitle>
                <nav className="mt-6 flex flex-col gap-1">
                  {navLinks.map((l) => (
                    <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}
                      className="px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-secondary transition-colors">
                      {l.label}
                    </a>
                  ))}
                  <button onClick={() => { setMenuOpen(false); setLookupOpen(true); }}
                    className="px-3 py-2.5 rounded-lg text-sm font-medium text-left hover:bg-secondary transition-colors flex items-center gap-2">
                    <Search className="w-4 h-4" />Find my booking
                  </button>
                  <a href="#/admin" className="px-3 py-2.5 rounded-lg text-xs text-muted-foreground hover:bg-secondary mt-4">
                    Owner / staff login →
                  </a>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ── HERO ──────────────────────────────────────────── */}
        <section className="relative min-h-[82vh] flex items-center overflow-hidden">
          {s?.heroImage ? (
             
            <img src={s.heroImage} alt="Inside the salon" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-secondary" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-[#2b211b]/85 via-[#2b211b]/55 to-transparent" />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-24 w-full text-primary-foreground">
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 backdrop-blur px-4 py-1.5 text-xs tracking-widest uppercase">
                <Sparkles className="w-3.5 h-3.5" />{s?.tagline ?? "Where beauty becomes ritual"}
              </p>
              <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.05] mt-6 max-w-2xl">
                Beauty, tailored<br />to <em className="text-[#e8b4b8]">you</em>.
              </h1>
              <p className="mt-5 max-w-xl text-white/80 text-lg leading-relaxed">
                Master stylists, honest advice and a chair that&apos;s always yours.
                Book online in under a minute — walk out transformed.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button size="lg" onClick={() => openBooking()} className="text-base">
                  <CalendarCheck className="w-5 h-5 mr-2" />Book appointment
                </Button>
                <a href="#services">
                  <Button size="lg" variant="outline" className="text-base border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                    Explore services
                  </Button>
                </a>
              </div>
              {s && (
                <div className="mt-10 flex flex-wrap gap-x-8 gap-y-2 text-sm text-white/70">
                  <span className="inline-flex items-center gap-2"><Clock className="w-4 h-4" />{minToLabel(s.openMin)} – {minToLabel(s.closeMin)} · {closedDaysLabel} closed</span>
                  <span className="inline-flex items-center gap-2"><MapPin className="w-4 h-4" />{s.address}</span>
                </div>
              )}
            </motion.div>
          </div>
        </section>

        {/* ── STATS STRIP ───────────────────────────────────── */}
        <section className="border-b bg-card">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
            {[
              { icon: <Gem className="w-4 h-4" />, value: String(staff.length), label: "Master specialists" },
              { icon: <Sparkles className="w-4 h-4" />, value: String(services.length), label: "Signature services" },
              { icon: <Star className="w-4 h-4" />, value: "4.9★", label: "Guest rating" },
              { icon: <Heart className="w-4 h-4" />, value: "12 yrs", label: "Of craft" },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col items-center gap-1 py-6 px-2 text-center">
                <span className="text-primary">{stat.icon}</span>
                <span className="font-display text-2xl font-bold">{isLoading ? "—" : stat.value}</span>
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── SERVICES ──────────────────────────────────────── */}
        <section id="services" className="max-w-6xl mx-auto px-4 sm:px-6 py-20 scroll-mt-16">
          <motion.div {...fadeUp} className="text-center max-w-xl mx-auto">
            <p className="text-xs tracking-[0.25em] uppercase text-primary font-semibold">The menu</p>
            <h2 className="font-display text-4xl font-bold mt-2">Signature services</h2>
            <p className="text-muted-foreground mt-3">
              Every service starts with a real consultation. Prices are final — no surprises at the counter.
            </p>
          </motion.div>

          <div className="flex flex-wrap justify-center gap-2 mt-8">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm font-medium transition-all",
                  category === c
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card hover:border-primary/50 text-muted-foreground"
                )}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-8">
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-80 rounded-2xl" />)
              : filtered.map((svc, i) => (
                  <motion.article
                    key={svc.id}
                    {...fadeUp}
                    transition={{ ...fadeUp.transition, delay: (i % 3) * 0.08 }}
                    className="group rounded-2xl border bg-card overflow-hidden flex flex-col hover:shadow-lg hover:shadow-primary/5 transition-shadow"
                  >
                    <div className="relative h-44 overflow-hidden">
                      {svc.imageUrl ? (
                         
                        <img
                          src={svc.imageUrl}
                          alt={svc.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full bg-secondary" />
                      )}
                      <span className="absolute top-3 left-3 rounded-full bg-black/45 backdrop-blur text-white text-[11px] px-3 py-1 tracking-wide">
                        {svc.category}
                      </span>
                    </div>
                    <div className="p-5 flex flex-col flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-display text-lg font-semibold leading-snug">{svc.name}</h3>
                        <span className="font-display text-lg font-bold text-primary whitespace-nowrap">
                          {money(svc.price, s?.currencySymbol ?? "$")}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2 flex-1">{svc.description}</p>
                      <div className="flex items-center justify-between mt-4">
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="w-3.5 h-3.5" />{svc.durationMin} min
                        </span>
                        <Button size="sm" variant="secondary" onClick={() => openBooking(svc.id)}>
                          Book <ChevronDown className="w-3.5 h-3.5 ml-1 -rotate-90" />
                        </Button>
                      </div>
                    </div>
                  </motion.article>
                ))}
          </div>
        </section>

        {/* ── TEAM ──────────────────────────────────────────── */}
        <section id="team" className="bg-secondary/40 border-y scroll-mt-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
            <motion.div {...fadeUp} className="text-center max-w-xl mx-auto">
              <p className="text-xs tracking-[0.25em] uppercase text-primary font-semibold">The artists</p>
              <h2 className="font-display text-4xl font-bold mt-2">Meet your specialists</h2>
              <p className="text-muted-foreground mt-3">
                Pick a specialist when you book — or let us match you with the first available.
              </p>
            </motion.div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-10">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)
                : staff.map((st, i) => (
                    <motion.div
                      key={st.id}
                      {...fadeUp}
                      transition={{ ...fadeUp.transition, delay: i * 0.06 }}
                      className="rounded-2xl bg-card border overflow-hidden text-center hover:shadow-lg transition-shadow"
                    >
                      <div className="aspect-[4/5] overflow-hidden">
                        {st.imageUrl ? (
                           
                          <img src={st.imageUrl} alt={st.name} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                        ) : (
                          <div className="w-full h-full bg-secondary flex items-center justify-center font-display text-3xl">
                            {initials(st.name)}
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="font-semibold text-sm leading-tight">{st.name}</p>
                        <p className="text-xs text-primary mt-0.5">{st.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">{st.bio}</p>
                      </div>
                    </motion.div>
                  ))}
            </div>
          </div>
        </section>

        {/* ── GALLERY ───────────────────────────────────────── */}
        <section id="gallery" className="max-w-6xl mx-auto px-4 sm:px-6 py-20 scroll-mt-16">
          <motion.div {...fadeUp} className="text-center max-w-xl mx-auto">
            <p className="text-xs tracking-[0.25em] uppercase text-primary font-semibold">The space</p>
            <h2 className="font-display text-4xl font-bold mt-2">Step inside Aurelia</h2>
          </motion.div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-10">
            {(s?.gallery ?? []).map((g, i) => (
              <motion.figure
                key={g.url + i}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: (i % 3) * 0.07 }}
                className={cn(
                  "relative rounded-2xl overflow-hidden group",
                  i === 0 && "md:col-span-2 md:row-span-2"
                )}
              >
                { }
                <img
                  src={g.url}
                  alt={g.caption}
                  className={cn(
                    "w-full object-cover group-hover:scale-105 transition-transform duration-700",
                    i === 0 ? "h-full min-h-64 aspect-[4/3] md:aspect-auto" : "aspect-[4/3]"
                  )}
                />
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent text-white text-xs px-4 py-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  {g.caption}
                </figcaption>
              </motion.figure>
            ))}
          </div>
        </section>

        {/* ── ABOUT + HOURS ─────────────────────────────────── */}
        <section id="about" className="bg-secondary/40 border-y scroll-mt-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 grid lg:grid-cols-2 gap-12 items-center">
            <motion.div {...fadeUp}>
              <p className="text-xs tracking-[0.25em] uppercase text-primary font-semibold">Our story</p>
              <h2 className="font-display text-4xl font-bold mt-2">{s?.salonName}</h2>
              <p className="text-muted-foreground mt-4 leading-relaxed">{s?.about}</p>
              <div className="mt-6 space-y-2.5 text-sm">
                <p className="flex items-center gap-3"><MapPin className="w-4 h-4 text-primary" />{s?.address}</p>
                <p className="flex items-center gap-3"><Phone className="w-4 h-4 text-primary" />{s?.phone}</p>
                <p className="flex items-center gap-3"><Mail className="w-4 h-4 text-primary" />{s?.email}</p>
              </div>
            </motion.div>
            <motion.div {...fadeUp} className="rounded-3xl bg-card border p-8 shadow-sm">
              <h3 className="font-display text-xl font-semibold flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />Opening hours
              </h3>
              <div className="mt-5 space-y-2.5 text-sm">
                {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, idx) => {
                  const closed = s ? s.closedDays.split(",").filter(Boolean).includes(String(idx)) : false;
                  const isToday = (new Date().getDay() + 7) % 7 === idx;
                  return (
                    <div key={day} className={cn(
                      "flex justify-between rounded-lg px-3 py-2",
                      isToday && "bg-accent/60 font-medium",
                      closed && "text-muted-foreground"
                    )}>
                      <span>{day}{isToday && <span className="ml-2 text-[10px] uppercase tracking-wider text-primary">today</span>}</span>
                      <span>{closed ? "Closed" : s ? `${minToLabel(s.openMin)} – ${minToLabel(s.closeMin)}` : "—"}</span>
                    </div>
                  );
                })}
              </div>
              <Button className="w-full mt-6" size="lg" onClick={() => openBooking()}>
                <CalendarCheck className="w-4 h-4 mr-2" />Reserve your chair
              </Button>
            </motion.div>
          </div>
        </section>

        {/* ── TESTIMONIALS ──────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
          <motion.div {...fadeUp} className="text-center max-w-xl mx-auto">
            <p className="text-xs tracking-[0.25em] uppercase text-primary font-semibold">Guest love</p>
            <h2 className="font-display text-4xl font-bold mt-2">Words from the chair</h2>
          </motion.div>
          <div className="grid md:grid-cols-3 gap-5 mt-10">
            {[
              { name: "Amelia T.", text: "Sofia understood my hair better in ten minutes than three salons did in three years. The balayage is unreal.", stars: 5 },
              { name: "Rohan K.", text: "Marcus is the only barber I trust with a razor. Hot towel, straight lines, zero small talk unless I want it.", stars: 5 },
              { name: "Lena W.", text: "Booked at 11pm from my sofa, got a next-morning slot with reminders. This is how salons should work.", stars: 5 },
            ].map((t, i) => (
              <motion.blockquote
                key={t.name}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: i * 0.08 }}
                className="rounded-2xl border bg-card p-6"
              >
                <div className="flex gap-1 text-primary">
                  {Array.from({ length: t.stars }).map((_, k) => <Star key={k} className="w-4 h-4 fill-current" />)}
                </div>
                <p className="mt-3 text-sm leading-relaxed">&ldquo;{t.text}&rdquo;</p>
                <footer className="mt-4 text-xs text-muted-foreground">— {t.name}, guest</footer>
              </motion.blockquote>
            ))}
          </div>
        </section>
      </main>

      {/* ── FOOTER (sticky-bottom compliant) ─────────────────── */}
      <footer className="mt-auto bg-[#2b211b] text-[#f3ece4]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid gap-8 md:grid-cols-3">
          <div>
            <p className="font-display text-2xl font-bold">{s?.salonName ?? "Aurelia"}</p>
            <p className="text-sm text-white/60 mt-2 max-w-xs">{s?.tagline}</p>
            <Button className="mt-5" onClick={() => openBooking()}>
              <CalendarCheck className="w-4 h-4 mr-2" />Book now
            </Button>
          </div>
          <div className="text-sm space-y-2 text-white/70">
            <p className="font-semibold text-white/90 mb-3">Visit us</p>
            <p className="flex items-center gap-2"><MapPin className="w-4 h-4 shrink-0" />{s?.address}</p>
            <p className="flex items-center gap-2"><Phone className="w-4 h-4 shrink-0" />{s?.phone}</p>
            <p className="flex items-center gap-2"><Mail className="w-4 h-4 shrink-0" />{s?.email}</p>
          </div>
          <div className="text-sm text-white/70">
            <p className="font-semibold text-white/90 mb-3">Hours</p>
            <p>{s ? `${minToLabel(s.openMin)} – ${minToLabel(s.closeMin)}` : "—"}</p>
            <p className="mt-1">{closedDaysLabel === "Open every day" ? "Open every day" : `Closed ${closedDaysLabel}`}</p>
            <div className="mt-6 pt-4 border-t border-white/10 flex flex-col gap-1.5 text-xs text-white/40">
              <a href="#/admin" className="hover:text-white/70 transition-colors">Owner / staff login →</a>
              <span>Powered by <span className="font-semibold text-white/60">SalonFlow</span> — booking + POS for modern salons</span>
            </div>
          </div>
        </div>
      </footer>

      {/* floating mobile book button */}
      <button
        onClick={() => openBooking()}
        className="fixed bottom-5 right-5 z-40 sm:hidden rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30 px-5 py-3.5 text-sm font-semibold flex items-center gap-2"
      >
        <CalendarCheck className="w-4 h-4" />Book now
      </button>

      <BookingWizard
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        services={services}
        staff={staff}
        currencySymbol={s?.currencySymbol ?? "$"}
        closedDays={s?.closedDays ?? "0"}
        openMin={s?.openMin ?? 540}
        closeMin={s?.closeMin ?? 1140}
        preselectedServiceId={preselect}
      />
      <BookingLookup open={lookupOpen} onOpenChange={setLookupOpen} currencySymbol={s?.currencySymbol ?? "$"} />
    </div>
  );
}
