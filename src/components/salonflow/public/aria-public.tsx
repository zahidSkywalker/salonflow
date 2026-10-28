"use client";

/**
 * Aria on the storefront — the visitor-facing assistant with a full
 * conversational booking flow:
 *   service → specialist → day & time (live availability) → name → phone
 *   → confirmed booking with a real reference code.
 *
 * The neural layer (aria-nlu.ts) hints intents when words don't match;
 * everything else is the same hand-written engine the owner uses.
 */

import { useEffect, useRef, useState } from "react";
import AriaPanel, { type ChatMsg } from "../aria-panel";
import { money } from "../shared";
import { Sparkles } from "lucide-react";
import { salonClock, minToLabel, weekdayOf } from "@/lib/salonflow/time";
import {
  matchService, bestNameMatch, parseTime, parseWeekday, resolveDate, tokenize,
} from "@/lib/salonflow/assistant/entities";
import { nluHint, nluDidYouMean, warmNlu } from "@/lib/salonflow/aria-nlu";
import type { WizService, WizStaff } from "./booking-wizard";

interface PublicSettings {
  salonName: string;
  openMin: number;
  closeMin: number;
  closedDays: string;
  currencySymbol: string;
  timeZone?: string | null;
}

interface Props {
  services: WizService[];
  staff: WizStaff[];
  settings: PublicSettings | null;
  onOpenLookup: () => void;
}

interface Draft {
  serviceId?: string;
  staffId?: string;
  date?: string;
  startMin?: number;
  name?: string;
  phone?: string;
  offers?: { label: string; min: number }[];
}

interface Mem {
  lastIntent?: string | null;
  lastTimeMin?: number | null;
  lastDate?: string | null;
}

const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const to12h = (min: number) => {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
};

const WELCOME: ChatMsg = {
  role: "aria",
  text: "Hey — I'm **Aria**, this salon's own assistant. I can book you in, quote prices, check openings or find your booking. Ask me anything 👇",
  chips: ["Book an appointment", "What are your prices?", "When are you open?", "Who's on the team?"],
};

