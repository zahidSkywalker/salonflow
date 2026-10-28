/**
 * Aria — SalonFlow's built-in brain. 100% hand-rolled: no external AI API,
 * no keys, no cloud. Pure TypeScript intent parsing over the salon's live
 * database. Understands questions about bookings, revenue, stock, clients,
 * staff and the floor — and answers from real numbers, in the salon's own
 * clock and currency.
 *
 * Pipeline: normalize → extract entities (period / time / weekday / name)
 * → score intents → first match wins → query Prisma → compose a reply.
 */
import { db, dbReady } from "@/lib/db";
import {
  salonClock, salonDaysAgo, salonDayStart, salonDayEnd, salonDateOf,
  minToLabel, weekdayOf,
} from "./time";
import { parseItems } from "./time";

export interface AssistantReply {
  text: string;
  chips: string[];
}

const money = (cents: number, sym = "$") =>
  `${sym}${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const OPEN_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED"];
const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/* ── period parsing ──────────────────────────────────────────────────── */

type Period =
  | { kind: "day"; offset: number }
  | { kind: "back"; days: number }   // last N days incl. today
  | { kind: "week"; offset: number } // calendar week (0=this, 1=last)
  | { kind: "month"; offset: number }
  | { kind: "all" };

function parsePeriod(msg: string): Period {
  const m = msg.match(/(?:last|past|previous|over the|in the|for the)\s+(\d{1,3})\s*(day|week|month)/);
  if (m) {
    const n = Number(m[1]);
    if (m[2] === "day") return { kind: "back", days: Math.max(1, Math.min(365, n)) };
    if (m[2] === "week") return { kind: "back", days: Math.max(1, Math.min(365, n * 7)) };
    return { kind: "back", days: Math.max(1, Math.min(365, n * 30)) };
  }
  if (/\byesterday\b/.test(msg)) return { kind: "day", offset: -1 };
  if (/\btomorrow\b/.test(msg)) return { kind: "day", offset: 1 };
  if (/\bthis week\b|\bthe week\b|\bweek so far\b/.test(msg)) return { kind: "week", offset: 0 };
  if (/\blast week\b|\bprevious week\b/.test(msg)) return { kind: "week", offset: 1 };
  if (/\bthis month\b|\bmonth so far\b/.test(msg)) return { kind: "month", offset: 0 };
  if (/\blast month\b|\bprevious month\b/.test(msg)) return { kind: "month", offset: 1 };
  if (/\b(all time|ever|since the start|overall)\b/.test(msg)) return { kind: "all" };
  if (/\b(30|thirty) (days|d)\b/.test(msg)) return { kind: "back", days: 30 };
  if (/\b(7|seven) (days|d)\b/.test(msg)) return { kind: "back", days: 7 };
  return { kind: "day", offset: 0 };
}

function periodLabel(p: Period): string {
  switch (p.kind) {
    case "day": return p.offset === 0 ? "today" : p.offset === -1 ? "yesterday" : "tomorrow";
    case "back": return `the last ${p.days} day${p.days === 1 ? "" : "s"}`;
    case "week": return p.offset === 0 ? "this week" : "last week";
    case "month": return p.offset === 0 ? "this month" : "last month";
    case "all": return "all time";
  }
}

/** [startInclusive, endExclusive) as UTC instants, plus the date-string span. */
function periodRange(p: Period, tz: string | null | undefined) {
  const today = salonClock(tz).date;
  if (p.kind === "all") {
    return { start: new Date(0), end: new Date(Date.parse("2999-01-01")), from: "0000-01-01", to: "9999-12-31" };
  }
  if (p.kind === "day") {
    const d = salonDaysAgo(tz, -p.offset);
    return { start: salonDayStart(d, tz), end: salonDayEnd(d, tz), from: d, to: d };
  }
  if (p.kind === "back") {
    const from = salonDaysAgo(tz, -(p.days - 1));
    return { start: salonDayStart(from, tz), end: salonDayEnd(today, tz), from, to: today };
  }
  if (p.kind === "week") {
    // ISO-ish week: Monday start, computed on the salon clock
    const wd = weekdayOf(today); // 0=Sun..6=Sat
    const backFromMonday = (wd + 6) % 7 + p.offset * 7;
    const from = salonDaysAgo(tz, -backFromMonday);
    const to = p.offset === 0 ? today : salonDaysAgo(tz, -(backFromMonday + 6));
    return { start: salonDayStart(from, tz), end: salonDayEnd(to, tz), from, to };
  }
  // calendar month on the salon clock
  const base = today.split("-");
  const y = Number(base[0]);
  const mo = Number(base[1]) - 1 + (p.offset === 0 ? 0 : -1);
  const targetY = mo < 0 ? y - 1 : y;
  const targetM = mo < 0 ? 12 : mo + 1;
  const mm = String(targetM).padStart(2, "0");
  const from = `${targetY}-${mm}-01`;
  const lastDay = new Date(Date.UTC(targetY, targetM, 0)).getUTCDate();
  const to = p.offset === 0 ? today : `${targetY}-${mm}-${String(lastDay).padStart(2, "0")}`;
  return { start: salonDayStart(from, tz), end: salonDayEnd(to, tz), from, to };
}

/* ── entity extraction ───────────────────────────────────────────────── */

/** "3pm", "15:00", "at 9:30 am" → minutes since midnight, else null. */
function parseTime(msg: string): number | null {
  const m = msg.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/)
    ?? msg.match(/\b(?:at\s+)(\d{1,2}):(\d{2})\b/)
    ?? (/\b(\d{1,2}):(\d{2})\b/.test(msg) ? msg.match(/\b(\d{1,2}):(\d{2})\b/) : null);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  const ampm = m[3];
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  if (!ampm && h <= 7) h += 12; // "at 3" in salon context means the afternoon
  return h * 60 + min;
}

function parseWeekday(msg: string): number | null {
  const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const short = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  for (let i = 0; i < 7; i++) {
    if (new RegExp(`\\b(next\\s+)?${names[i]}\\b`).test(msg) || new RegExp(`\\b(next\\s+)?${short[i]}\\b\\.?\\b`).test(msg)) {
      return i;
    }
  }
  return null;
}

const strip = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

function looksLikeLookup(msg: string): string | null {
  const m = msg.match(
    /(?:client|customer|who\s+is|who's|find|search|info|details|about|profile|look\s*up)\s+(?:for\s+|on\s+|named\s+)?([a-z][a-z' -]{1,40})/
  );
  if (!m) return null;
  const name = m[1]
    .replace(/\b(phone|number|email|notes|history|visits|info|details|profile)\b.*$/, "")
    .trim();
  return name.length >= 2 ? name : null;
}

/* ── reply helpers ───────────────────────────────────────────────────── */

const YES_CHIPS = ["How's revenue this week?", "Any low stock?", "Who's next?"];
const list = (items: string[]) => items.join("\n");

/* ── the engine ──────────────────────────────────────────────────────── */

export async function askSalon(raw: string): Promise<AssistantReply> {
  await dbReady;
  const msg = strip(raw);
  const setting = await db.setting.findUnique({ where: { id: "main" } });
  const tz = setting?.timeZone ?? null;
  const sym = setting?.currencySymbol ?? "$";
  const clock = salonClock(tz);
  const today = clock.date;

  const period = parsePeriod(msg);
  const range = periodRange(period, tz);
  const rangeLabel = periodLabel(period);

  /* helpers bound to this request ------------------------------------ */

  const salesIn = async (from = range.start, to = range.end) => {
    const rows = await db.sale.findMany({
      where: { createdAt: { gte: from, lt: to } },
      include: { staff: { select: { id: true, name: true, commissionPct: true } } },
    });
    return rows;
  };

  const summarizeSales = (rows: Awaited<ReturnType<typeof salesIn>>) => {
    let revenue = 0, tips = 0, discounts = 0, retail = 0;
    for (const s of rows) {
      revenue += s.subtotal - s.discount;
      tips += s.tip;
      discounts += s.discount;
      for (const it of parseItems(s.items)) if (it.kind === "product") retail += it.price * it.qty;
    }
    return { revenue, tips, discounts, retail, count: rows.length, avg: rows.length ? Math.round(revenue / rows.length) : 0 };
  };

  /* ── intents, most specific first ──────────────────────────────────── */

  // 0. help
  if (/\b(help|what can you do|commands|options|abilities|capab)\b/.test(msg)) {
    return {
      text: list([
        "I'm Aria — I live inside your SalonFlow and I read your real numbers. Ask me things like:",
        "• “Who's coming in today?” / “Who's free at 3pm?”",
        "• “How did we do this week?” / “Revenue last 30 days”",
        "• “Any low stock?” / “Best selling service”",
        "• “Find Maya” / “Who are the regulars?”",
        "• “No-shows this month” / “Who earned the most?”",
        "• “Busiest day” / “When are we open?”",
      ]),
      chips: ["Who's coming in today?", "How did we do this week?", "Any low stock?"],
    };
  }

  // 1. identity
  if (/\b(who are you|what are you|your name|are you (an? )?(ai|robot|bot|human))\b/.test(msg)) {
    return {
      text: "I'm Aria — the front-desk brain built into this app. No cloud, no keys: I was written by hand and I read your own database, so everything I say stays here. 🧠",
      chips: ["What can you do?", "Who's next?"],
    };
  }

  // 2. thanks / bye
  if (/^(thanks|thank you|thx|ty|cheers|nice one|good (job|girl|work)|well done)\b/.test(msg)) {
    return { text: "Anytime. The book's always open if you need me. 💐", chips: ["How's today looking?"] };
  }
  if (/^(bye|goodbye|good night|see you|later|that's all|thats all|nothing else)\b/.test(msg)) {
    return { text: "See you on the floor. ✂️", chips: ["How's today looking?"] };
  }

  // 3. greeting → mini snapshot of the day
  if (/^(hi|hello|hey|yo|good (morning|afternoon|evening)|morning|sup|what's up|whats up)\b/.test(msg)) {
    const appts = await db.appointment.findMany({
      where: { date: today, status: { in: OPEN_STATUSES } },
      include: { customer: { select: { name: true } }, service: { select: { name: true } }, staff: { select: { name: true } } },
      orderBy: { startMin: "asc" },
    });
    const sales = summarizeSales(await salesIn(salonDayStart(today, tz), salonDayEnd(today, tz)));
    const remaining = appts.filter((a) => a.startMin >= clock.min).length;
    const hello = clock.min < 300 ? "Up late" : clock.min < 720 ? "Morning" : clock.min < 1020 ? "Afternoon" : "Evening";
    return {
      text: `${hello}! ${WD[weekdayOf(today)]} at ${setting?.salonName ?? "the salon"}: **${appts.length} appointment${appts.length === 1 ? "" : "s"}** on the book${remaining ? `, ${remaining} still ahead` : " — all wrapped"}, and ${money(sales.revenue, sym)} rung through so far. What do you need?`,
      chips: ["Who's next?", "Who's free right now?", "Any low stock?"],
    };
  }

  // 4. who's free at <time> / right now
  if (/\b(free|available|availability|can (take|fit|squeeze)|walk.?in|open slot|open chair)\b/.test(msg)) {
    const date = ((): string => {
      const wd = parseWeekday(msg);
      if (wd !== null) {
        const todayWd = weekdayOf(today);
        let diff = (wd - todayWd + 7) % 7;
        if (diff === 0 && /next/.test(msg)) diff = 7;
        return salonDaysAgo(tz, -diff);
      }
      if (/\btomorrow\b/.test(msg)) return salonDaysAgo(tz, -1);
      return today;
    })();
    const explicit = parseTime(msg);
    const t = explicit ?? (/\b(right now|now|currently|at the moment)\b/.test(msg) ? clock.min : null);
    if (t === null) {
      return { text: "Sure — what time? Say “who's free at 3pm” and I'll check the floor.", chips: ["Who's free at 3pm?"] };
    }
    const staffAll = await db.staff.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
    const wd = weekdayOf(date);
    const onDuty = staffAll.filter((s) => s.workingDays.split(",").map(Number).includes(wd));
    const busy = await db.appointment.findMany({
      where: { date, staffId: { in: staffAll.map((s) => s.id) }, status: { in: OPEN_STATUSES } },
      select: { staffId: true, startMin: true, endMin: true },
    });
    const isToday = date === today;
    const past = isToday && t <= clock.min;
    const free = onDuty.filter(
      (s) => t >= s.shiftStartMin && t + 30 <= s.shiftEndMin &&
        !busy.some((b) => b.staffId === s.id && t < b.endMin && t + 30 > b.startMin)
    );
    const label = explicit
      ? `${minToLabel(t)}${date === today ? " today" : ` ${WD[wd]}`}`
      : date === today ? "right now" : `${WD[wd]} ${minToLabel(t)}`;
    if (past) {
      return { text: `${minToLabel(t)} has already gone by on the salon clock — try a time later today.`, chips: ["Who's free at 4pm?"] };
    }
    if (onDuty.length === 0) {
      return { text: `Nobody's rostered for ${WD[wd]} — that's a closed chair day.`, chips: ["When are we open?"] };
    }
    return {
      text: free.length
        ? `Free at **${label}**: ${free.map((f) => `**${f.name}**`).join(", ")}. ${free.length === onDuty.length ? "Whole floor's open. 🎉" : ""}`
        : `Everyone's booked at ${label} — ${onDuty.map((f) => f.name.split(" ")[0]).join(", ")} are all in the chair. Want me to check 30 minutes later?`,
      chips: ["Who's next?", "Who's coming in today?"],
    };
  }

  // 5. next appointment
  if (/\b(next (appointment|customer|client|booking|up)|up next|coming up next|next in)\b/.test(msg)) {
    const next = await db.appointment.findFirst({
      where: { status: { in: ["PENDING", "CONFIRMED"] }, date: { gte: today }, startMin: { gte: today === clock.date ? clock.min : 0 } },
      orderBy: [{ date: "asc" }, { startMin: "asc" }],
      include: { customer: { select: { name: true } }, service: { select: { name: true } }, staff: { select: { name: true } } },
    });
    if (!next) return { text: "Nothing left on the book after now. Time for a deep-clean of the stations. 🧹", chips: YES_CHIPS };
    const when = next.date === today ? `today at ${minToLabel(next.startMin)}` : `${WD[weekdayOf(next.date)]} ${minToLabel(next.startMin)}`;
    return {
      text: `Up next: **${next.customer.name}** — ${next.service.name} with ${next.staff.name}, ${when}. (${next.status === "PENDING" ? "still awaiting confirmation" : "confirmed"})`,
      chips: ["Who's free after that?", "How's today looking?"],
    };
  }

  // 6. right now / in the shop
  if (/\b(right now|currently|in the shop|in the chair|at the moment|busy right)\b/.test(msg) && !/\bfree\b/.test(msg)) {
    const inChair = await db.appointment.findMany({
      where: { date: today, status: { in: ["CONFIRMED", "COMPLETED"] }, startMin: { lte: clock.min }, endMin: { gt: clock.min } },
      include: { customer: { select: { name: true } }, service: { select: { name: true } }, staff: { select: { name: true } } },
    });
    if (!inChair.length) {
      return { text: clock.min < (setting?.openMin ?? 540) ? "We're not open yet — chairs are empty and the kettle's on. ☕" : "Chairs are empty right now — quiet moment on the floor.", chips: ["Who's next?", "Who's free right now?"] };
    }
    return {
      text: `In the chair right now: ${inChair.map((a) => `**${a.customer.name}** (${a.service.name} with ${a.staff.name})`).join(", ")}.`,
      chips: ["Who's next?", "How's today looking?"],
    };
  }

  // 7. schedule / who's coming / agenda (today, tomorrow or a weekday)
  const schedDay = ((): string | null => {
    if (/\b(schedule|agenda|book|appointment|coming|today|plan|my day|the day|who.?s in)\b/.test(msg)) {
      const wd = parseWeekday(msg);
      if (wd !== null) {
        const todayWd = weekdayOf(today);
        let diff = (wd - todayWd + 7) % 7;
        if (diff === 0 && /next/.test(msg)) diff = 7;
        return salonDaysAgo(tz, -diff);
      }
      if (/\btomorrow\b/.test(msg)) return salonDaysAgo(tz, -1);
      if (/\byesterday\b/.test(msg)) return salonDaysAgo(tz, 1);
      return today;
    }
    if (parseWeekday(msg) !== null && /\b(appointment|booking|booked|schedule)\b/.test(msg)) {
      const wd = parseWeekday(msg)!;
      const todayWd = weekdayOf(today);
      const diff = (wd - todayWd + 7) % 7 || 7;
      return salonDaysAgo(tz, -diff);
    }
    return null;
  })();

  if (schedDay) {
    const appts = await db.appointment.findMany({
      where: { date: schedDay },
      include: {
        customer: { select: { name: true } },
        service: { select: { name: true, durationMin: true } },
        staff: { select: { name: true } },
      },
      orderBy: { startMin: "asc" },
    });
    const when = schedDay === today ? "Today" : schedDay === salonDaysAgo(tz, -1) ? "Tomorrow" : WD[weekdayOf(schedDay)];
    if (!appts.length) {
      return { text: `${when} is wide open — zero appointments. Good day for a promo post. 📣`, chips: ["How did we do yesterday?", "Who are the regulars?"] };
    }
    const counts = { pending: 0, cancelled: 0, noshow: 0, done: 0 };
    for (const a of appts) {
      if (a.status === "PENDING") counts.pending++;
      else if (a.status === "CANCELLED") counts.cancelled++;
      else if (a.status === "NO_SHOW") counts.noshow++;
      else if (a.status === "COMPLETED") counts.done++;
    }
    const active = appts.filter((a) => OPEN_STATUSES.includes(a.status));
    const lines = active.slice(0, 8).map((a) => {
      const mark = a.status === "PENDING" ? " ⏳" : "";
      return `• ${minToLabel(a.startMin)} — **${a.customer.name}** · ${a.service.name} · ${a.staff.name}${mark}`;
    });
    const extra = active.length > 8 ? `\n…and ${active.length - 8} more through the day.` : "";
    const flags: string[] = [];
    if (counts.pending) flags.push(`${counts.pending} awaiting confirmation`);
    if (counts.cancelled) flags.push(`${counts.cancelled} cancelled`);
    if (counts.noshow) flags.push(`${counts.noshow} no-show`);
    if (counts.done) flags.push(`${counts.done} completed`);
    return {
      text: `**${when}** (${appts.length} on the book${flags.length ? ` — ${flags.join(", ")}` : ""}):\n${lines.join("\n")}${extra}`,
      chips: schedDay === today ? ["Who's next?", "Who's free at 3pm?", "Revenue today?"] : ["How did we do yesterday?", "Best selling service?"],
    };
  }

  // 8. no-shows
  if (/\b(no.?shows?|ghosted|didn.?t (show|turn))\b/.test(msg)) {
    const rows = await db.appointment.groupBy({
      by: ["status"],
      where: { date: { gte: range.from, lte: range.to } },
      _count: true,
    });
    const map = Object.fromEntries(rows.map((r) => [r.status, r._count]));
    const total = rows.reduce((a, r) => a + r._count, 0);
    const ns = map.NO_SHOW ?? 0;
    const rate = total ? Math.round((ns / total) * 1000) / 10 : 0;
    return {
      text: `In ${rangeLabel}: **${ns} no-show${ns === 1 ? "" : "s"}** out of ${total} appointments (${rate}%). ${rate > 8 ? "That's worth a deposit policy on peak hours. 📌" : "Under control. 👌"}`,
      chips: ["Cancellations this month?", "How's revenue this week?"],
    };
  }

  // 9. cancellations
  if (/\bcancel/.test(msg)) {
    const rows = await db.appointment.groupBy({
      by: ["status"],
      where: { date: { gte: range.from, lte: range.to } },
      _count: true,
    });
    const map = Object.fromEntries(rows.map((r) => [r.status, r._count]));
    const c = map.CANCELLED ?? 0;
    const total = rows.reduce((a, r) => a + r._count, 0);
    return {
      text: `**${c} cancellation${c === 1 ? "" : "s"}** in ${rangeLabel} (${total ? Math.round((c / total) * 1000) / 10 : 0}% of all appointments). ${c > 0 ? "A rebooking nudge usually wins most of them back." : ""}`,
      chips: ["No-shows this month?", "Pending approvals?"],
    };
  }

  // 10. pending approvals
  if (/\b(pending|awaiting|approve|unconfirmed|requests?)\b/.test(msg) && /\b(appointment|booking|confirm|approval|pending|requests?)\b/.test(msg)) {
    const pending = await db.appointment.findMany({
      where: { status: "PENDING", date: { gte: today } },
      include: { customer: { select: { name: true } }, service: { select: { name: true } }, staff: { select: { name: true } } },
      orderBy: [{ date: "asc" }, { startMin: "asc" }],
    });
    if (!pending.length) return { text: "Zero pending requests — every booking on the calendar is confirmed. ✅", chips: ["Who's coming in today?"] };
    return {
      text: list([
        `**${pending.length} booking${pending.length === 1 ? "" : "s"} awaiting your yes:**`,
        ...pending.slice(0, 6).map((p) => `• ${p.date === today ? "Today" : WD[weekdayOf(p.date)]} ${minToLabel(p.startMin)} — ${p.customer.name} · ${p.service.name} · ${p.staff.name}`),
        pending.length > 6 ? `…and ${pending.length - 6} more on the Appointments board.` : "",
      ]),
      chips: ["Who's coming in today?", "How's this week looking?"],
    };
  }

  // 11. stock: low / product lookup
  if (/\b(low stock|running out|restock|inventory|stock levels?|products?|retail|shampoo|out of)\b/.test(msg)) {
    const products = await db.product.findMany({ where: { active: true }, orderBy: { stock: "asc" } });
    // "stock of X" — a specific product
    const nameHit = products.find((p) => {
      const first = strip(p.name).split(" ")[0];
      return first.length > 2 && new RegExp(`\\b${first}\\b`).test(msg);
    });
    if (nameHit) {
      return {
        text: `**${nameHit.name}**${nameHit.brand ? ` (${nameHit.brand})` : ""}: **${nameHit.stock} on the shelf**, ${money(nameHit.price, sym)} each. ${nameHit.stock <= nameHit.lowStockAt ? "⚠️ That's at or below the reorder point." : ""}`,
        chips: ["Any low stock?", "Best selling product?"],
      };
    }
    const low = products.filter((p) => p.stock <= p.lowStockAt);
    const out = low.filter((p) => p.stock === 0);
    if (!products.length) return { text: "No retail products in the catalog yet — add some on the Retail & stock page.", chips: YES_CHIPS };
    if (!low.length) {
      return { text: `Stock is healthy across all ${products.length} products — nothing at or below the reorder line. 👍`, chips: ["Best selling product?", "How's retail revenue this month?"] };
    }
    return {
      text: list([
        `**${low.length} product${low.length === 1 ? "" : "s"} need attention**${out.length ? ` (${out.length} sold out!)` : ""}:`,
        ...low.slice(0, 7).map((p) => `• ${p.name} — **${p.stock === 0 ? "SOLD OUT" : `${p.stock} left`}${p.stock ? "" : ""}** (alert at ${p.lowStockAt})`),
      ]),
      chips: ["How's retail revenue this month?", "Best selling product?"],
    };
  }

  // 12. staff performance — defaults to 30 days when no period is named
  if (/\b(staff|team|stylist|barber|commission|leaderboard|who (sold|earned|did (the )?most)|perform)\b/.test(msg) && !/\bfree\b/.test(msg)) {
    const perfPeriod = /\b(today|yesterday|tomorrow|week|month|day)\b/.test(msg) ? period : ({ kind: "back", days: 30 } as Period);
    const perfRange = periodRange(perfPeriod, tz);
    const rows = await salesIn(perfRange.start, perfRange.end);
    const agg = new Map<string, { name: string; revenue: number; tips: number; commission: number; sales: number }>();
    for (const s of rows) {
      const key = s.staff?.id ?? "desk";
      const a = agg.get(key) ?? { name: s.staff?.name ?? "Front desk", revenue: 0, tips: 0, commission: 0, sales: 0 };
      const serviceLine = parseItems(s.items).filter((i) => i.kind === "service").reduce((x, i) => x + i.price * i.qty, 0);
      a.revenue += s.subtotal - s.discount;
      a.tips += s.tip;
      a.sales += 1;
      if (s.staff && s.staff.commissionPct > 0 && serviceLine > 0) {
        a.commission += Math.round((serviceLine * s.staff.commissionPct) / 100);
      }
      agg.set(key, a);
    }
    const ranked = [...agg.values()].sort((a, b) => b.revenue - a.revenue);
    if (!ranked.length) return { text: `No sales recorded in ${periodLabel(perfPeriod)} yet.`, chips: ["How's this week looking?"] };
    return {
      text: list([
        `**The board for ${periodLabel(perfPeriod)}:**`,
        ...ranked.slice(0, 5).map((r, i) =>
          `${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "•"} **${r.name}** — ${money(r.revenue, sym)} revenue · ${r.sales} ticket${r.sales === 1 ? "" : "s"}${r.commission ? ` · ${money(r.commission, sym)} commission` : ""}${r.tips ? ` · ${money(r.tips, sym)} tips` : ""}`),
      ]),
      chips: ["Best selling service?", "Tips this month?"],
    };
  }

  // 13. tips
  if (/\btips?\b/.test(msg)) {
    const s = summarizeSales(await salesIn());
    const perTicket = s.count ? Math.round(s.tips / s.count) : 0;
    return {
      text: `**${money(s.tips, sym)} in tips** across ${rangeLabel} — ${money(perTicket, sym)} average per ticket (${s.count} ticket${s.count === 1 ? "" : "s"}). ${s.tips === 0 ? "" : "The regulars are treating the team well. 💛"}`,
      chips: ["Who earned the most?", "How's revenue this week?"],
    };
  }

  // 14. best sellers — defaults to 30 days when no period is named
  if (/\b(best|top|most|popular|favorite|favourite|selling)\b.*\b(service|seller|sellers|treatment|product|retail|menu)?\b/.test(msg) || /\bbest sellers?\b/.test(msg)) {
    const sellPeriod = /\b(today|yesterday|tomorrow|week|month|day)\b/.test(msg) ? period : ({ kind: "back", days: 30 } as Period);
    const sellRange = periodRange(sellPeriod, tz);
    const rows = await salesIn(sellRange.start, sellRange.end);
    const svc = new Map<string, { name: string; rev: number; qty: number }>();
    const prd = new Map<string, { name: string; rev: number; qty: number }>();
    for (const s of rows) {
      for (const it of parseItems(s.items)) {
        const bucket = it.kind === "service" ? svc : prd;
        const a = bucket.get(it.id) ?? { name: it.name, rev: 0, qty: 0 };
        a.rev += it.price * it.qty;
        a.qty += it.qty;
        bucket.set(it.id, a);
      }
    }
    const wantsProduct = /\b(product|retail|shampoo|cream|oil)\b/.test(msg);
    const src = wantsProduct ? prd : svc;
    const top = [...src.values()].sort((a, b) => b.rev - a.rev).slice(0, 3);
    if (!top.length) {
      return wantsProduct
        ? { text: `No retail sales in ${periodLabel(sellPeriod)} — the shelf's waiting. A display by the register usually fixes that. 🧴`, chips: ["Any low stock?"] }
        : { text: `No services sold in ${periodLabel(sellPeriod)} yet.`, chips: ["How's this week looking?"] };
    }
    const other = wantsProduct ? "service" : "retail";
    return {
      text: list([
        `**${wantsProduct ? "Top products" : "Top services"} for ${periodLabel(sellPeriod)}:**`,
        ...top.map((t, i) => `${i === 0 ? "🏆" : "•"} **${t.name}** — ${t.qty} sold, ${money(t.rev, sym)}`),
      ]),
      chips: [wantsProduct ? "Best selling service?" : "Best selling product?", `How's ${other} revenue this month?`],
    };
  }

  // 15. regulars / VIP
  if (/\b(regulars?|vip|loyal|best clients?|top clients?|frequent)\b/.test(msg)) {
    const visits = await db.appointment.groupBy({ by: ["customerId"], where: { status: { in: OPEN_STATUSES } }, _count: true });
    const spent = await db.sale.groupBy({ by: ["customerId"], _sum: { subtotal: true, discount: true }, _count: true });
    const spendMap = new Map(spent.map((s) => [s.customerId, (s._sum.subtotal ?? 0) - (s._sum.discount ?? 0)]));
    const top = visits
      .filter((v) => v.customerId)
      .sort((a, b) => (spendMap.get(b.customerId) ?? 0) - (spendMap.get(a.customerId) ?? 0))
      .slice(0, 5);
    if (!top.length) return { text: "No regulars on the book yet — every empire starts with one. 💇", chips: ["New clients this month?"] };
    const customers = await db.customer.findMany({ where: { id: { in: top.map((t) => t.customerId) } } });
    const nameOf = (id: string) => customers.find((c) => c.id === id)?.name ?? "Unknown";
    return {
      text: list([
        "**Your pillar clients** (most spent):",
        ...top.map((t, i) => `• **${nameOf(t.customerId)}** — ${t._count} visit${t._count === 1 ? "" : "s"}, ${money(spendMap.get(t.customerId) ?? 0, sym)} lifetime`),
      ]),
      chips: ["New clients this month?", "Find a client"],
    };
  }

  // 16. new clients
  if (/\bnew (clients?|customers?|faces)\b/.test(msg)) {
    const since = range.start;
    const rows = await db.customer.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
    });
    if (!rows.length) return { text: `No first-timers in ${rangeLabel} — a referral offer could wake that up. 🎁`, chips: ["Who are the regulars?"] };
    return {
      text: `**${rows.length} new client${rows.length === 1 ? "" : "s"}** in ${rangeLabel}: ${rows.slice(0, 6).map((c) => c.name).join(", ")}${rows.length > 6 ? ` and ${rows.length - 6} more` : ""}. ${rows.length >= 5 ? "The marketing's working. 📈" : ""}`,
      chips: ["Who are the regulars?", "How many clients in total?"],
    };
  }

  // 17. total clients
  if (/\bhow many (clients?|customers?)\b|\btotal (clients?|customers?)\b/.test(msg)) {
    const total = await db.customer.count();
    const monthAgo = salonDayStart(salonDaysAgo(tz, -29), tz);
    const recent = await db.customer.count({ where: { createdAt: { gte: monthAgo } } });
    return { text: `**${total} clients** in the book, ${recent} of them added in the last 30 days.`, chips: ["Who are the regulars?", "New clients this month?"] };
  }

  // 18. client lookup
  const lookupName = looksLikeLookup(msg);
  if (lookupName) {
    const needle = strip(lookupName);
    const staffHit = await db.staff.findFirst({ where: { name: { contains: needle } } });
    if (staffHit && /\b(who is|who's)\b/.test(msg)) {
      const todayWd = weekdayOf(today);
      const worksToday = staffHit.workingDays.split(",").map(Number).includes(todayWd);
      return {
        text: `**${staffHit.name}** — ${staffHit.title}. ${worksToday ? `Working today ${minToLabel(staffHit.shiftStartMin)}–${minToLabel(staffHit.shiftEndMin)}.` : `Off today; rostered ${staffHit.workingDays.split(",").map(Number).sort().map((d) => WD[d].slice(0, 3)).join(", ")}.`}`,
        chips: ["Who's working today?", "How's the team doing this week?"],
      };
    }
    const hits = await db.customer.findMany({ where: { name: { contains: needle } }, take: 3 });
    if (!hits.length) {
      return { text: `No client named “${lookupName.trim()}” in the book. Try a first name, or check the Clients page.`, chips: ["Who are the regulars?"] };
    }
    const detail = await Promise.all(hits.map(async (c) => {
      const [apptCount, lastAppt, salesAgg] = await Promise.all([
        db.appointment.count({ where: { customerId: c.id, status: { in: OPEN_STATUSES } } }),
        db.appointment.findFirst({ where: { customerId: c.id, status: { in: OPEN_STATUSES } }, orderBy: [{ date: "desc" }, { startMin: "desc" }] }),
        db.sale.aggregate({ where: { customerId: c.id }, _sum: { subtotal: true, discount: true, tip: true }, _count: true }),
      ]);
      const spent = (salesAgg._sum.subtotal ?? 0) - (salesAgg._sum.discount ?? 0);
      const notes = c.notes ? `\n  📝 ${c.notes}` : "";
      const last = lastAppt ? `last visit ${lastAppt.date === today ? "today" : lastAppt.date}` : "no visits yet";
      return `**${c.name}** (${c.phone})\n  ${apptCount} appointment${apptCount === 1 ? "" : "s"} · ${money(spent, sym)} spent · ${last}${salesAgg._sum.tip ? ` · ${money(salesAgg._sum.tip, sym)} tips left` : ""}${notes}`;
    }));
    return { text: detail.join("\n\n"), chips: ["Who are the regulars?", "Upcoming bookings?"] };
  }

  // 19. working today / roster
  if (/\b(working (today|tomorrow)|roster|shifts?|who.?s (in|on)|on duty)\b/.test(msg) && !/\bfree\b/.test(msg)) {
    const date = /\btomorrow\b/.test(msg) ? salonDaysAgo(tz, -1) : today;
    const wd = weekdayOf(date);
    const staffAll = await db.staff.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
    const onDuty = staffAll.filter((s) => s.workingDays.split(",").map(Number).includes(wd));
    const off = staffAll.filter((s) => !s.workingDays.split(",").map(Number).includes(wd));
    return {
      text: list([
        `**${date === today ? "Today's" : "Tomorrow's"} chairs:**`,
        ...onDuty.map((s) => `• **${s.name}** — ${minToLabel(s.shiftStartMin)}–${minToLabel(s.shiftEndMin)}`),
        off.length ? `Off: ${off.map((s) => s.name.split(" ")[0]).join(", ")}.` : "",
      ]),
      chips: ["Who's coming in today?", "Who's free at 3pm?"],
    };
  }

  // 20. busiest / quietest
  if (/\b(busiest|busier|quietest|slowest|peak|when are we (busiest|quiet))\b/.test(msg)) {
    const from = salonDaysAgo(tz, -27);
    const rows = await db.sale.findMany({
      where: { createdAt: { gte: salonDayStart(from, tz) } },
      select: { createdAt: true, subtotal: true, discount: true },
    });
    if (!rows.length) return { text: "Not enough sales history yet to find a pattern.", chips: YES_CHIPS };
    const byWd = new Map<number, number>();
    for (const r of rows) byWd.set(weekdayOf(salonDateOf(r.createdAt, tz)), (byWd.get(weekdayOf(salonDateOf(r.createdAt, tz))) ?? 0) + r.subtotal - r.discount);
    const ranked = [...byWd.entries()].sort((a, b) => b[1] - a[1]);
    const busiest = ranked[0];
    const quiet = ranked[ranked.length - 1];
    const asksQuiet = /\b(quiet|slow)\b/.test(msg);
    const [wd, rev] = asksQuiet ? quiet : busiest;
    return {
      text: `**${WD[wd]}** is your ${asksQuiet ? "quietest" : "busiest"} day — ${money(rev, sym)} over the last 4 weeks. ${asksQuiet ? "Perfect for pushing a mid-week offer. 📣" : "Staff it like it matters. 💪"}`,
      chips: ["Busiest hour?", "How's revenue this week?"],
    };
  }

  // 21. opening hours
  if (/\b(open|hours|close|closing|when (are|do) we|what time)\b/.test(msg) && !/\bhow much\b/.test(msg)) {
    const open = setting ? minToLabel(setting.openMin) : "09:00";
    const close = setting ? minToLabel(setting.closeMin) : "19:00";
    const closed = (setting?.closedDays ?? "0").split(",").filter(Boolean).map((d) => WD[Number(d)]);
    const isOpenToday = !(setting?.closedDays ?? "0").split(",").includes(String(weekdayOf(today)));
    return {
      text: `Hours: **${open}–${close}**${closed.length && closed[0] !== undefined ? `, closed on ${closed.join(", ")}` : ", open every day"}. ${isOpenToday ? `Today we're ${clock.min < (setting?.openMin ?? 540) ? "not open yet" : clock.min < (setting?.closeMin ?? 1140) ? "open now" : "closed for the day"}.` : "We're closed today."}`,
      chips: ["Who's working today?", "Who's coming in today?"],
    };
  }

  // 22. payment methods
  if (/\b(cash|card|payment|pay by|method)\b/.test(msg)) {
    const rows = await salesIn();
    const split = new Map<string, number>();
    for (const r of rows) split.set(r.method, (split.get(r.method) ?? 0) + r.total);
    if (!rows.length) return { text: `No payments taken in ${rangeLabel} yet.`, chips: YES_CHIPS };
    const total = [...split.values()].reduce((a, b) => a + b, 0);
    return {
      text: `Payments ${rangeLabel}: ${[...split.entries()].sort((a, b) => b[1] - a[1]).map(([m, v]) => `**${m === "CASH" ? "Cash" : m === "CARD" ? "Card" : "Mobile"}** ${money(v, sym)} (${Math.round((v / total) * 100)}%)`).join(" · ")}.`,
      chips: ["How's revenue this week?", "Discounts given this month?"],
    };
  }

  // 23. discounts
  if (/\bdiscount/.test(msg)) {
    const s = summarizeSales(await salesIn());
    return {
      text: `**${money(s.discounts, sym)}** given away in ${rangeLabel} across ${s.count} ticket${s.count === 1 ? "" : "s"}${s.revenue ? ` — that's ${Math.round((s.discounts / Math.max(1, s.revenue + s.discounts)) * 100)}% of gross` : ""}. ${s.discounts > s.revenue * 0.15 ? "That's running hot — worth a look. 👀" : ""}`,
      chips: ["How's revenue this week?", "Tips this month?"],
    };
  }

  // 24. revenue / sales / performance (the money question) + service price guard first
  if (/\bhow much is\b|\bprice (of|for)\b|\bcost (of|for)?\b/.test(msg)) {
    const services = await db.service.findMany({ where: { active: true } });
    const hit = services.find((s) => {
      const words = strip(s.name).split(" ").filter((w) => w.length > 2);
      return words.some((w) => new RegExp(`\\b${w}\\b`).test(msg));
    });
    if (hit) {
      const who = await db.serviceStaff.findMany({ where: { serviceId: hit.id }, include: { staff: { select: { name: true } } } });
      return {
        text: `**${hit.name}** — ${money(hit.price, sym)}, ${hit.durationMin} min. ${who.length ? `Done by ${who.map((w) => w.staff.name).join(", ")}.` : ""}${hit.description ? `\n${hit.description}` : ""}`,
        chips: ["How's revenue this week?", "Best selling service?"],
      };
    }
    return { text: `I couldn't find that on the menu — want the full price list? It's on the Services page, or ask me “best selling service”.`, chips: ["Best selling service?"] };
  }

  if (/\b(revenue|how (much|did we do|are we doing|much did|much have)|made|make|earn|sales|take|gross|net|income|performance|doing)\b/.test(msg)) {
    const s = summarizeSales(await salesIn());
    const appts = await db.appointment.groupBy({ by: ["status"], where: { date: { gte: range.from, lte: range.to } }, _count: true });
    const map = Object.fromEntries(appts.map((a) => [a.status, a._count]));
    const apptTotal = appts.reduce((a, x) => a + x._count, 0);
    return {
      text: list([
        `**${rangeLabel.charAt(0).toUpperCase()}${rangeLabel.slice(1)}:** ${money(s.revenue, sym)} revenue`,
        `• ${s.count} ticket${s.count === 1 ? "" : "s"} · avg ${money(s.avg, sym)}`,
        `• ${money(s.tips, sym)} tips · ${money(s.discounts, sym)} discounts`,
        s.retail ? `• ${money(s.retail, sym)} from retail` : "",
        apptTotal ? `• ${apptTotal} appointments${map.NO_SHOW ? `, ${map.NO_SHOW} no-show` : ""}${map.PENDING ? `, ${map.PENDING} pending` : ""}` : "",
      ].filter(Boolean)),
      chips: ["Best selling service?", "Who earned the most?", "Compare to last week?"],
    };
  }

  // 25. walk-ins / online bookings
  if (/\bwalk.?ins?\b/.test(msg) || /\b(booked online|online booking|through the site)\b/.test(msg)) {
    const source = /\bwalk\b/.test(msg) ? "WALK_IN" : "ONLINE";
    const count = await db.appointment.count({ where: { source, date: { gte: range.from, lte: range.to } } });
    const total = await db.appointment.count({ where: { date: { gte: range.from, lte: range.to } } });
    return {
      text: `**${count}** of ${total} appointments in ${rangeLabel} came ${source === "WALK_IN" ? "off the street 🚶" : "through the online booking page 💻"}.`,
      chips: ["Who's coming in today?", "How's this week looking?"],
    };
  }

  // 26. fallback
  return {
    text: "Hmm, that one's outside my book. I'm sharpest on bookings, revenue, stock, clients and the team — try one of these:",
    chips: ["Who's coming in today?", "How did we do this week?", "What can you do?"],
  };
}
