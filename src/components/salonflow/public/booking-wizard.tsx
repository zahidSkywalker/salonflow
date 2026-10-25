"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { money, minToLabel, prettyDate, todayISO, initials } from "../shared";
import { Check, ChevronLeft, ChevronRight, Clock, Sparkles, User, Users } from "lucide-react";

export interface WizService {
  id: string; name: string; category: string; description: string;
  price: number; durationMin: number; imageUrl: string;
}
export interface WizStaff {
  id: string; name: string; title: string; bio: string; imageUrl: string; serviceIds: string[];
}
interface Slot { min: number; label: string; available: boolean }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  services: WizService[];
  staff: WizStaff[];
  currencySymbol: string;
  closedDays: string;
  openMin: number;
  closeMin: number;
  preselectedServiceId?: string;
}

const STEPS = ["Service", "Specialist", "Date & time", "Your details"];

export default function BookingWizard({
  open, onOpenChange, services, staff, currencySymbol, closedDays, preselectedServiceId,
}: Props) {
  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState<string | null>(preselectedServiceId ?? null);
  const [staffId, setStaffId] = useState<string>("any");
  const [date, setDate] = useState<string>("");
  const [slotMin, setSlotMin] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    ref: string; date: string; time: string; service: string; staff: string; price: number;
  } | null>(null);

  const service = services.find((s) => s.id === serviceId) ?? null;

  // sync preselected service each time the wizard opens
  useEffect(() => {
    if (open) {
      setServiceId(preselectedServiceId ?? null);
      setStaffId("any");
      setDate("");
      setSlotMin(null);
      setError(null);
      setConfirmation(null);
    }
  }, [open, preselectedServiceId]);
  const eligibleStaff = useMemo(
    () => (service ? staff.filter((st) => st.serviceIds.includes(service.id)) : []),
    [service, staff]
  );

  // next 14 days as chips
  const days = useMemo(() => {
    const out: { iso: string; dow: string; day: string; month: string; closed: boolean }[] = [];
    const closed = closedDays.split(",").filter(Boolean);
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      out.push({
        iso,
        dow: i === 0 ? "Today" : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()],
        day: String(d.getDate()),
        month: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()],
        closed: closed.includes(String(d.getDay())),
      });
    }
    return out;
  }, [closedDays]);

  const { data: slotData, isFetching: slotsLoading } = useQuery<{ slots: Slot[] }>({
    queryKey: ["slots", serviceId, staffId, date],
    queryFn: async () => {
      const res = await fetch(`/api/public/availability?serviceId=${serviceId}&staffId=${staffId}&date=${date}`);
      if (!res.ok) throw new Error("Could not load times");
      return res.json();
    },
    enabled: !!serviceId && !!date,
  });

  const slots = slotData?.slots ?? [];
  const freeCount = slots.filter((s) => s.available).length;

  const reset = () => {
    setStep(0); setServiceId(preselectedServiceId ?? null); setStaffId("any");
    setDate(""); setSlotMin(null); setName(""); setPhone(""); setEmail("");
    setNotes(""); setError(null); setConfirmation(null);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) setTimeout(reset, 200);
    onOpenChange(v);
  };

  const canNext =
    (step === 0 && !!serviceId) ||
    (step === 1 && !!staffId) ||
    (step === 2 && date && slotMin !== null) ||
    step === 3;

  const submit = async () => {
    if (!service || slotMin === null || !date) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/public/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: service.id, staffId, date, startMin: slotMin,
          name, phone, email: email || undefined, notes: notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Booking failed");
      setConfirmation(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Booking failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden max-h-[92vh] flex flex-col">
        {confirmation ? (
          <div className="p-8 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-emerald-700" />
            </div>
            <DialogHeader className="items-center">
              <DialogTitle className="font-display text-3xl">You&apos;re booked ✨</DialogTitle>
              <DialogDescription className="mt-1">
                We can&apos;t wait to see you. Save your reference code.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-6 rounded-xl border bg-accent/40 p-5 inline-block mx-auto">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Reference</p>
              <p className="font-display text-4xl font-bold tracking-wider text-accent-foreground">
                {confirmation.ref}
              </p>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 text-left text-sm max-w-sm mx-auto">
              <div><p className="text-muted-foreground">Service</p><p className="font-medium">{confirmation.service}</p></div>
              <div><p className="text-muted-foreground">Specialist</p><p className="font-medium">{confirmation.staff}</p></div>
              <div><p className="text-muted-foreground">When</p><p className="font-medium">{prettyDate(confirmation.date)} · {confirmation.time}</p></div>
              <div><p className="text-muted-foreground">Price</p><p className="font-medium">{money(confirmation.price, currencySymbol)}</p></div>
            </div>
            <Button className="mt-8" onClick={() => handleOpenChange(false)}>Done</Button>
          </div>
        ) : (
          <>
            <DialogHeader className="px-6 pt-6 pb-4 border-b bg-secondary/30">
              <DialogTitle className="font-display text-2xl">Book your visit</DialogTitle>
              <DialogDescription>Three quick steps — under a minute.</DialogDescription>
              <div className="flex items-center gap-2 mt-3">
                {STEPS.map((label, i) => (
                  <div key={label} className="flex items-center gap-2 flex-1">
                    <div className={cn(
                      "h-1.5 flex-1 rounded-full transition-colors",
                      i <= step ? "bg-primary" : "bg-border"
                    )} />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground text-left mt-1.5">
                Step {step + 1} of 4 · <span className="font-medium text-foreground">{STEPS[step]}</span>
              </p>
            </DialogHeader>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
              {step === 0 && (
                <div className="grid sm:grid-cols-2 gap-3">
                  {services.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { setServiceId(s.id); setStaffId("any"); setSlotMin(null); }}
                      className={cn(
                        "text-left rounded-xl border p-4 transition-all hover:border-primary/60 hover:shadow-sm",
                        serviceId === s.id && "border-primary ring-1 ring-primary bg-accent/30"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-sm leading-snug">{s.name}</p>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.description}</p>
                        </div>
                        {serviceId === s.id && <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
                      </div>
                      <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{s.durationMin} min</span>
                        <span className="font-semibold text-foreground text-sm">{money(s.price, currencySymbol)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {step === 1 && service && (
                <div className="space-y-3">
                  <button
                    onClick={() => setStaffId("any")}
                    className={cn(
                      "w-full text-left rounded-xl border p-4 flex items-center gap-4 transition-all hover:border-primary/60",
                      staffId === "any" && "border-primary ring-1 ring-primary bg-accent/30"
                    )}
                  >
                    <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                      <Users className="w-5 h-5 text-secondary-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">First available specialist</p>
                      <p className="text-xs text-muted-foreground">Best chance of your perfect time slot</p>
                    </div>
                    {staffId === "any" && <Check className="w-4 h-4 text-primary" />}
                  </button>
                  {eligibleStaff.map((st) => (
                    <button
                      key={st.id}
                      onClick={() => { setStaffId(st.id); setSlotMin(null); }}
                      className={cn(
                        "w-full text-left rounded-xl border p-4 flex items-center gap-4 transition-all hover:border-primary/60",
                        staffId === st.id && "border-primary ring-1 ring-primary bg-accent/30"
                      )}
                    >
                      {st.imageUrl ? (
                         
                        <img src={st.imageUrl} alt={st.name} className="w-12 h-12 rounded-full object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center font-display">
                          {initials(st.name)}
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="font-medium text-sm">{st.name}</p>
                        <p className="text-xs text-muted-foreground">{st.title}</p>
                      </div>
                      {staffId === st.id && <Check className="w-4 h-4 text-primary" />}
                    </button>
                  ))}
                </div>
              )}

              {step === 2 && service && (
                <div className="space-y-5">
                  <div>
                    <Label className="text-xs uppercase tracking-widest text-muted-foreground">Pick a day</Label>
                    <div className="flex gap-2 mt-2 overflow-x-auto pb-2 -mx-1 px-1">
                      {days.map((d) => (
                        <button
                          key={d.iso}
                          disabled={d.closed}
                          onClick={() => { setDate(d.iso); setSlotMin(null); }}
                          className={cn(
                            "shrink-0 w-16 rounded-xl border py-2.5 text-center transition-all",
                            d.closed && "opacity-35 cursor-not-allowed",
                            date === d.iso
                              ? "border-primary bg-primary text-primary-foreground"
                              : "hover:border-primary/60"
                          )}
                        >
                          <p className="text-[10px] uppercase tracking-wide opacity-80">{d.dow}</p>
                          <p className="font-display text-lg font-bold leading-none">{d.day}</p>
                          <p className="text-[10px] opacity-80">{d.month}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs uppercase tracking-widest text-muted-foreground">Pick a time</Label>
                      {date && !slotsLoading && (
                        <span className="text-xs text-muted-foreground">{freeCount} slots free</span>
                      )}
                    </div>
                    {!date ? (
                      <p className="text-sm text-muted-foreground mt-3">Choose a day first</p>
                    ) : slotsLoading ? (
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-2">
                        {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-lg" />)}
                      </div>
                    ) : freeCount === 0 ? (
                      <p className="text-sm text-muted-foreground mt-3">
                        Fully booked this day — try another day or <span className="italic">first available specialist</span>.
                      </p>
                    ) : (
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-2">
                        {slots.map((s) => (
                          <button
                            key={s.min}
                            disabled={!s.available}
                            onClick={() => setSlotMin(s.min)}
                            className={cn(
                              "h-9 rounded-lg border text-xs font-medium transition-all",
                              !s.available && "opacity-30 line-through cursor-not-allowed",
                              s.available && slotMin === s.min
                                ? "border-primary bg-primary text-primary-foreground"
                                : s.available && "hover:border-primary/60 bg-card"
                            )}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Separator />
                  <div className="rounded-xl bg-secondary/40 p-4 text-sm space-y-1.5">
                    <div className="flex justify-between"><span className="text-muted-foreground">Service</span><span className="font-medium">{service.name}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span>{service.durationMin} min</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Specialist</span><span>{staffId === "any" ? "First available" : staff.find((x) => x.id === staffId)?.name}</span></div>
                  </div>
                </div>
              )}

              {step === 3 && service && (
                <div className="grid sm:grid-cols-2 gap-5">
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="bk-name">Full name *</Label>
                      <Input id="bk-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Charlotte Reeves" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="bk-phone">Phone *</Label>
                      <Input id="bk-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000 0000" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="bk-email">Email (optional)</Label>
                      <Input id="bk-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="bk-notes">Notes (optional)</Label>
                      <Textarea id="bk-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Allergies, preferences…" className="min-h-20" />
                    </div>
                  </div>
                  <div className="rounded-2xl border bg-secondary/30 p-5 self-start space-y-3">
                    {service.imageUrl && (
                       
                      <img src={service.imageUrl} alt={service.name} className="rounded-xl w-full h-32 object-cover" />
                    )}
                    <p className="font-display text-lg font-semibold">{service.name}</p>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground"><Clock className="w-3.5 h-3.5" />{service.durationMin} minutes</div>
                      {date && slotMin !== null && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Sparkles className="w-3.5 h-3.5" />
                          {prettyDate(date)} at {minToLabel(slotMin)}
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <User className="w-3.5 h-3.5" />
                        {staffId === "any" ? "First available specialist" : staff.find((x) => x.id === staffId)?.name}
                      </div>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Pay at the salon</span>
                      <span className="font-display text-2xl font-bold">{money(service.price, currencySymbol)}</span>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <p className="mt-4 rounded-lg bg-destructive/10 text-destructive text-sm px-4 py-2.5">{error}</p>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t bg-secondary/20">
              <Button variant="ghost" onClick={() => (step === 0 ? handleOpenChange(false) : setStep(step - 1))}>
                <ChevronLeft className="w-4 h-4 mr-1" />{step === 0 ? "Cancel" : "Back"}
              </Button>
              {step < 3 ? (
                <Button disabled={!canNext} onClick={() => setStep(step + 1)}>
                  Continue <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button disabled={submitting || !name.trim() || !phone.trim() || slotMin === null} onClick={submit}>
                  {submitting ? "Booking…" : "Confirm booking"}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