export default function PublicAria({ services, staff, settings, onOpenLookup }: Props) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([WELCOME]);
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const mem = useRef<Mem>({});

  useEffect(() => {
    if (open) warmNlu();
  }, [open]);

  const tz = settings?.timeZone ?? null;
  const sym = settings?.currencySymbol ?? "$";
  const salon = () => salonClock(tz);
  const serviceById = (id?: string) => services.find((s) => s.id === id);
  const staffById = (id?: string) => staff.find((s) => s.id === id);

  const push = (m: ChatMsg) => setMsgs((x) => [...x, m]);
  const setDraftUp = (patch: Partial<Draft>) =>
    setDraft((d) => ({ ...(d ?? {}), ...patch }));

  /* ── the booking flow ──────────────────────────────────────────────── */

  const dateLabel = (date: string) =>
    date === salon().date ? "today" : date === addDays(salon().date, 1) ? "tomorrow" : WD[weekdayOf(date)];

  function addDays(date: string, n: number): string {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function nextOpenDayName(closedDays: string[], fromWd: number): string | null {
    for (let d = 1; d <= 7; d++) {
      const wd = (fromWd + d) % 7;
      if (!closedDays.includes(String(wd))) return WD[wd];
    }
    return null;
  }

  /** Ask for the next missing piece. */
  const askNext = (d: Draft, prefix?: string) => {
    if (!d.serviceId) {
      push({
        role: "aria",
        text: `${prefix ?? "Let's get you booked ✨"} What would you like done?`,
        chips: services.slice(0, 5).map((s) => s.name),
      });
      return;
    }
    if (!d.staffId) {
      const eligible = staff.filter((s) => s.serviceIds.includes(d.serviceId!));
      push({
        role: "aria",
        text: `**${serviceById(d.serviceId)?.name}** — nice choice. Anyone you'd like to do it, or first available?`,
        chips: ["First available", ...eligible.slice(0, 5).map((s) => s.name.split(" ")[0])],
      });
      return;
    }
    if (!d.date || d.startMin == null) {
      const openM = settings?.openMin ?? 540;
      const closeM = settings?.closeMin ?? 1140;
      push({
        role: "aria",
        text: `${prefix ?? ""} When suits? We're open **${minToLabel(openM)}–${minToLabel(closeM)}** — a day and a time, like “tomorrow at 3pm”.`,
        chips: ["Today", "Tomorrow", "This weekend"],
      });
      return;
    }
    if (!d.name) {
      push({ role: "aria", text: "Almost there — what name should I put it under?", chips: [] });
      return;
    }
    if (!d.phone) {
      push({ role: "aria", text: "And a phone number for the confirmation?", chips: [] });
      return;
    }
    const svc = serviceById(d.serviceId);
    const who = d.staffId && d.staffId !== "any" ? staffById(d.staffId)?.name : "first available";
    push({
      role: "aria",
      text: `Here's the plan:\n• **${svc?.name}** — ${money(svc!.price, sym)}\n• With **${who}**\n• **${dateLabel(d.date)}** at **${to12h(d.startMin)}**\n• **${d.name}** · ${d.phone}\nShall I lock it in?`,
      chips: ["Confirm booking", "Start over"],
    });
  };

  /** Live availability check for the chosen service/day/staff. */
  async function checkSlots(d: Draft, requestedMin: number): Promise<"ok" | "moved" | "none" | "closed"> {
    try {
      const res = await fetch(
        `/api/public/availability?serviceId=${d.serviceId}&staffId=${d.staffId ?? "any"}&date=${d.date}`
      );
      if (!res.ok) return "none";
      const body = await res.json();
      const slots: { min: number; label: string; available: boolean }[] = body.slots ?? [];
      const free = slots.filter((s) => s.available);
      if (!slots.length) return "closed";
      if (!free.length) return "none";
      const exact = free.find((s) => s.min === requestedMin);
      if (exact) {
        setDraftUp({ startMin: exact.min, offers: [] });
        return "ok";
      }
      const ranked = [...free].sort((a, b) => Math.abs(a.min - requestedMin) - Math.abs(b.min - requestedMin));
      const near = ranked[0];
      const others = ranked.slice(1, 4);
      setDraftUp({
        offers: [near, ...others].map((s) => ({ label: s.label, min: s.min })),
        startMin: undefined,
      });
      if (Math.abs(near.min - requestedMin) <= 90) {
        push({
          role: "aria",
          text: `${to12h(requestedMin)} is taken — but **${near.label}** is open. Good?`,
          chips: [near.label, "Show other times"],
        });
      } else {
        push({
          role: "aria",
          text: `Nothing near ${to12h(requestedMin)} — the closest openings for **${serviceById(d.serviceId)?.name}** ${dateLabel(d.date!)}:`,
          chips: [[near, ...others].map((s) => s.label), "Another day"].flat(),
        });
      }
      return "moved";
    } catch {
      return "none";
    }
  }

  async function submitBooking(d: Draft) {
    const started = Date.now();
    setThinking(true);
    try {
      const res = await fetch("/api/public/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: d.serviceId,
          staffId: d.staffId && d.staffId !== "any" ? d.staffId : "any",
          date: d.date,
          startMin: d.startMin,
          name: d.name,
          phone: d.phone,
        }),
      });
      const body = await res.json().catch(() => ({}));
      const pause = Math.max(0, 600 - (Date.now() - started));
      await new Promise((r) => setTimeout(r, pause));
      if (res.ok) {
        push({
          role: "aria",
          text: `You're booked! 🎉\nReference: **${body.ref}**\n**${body.service}** with **${body.staff}** — ${body.date} at **${to12h(d.startMin!)}**.\nSave that reference — ask me “where's my booking” anytime.`,
          chips: ["Find my booking"],
        });
        setDraft(null);
        mem.current = {};
      } else if (res.status === 409) {
        push({ role: "aria", text: "Ah — that chair was just taken. Let me find you another spot.", chips: ["Show other times"] });
        setDraftUp({ startMin: undefined });
        askNext({ ...d, startMin: undefined }, "");
      } else {
        push({ role: "aria", text: body.error ?? "Something jammed on our side — try once more?", chips: ["Start over"] });
      }
    } catch {
      push({ role: "aria", text: "The connection dropped — ask me again.", chips: [] });
    } finally {
      setThinking(false);
    }
  }

  async function handleDraft(text: string) {
    const d = draft ?? {};
    const t = text.toLowerCase().trim();

    if (/^(start over|cancel|nevermind|never mind|forget it)\b/.test(t)) {
      setDraft({});
      push({ role: "aria", text: "Fresh start — what would you like done?", chips: services.slice(0, 5).map((s) => s.name) });
      return;
    }

    // 1. service
    if (!d.serviceId) {
      const hits = matchService(t, services);
      if (hits.length) {
        const clear = hits.length === 1 || hits[0].score >= hits[1].score + 3;
        if (clear) {
          const nd = { ...d, serviceId: hits[0].service.id };
          setDraft(nd);
          askNext(nd);
          return;
        }
        push({
          role: "aria",
          text: "A few things match — which one?",
          chips: hits.slice(0, 3).map((h) => h.service.name),
        });
        return;
      }
      push({
        role: "aria",
        text: "Pick from the menu — or ask me “what do you offer?”:",
        chips: services.slice(0, 5).map((s) => s.name),
      });
      return;
    }

    // 2. specialist
    if (!d.staffId) {
      const eligible = staff.filter((s) => s.serviceIds.includes(d.serviceId!));
      if (/\b(first|any|anyone|whoever|no preference|don'?t care|surprise|whoever'?s free)\b/.test(t) || !eligible.length) {
        const nd = { ...d, staffId: "any" };
        setDraft(nd);
        askNext(nd);
        return;
      }
      const best = bestNameMatch(t, eligible.map((s) => s.name));
      if (best && best.score >= 50) {
        const hit = eligible.find((s) => s.name === best.name)!;
        const nd = { ...d, staffId: hit.id };
        setDraft(nd);
        askNext(nd);
        return;
      }
      push({
        role: "aria",
        text: "Who would you like?",
        chips: ["First available", ...eligible.slice(0, 5).map((s) => s.name.split(" ")[0])],
      });
      return;
    }

    // 3. day & time (with conflict recovery)
    if (d.date == null || d.startMin == null) {
      if (d.offers?.length) {
        const hit = d.offers.find((o) => t.includes(o.label.toLowerCase()) || to12h(o.min).toLowerCase() === t);
        if (hit) {
          const nd = { ...d, startMin: hit.min, offers: [] };
          setDraft(nd);
          askNext(nd);
          return;
        }
        if (/another|different|other day|change day/.test(t)) {
          setDraftUp({ date: undefined, startMin: undefined, offers: [] });
          push({ role: "aria", text: "Sure — which day works?", chips: ["Today", "Tomorrow", "This weekend"] });
          return;
        }
        if (/show other times|other times|more times/.test(t)) {
          setThinking(true);
          await checkSlots(d, d.startMin ?? 12 * 60);
          setThinking(false);
          return;
        }
      }
      const closedDays = (settings?.closedDays ?? "0").split(",").filter(Boolean);
      let date = d.date;
      const wd = parseWeekday(t);
      const hasDay = wd !== null || /\btomorrow\b|\btoday\b|\bweekend\b/.test(t);
      if (!date && hasDay) date = resolveDate(t, salon().date, tz);
      let time = parseTime(
        /^\d{1,2}(:\d{2})?$/.test(t) ? `at ${t}` : t,
        { nowMin: salon().min }
      );
      if (time == null && !date) {
        // a day but no time yet
        if (hasDay) {
          if (closedDays.includes(String(weekdayOf(date!)))) {
            const nextName = nextOpenDayName(closedDays, weekdayOf(date!));
            push({ role: "aria", text: `We're closed that day — ${nextName ? `**${nextName}** is our next open day.` : "try another day?"}`, chips: nextName ? [nextName, "Today", "Tomorrow"] : [] });
            return;
          }
          setDraftUp({ date });
          const dl = dateLabel(date!);
          push({ role: "aria", text: `${dl.charAt(0).toUpperCase() + dl.slice(1)} works — what time?`, chips: ["10am", "1pm", "3pm", "5pm"] });
          return;
        }
        push({ role: "aria", text: "When suits? A day and a time — like “friday at 3pm”.", chips: ["Today", "Tomorrow", "This weekend"] });
        return;
      }
      if (!date) {
        date = salon().date;
        // requested time already passed today → roll to tomorrow
        if (time != null && time <= salon().min + 30) {
          date = addDays(salon().date, 1);
          push({ role: "aria", text: "That's a bit last-minute for today — how about **tomorrow**?", chips: ["Tomorrow works", "Pick another day"] });
        }
      }
      if (time == null) {
        setDraftUp({ date });
        const dl = dateLabel(date);
        push({ role: "aria", text: `${dl.charAt(0).toUpperCase() + dl.slice(1)} it is — what time?`, chips: ["10am", "1pm", "3pm", "5pm"] });
        return;
      }
      if (closedDays.includes(String(weekdayOf(date)))) {
        const nextName = nextOpenDayName(closedDays, weekdayOf(date));
        push({ role: "aria", text: `We're closed ${dateLabel(date)} — ${nextName ? `**${nextName}** is our next open day.` : "try another day?"}`, chips: nextName ? [nextName, "Today", "Tomorrow"] : [] });
        return;
      }
      const nd = { ...d, date, startMin: undefined, offers: [] };
      setDraft(nd);
      setThinking(true);
      const outcome = await checkSlots(nd, time);
      setThinking(false);
      if (outcome === "ok") {
        askNext({ ...nd, startMin: time });
      }
      return;
    }

    // 4. name
    if (!d.name) {
      const clean = text.trim().replace(/^(i'?m|my name is|it'?s|name:?|im)\s+/i, "").trim();
      if (clean.length < 2) {
        push({ role: "aria", text: "What name should I put it under?", chips: [] });
        return;
      }
      const nd = { ...d, name: clean.slice(0, 60) };
      setDraft(nd);
      askNext(nd);
      return;
    }

    // 5. phone
    if (!d.phone) {
      const digits = text.replace(/\D/g, "");
      if (digits.length < 6) {
        push({ role: "aria", text: "That number looks short — a callable phone number, please?", chips: [] });
        return;
      }
      const nd = { ...d, phone: text.trim().slice(0, 30) };
      setDraft(nd);
      askNext(nd);
      return;
    }

    // 6. confirm
    if (/confirm|yes|book it|lock it|go ahead|sure|do it|yep|yeah/.test(t)) {
      await submitBooking(d);
      return;
    }
    if (/start over|change|no\b/.test(t)) {
      setDraft({});
      push({ role: "aria", text: "No problem — fresh start. What would you like done?", chips: services.slice(0, 5).map((s) => s.name) });
      return;
    }
    askNext(d, "Just say **confirm** when you're happy,");
  }

  /* ── server questions ──────────────────────────────────────────────── */

  async function serverAsk(text: string) {
    const started = Date.now();
    setThinking(true);
    try {
      const hint = await nluHint(text, "public");
      const res = await fetch("/api/public/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, context: mem.current, hint: hint?.intent ?? null }),
      });
      const body = await res.json();
      const pause = Math.max(0, 550 - (Date.now() - started));
      await new Promise((r) => setTimeout(r, pause));
      if (!res.ok) {
        push({ role: "aria", text: body.error ?? "Something jammed — try that again.", chips: [] });
        return;
      }
      mem.current = {
        lastIntent: body.intent ?? mem.current.lastIntent,
        lastTimeMin: body.next?.time !== undefined ? body.next.time : mem.current.lastTimeMin,
        lastDate: body.next?.date !== undefined ? body.next.date : mem.current.lastDate,
      };

      // booking intent → the client-side conversational flow takes over
      if (body.intent === "p_book") {
        const d: Draft = {};
        const svcHits = matchService(text, services);
        if (svcHits.length) d.serviceId = svcHits[0].service.id;
        const wd = parseWeekday(text);
        if (wd !== null || /\btomorrow\b|\btoday\b|\bweekend\b/.test(text)) {
          d.date = resolveDate(text, salon().date, tz);
        }
        const time = parseTime(text, { nowMin: salon().min });
        if (time != null && !d.date) d.date = salon().date;
        if (time != null) d.startMin = time;
        setDraft(d);
        askNext(d);
        return;
      }

      let chips: string[] = body.chips ?? [];
      if (body.fallback) {
        const alt = await nluDidYouMean(text, "public");
        if (alt.length) chips = alt;
      }
      push({ role: "aria", text: body.text, chips });
    } catch {
      push({ role: "aria", text: "The connection dropped — ask me again.", chips: [] });
    } finally {
      setThinking(false);
    }
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || thinking) return;
    push({ role: "user", text: q });
    if (draft) await handleDraft(q);
    else await serverAsk(q);
  }

  const onChip = (chip: string) => {
    if (chip === "Find my booking") {
      onOpenLookup();
      return;
    }
    void send(chip);
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 left-5 z-40 sm:left-auto sm:right-5 group"
          title="Ask Aria"
          aria-label="Ask Aria"
        >
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-background animate-pulse" />
          <span className="flex items-center gap-2 h-12 pl-3.5 pr-4 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 transition-all">
            <Sparkles className="w-5 h-5" />
            <span className="text-sm font-medium hidden sm:inline">Ask Aria</span>
          </span>
        </button>
      )}
      {open && (
        <AriaPanel
          open={open}
          onClose={() => setOpen(false)}
          title="Aria"
          subtitle={`${settings?.salonName ?? "The salon"}'s assistant — built in, no cloud`}
          msgs={msgs}
          thinking={thinking}
          onSend={(t) => void send(t)}
          onChip={onChip}
          placeholder="Ask, or say “book a cut friday at 3”…"
          footnote="Aria runs inside this app — a tiny neural net on your device + the salon's live calendar. No cloud AI."
        />
      )}
    </>
  );
}
