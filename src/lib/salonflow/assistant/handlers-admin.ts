/**
 * Aria's admin handlers — the owner's-side brain. Money, clients, stock,
 * the team, the floor. Everything reads the live database on the salon's
 * own clock and currency.
 *
 * Upgrades over v1.8: closed-hours intelligence (suggests the nearest real
 * slot instead of shrugging), follow-up memory, typo-tolerant lookups.
 */
import { db } from "@/lib/db";
import type { AssistantReply } from "./types";
import type { Ctx } from "./engine";
import {
  parseTime, periodLabel, periodRange, resolveDate,
  looksLikeLookup, bestNameMatch, matchService, strip, tokenize,
  salonDaysAgo, salonDayStart, salonDayEnd, salonDateOf, weekdayOf,
} from "./entities";
import { minToLabel, parseItems } from "../time";

const OPEN_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED"];
const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const money = (cents: number, sym = "$") =>
  `${sym}${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const list = (items: string[]) => items.join("\n");
const YES_CHIPS = ["How's revenue this week?", "Any low stock?", "Who's next?"];

/** First moment (on 15-min steps) where any on-duty staffer has 30 free minutes. */
function nextFreeFrom(
  onDuty: { id: string; name: string; shiftStartMin: number; shiftEndMin: number }[],
  busy: { staffId: string; startMin: number; endMin: number }[],
  fromMin: number,
  closeMin: number
): { min: number; names: string[] } | null {
  for (let m = Math.ceil(fromMin / 15) * 15; m + 30 <= closeMin; m += 15) {
    const free = onDuty.filter(
      (s) => m >= s.shiftStartMin && m + 30 <= s.shiftEndMin &&
        !busy.some((b) => b.staffId === s.id && m < b.endMin && m + 30 > b.startMin)
    );
    if (free.length) return { min: m, names: free.map((f) => f.name) };
  }
  return null;
}

/** Next day (within a week) the salon isn't closed. */
function nextOpenDay(closedDays: string[], todayWd: number): { wd: number; diff: number } | null {
  for (let d = 1; d <= 7; d++) {
    const wd = (todayWd + d) % 7;
    if (!closedDays.includes(String(wd))) return { wd, diff: d };
  }
  return null;
}

/* ── handlers ────────────────────────────────────────────────────────── */

export const ADMIN_HANDLERS: Record<string, (c: Ctx) => Promise<AssistantReply | null>> = {
  /* 0. help */
  async help(c) {
    return {
      text: list([
        "I'm Aria — I live inside your SalonFlow and I read your real numbers. Ask me things like:",
        "• “Who's coming in today?” / “Who's free at 3pm?”",
        "• “How did we do this week?” / “Revenue last 30 days”",
        "• “Any low stock?” / “Best selling service”",
        "• “Find Maya” / “Who are the regulars?”",
        "• “No-shows this month” / “Who earned the most?”",
        "• “Busiest day” / “When are we open?”",
        "I also remember what we were just talking about — try “what about sunday?” after an availability question.",
      ]),
      chips: ["Who's coming in today?", "How did we do this week?", "Any low stock?"],
    };
  },

  /* 1. identity */
  async identity() {
    return {
      text: "I'm Aria — the front-desk brain built into this app. No cloud, no keys: I was written by hand, with a small neural net running right here in the browser, and I read your own database — everything I say stays here. 🧠",
      chips: ["What can you do?", "Who's next?"],
    };
  },

  /* 2. thanks */
  async thanks() {
    return { text: "Anytime. The book's always open if you need me. 💐", chips: ["How's today looking?"] };
  },

  /* 3. bye */
  async bye() {
    return { text: "See you on the floor. ✂️", chips: ["How's today looking?"] };
  },

  /* 4. greeting → snapshot of the day */
  async greeting(c) {
    if (tokenize(c.msg).length > 3) return null; // "hey can you check X" isn't a greeting
    const appts = await db.appointment.findMany({
      where: { date: c.today, status: { in: OPEN_STATUSES } },
      include: { customer: { select: { name: true } }, service: { select: { name: true } }, staff: { select: { name: true } } },
      orderBy: { startMin: "asc" },
    });
    const sales = c.summarizeSales(await c.salesIn(salonDayStart(c.today, c.tz), salonDayEnd(c.today, c.tz)));
    const remaining = appts.filter((a) => a.startMin >= c.clock.min).length;
    const hello = c.clock.min < 300 ? "Up late" : c.clock.min < 720 ? "Morning" : c.clock.min < 1020 ? "Afternoon" : "Evening";
    return {
      text: `${hello}! ${WD[weekdayOf(c.today)]} at ${c.setting?.salonName ?? "the salon"}: **${appts.length} appointment${appts.length === 1 ? "" : "s"}** on the book${remaining ? `, ${remaining} still ahead` : " — all wrapped"}, and ${money(sales.revenue, c.sym)} rung through so far. What do you need?`,
      chips: ["Who's next?", "Who's free right now?", "Any low stock?"],
    };
  },

  /* 5. who's free at <time> — now with floor intelligence */
  async free_at(c) {
    const closedDays = (c.setting?.closedDays ?? "0").split(",").filter(Boolean);
    const openMin = c.setting?.openMin ?? 540;
    const closeMin = c.setting?.closeMin ?? 1140;

    const date = resolveDate(c.msg, c.today, c.tz);
    let t = parseTime(c.msg, { nowMin: c.clock.min });
    if (t === null && /\b(right now|now|currently|at the moment)\b/.test(c.msg)) t = c.clock.min;
    // follow-up memory: "what about sunday?" after "who's free at 3pm"
    if (t === null && date !== c.today && c.mem.lastTimeMin != null) t = c.mem.lastTimeMin;

    const staffAll = await db.staff.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
    const wd = weekdayOf(date);
    const onDuty = staffAll.filter((s) => s.workingDays.split(",").map(Number).includes(wd));

    const dayLabel = date === c.today ? "today" : WD[wd];

    // a day was named but no time → show the roster for that day, offer times
    if (t === null) {
      if (date !== c.today || /\b(today|right now)\b/.test(c.msg)) {
        if (onDuty.length) {
          return {
            text: list([
              `**Chairs on ${dayLabel}:**`,
              ...onDuty.map((s) => `• **${s.name}** — ${minToLabel(s.shiftStartMin)}–${minToLabel(s.shiftEndMin)}`),
              `Open ${minToLabel(openMin)}–${minToLabel(closeMin)}. Ask “who's free at 3pm${date === c.today ? "" : ` ${dayLabel}`}” for the exact picture.`,
            ]),
            chips: [`Who's free at 11am ${date === c.today ? "" : dayLabel}`, `Who's coming in ${date === c.today ? "today" : dayLabel}`].map(x => x.replace(/\s+/g, " ")),
            next: { date },
          };
        }
        return { text: `Nobody's rostered for ${dayLabel} — that's a closed chair day. Want another day?`, chips: ["Who's working today?"] };
      }
      return { text: "Sure — what time? Say “who's free at 3pm” and I'll check the floor.", chips: ["Who's free at 3pm?", "Who's free right now?"] };
    }

    const busy = await db.appointment.findMany({
      where: { date, staffId: { in: staffAll.map((s) => s.id) }, status: { in: OPEN_STATUSES } },
      select: { staffId: true, startMin: true, endMin: true },
    });
    const isToday = date === c.today;
    const label = `${minToLabel(t)}${isToday ? " today" : ` ${WD[wd]}`}`;

    // closed day → find the next open one
    if (closedDays.includes(String(wd))) {
      const next = nextOpenDay(closedDays, wd);
      if (next) {
        const d = salonDaysAgo(c.tz, next.diff);
        return {
          text: `We're closed on ${WD[wd]}s — the salon's dark that day. Next open day is **${WD[next.wd]}**, open ${minToLabel(openMin)}–${minToLabel(closeMin)}. Want me to check ${minToLabel(Math.max(openMin + 60, 660))} on ${WD[next.wd]}?`,
          chips: [`Who's free at 11am ${WD[next.wd]}`],
          next: { date: d, time: t },
        };
      }
      return { text: `We're closed on ${WD[wd]}s — and honestly the whole week's closed, which shouldn't happen. Check Settings → Opening hours.`, chips: [] };
    }

    // already gone by → find the next real opening today
    if (isToday && t <= c.clock.min) {
      const next = nextFreeFrom(onDuty, busy, c.clock.min + 5, closeMin);
      if (next) {
        return {
          text: `${minToLabel(t)} has already gone by on the salon clock. The next chair opens at **${minToLabel(next.min)}** — ${next.names.map((n) => `**${n.split(" ")[0]}**`).join(", ")} free there.`,
          chips: [`Who's free at ${minToLabel(next.min)}?`],
          next: { time: next.min, date },
        };
      }
      return { text: `${minToLabel(t)} has gone by and nothing's left today — the floor's wrapped. Want tomorrow's picture?`, chips: ["Who's free at 10am tomorrow?"] };
    }

    // asking past closing → offer the last real chair
    if (t + 30 > closeMin) {
      const last = closeMin - 30;
      return {
        text: `We close at **${minToLabel(closeMin)}** — there's no ${minToLabel(t)} chair. The last slot of the day is **${minToLabel(last)}**.`,
        chips: [`Who's free at ${minToLabel(last)}?`, "When are we open?"],
        next: { time: last, date },
      };
    }

    if (onDuty.length === 0) {
      const next = nextOpenDay(closedDays, wd);
      return {
        text: `Nobody's rostered for ${WD[wd]} — that's a closed chair day.${next ? ` Next full floor is **${WD[next.wd]}**.` : ""}`,
        chips: ["Who's working today?"],
      };
    }

    const free = onDuty.filter(
      (s) => t >= s.shiftStartMin && t + 30 <= s.shiftEndMin &&
        !busy.some((b) => b.staffId === s.id && t < b.endMin && t + 30 > b.startMin)
    );
    if (free.length) {
      return {
        text: `Free at **${label}**: ${free.map((f) => `**${f.name}**`).join(", ")}. ${free.length === onDuty.length ? "Whole floor's open. 🎉" : ""}`,
        chips: ["Who's next?", "Who's coming in today?"],
        next: { time: t, date },
      };
    }

    // everyone's tied up → find the first chair that opens
    const next = nextFreeFrom(onDuty, busy, t + 5, closeMin);
    if (next) {
      return {
        text: `Everyone's booked at **${label}** — ${onDuty.map((f) => f.name.split(" ")[0]).join(", ")} are all in the chair. First chair opens at **${minToLabel(next.min)}** (${next.names.map((n) => n.split(" ")[0]).join(", ")}).`,
        chips: [`Who's free at ${minToLabel(next.min)}?`],
        next: { time: next.min, date },
      };
    }
    return {
      text: `Everyone's booked at **${label}** and nothing frees up before close (${minToLabel(closeMin)}). Tomorrow, though?`,
      chips: ["Who's free at 10am tomorrow?"],
      next: { time: t, date },
    };
  },

  /* 6. next appointment */
  async next_appt(c) {
    const next = await db.appointment.findFirst({
      where: { status: { in: ["PENDING", "CONFIRMED"] }, date: { gte: c.today }, startMin: { gte: c.today === c.clock.date ? c.clock.min : 0 } },
      orderBy: [{ date: "asc" }, { startMin: "asc" }],
      include: { customer: { select: { name: true } }, service: { select: { name: true } }, staff: { select: { name: true } } },
    });
    if (!next) return { text: "Nothing left on the book after now. Time for a deep-clean of the stations. 🧹", chips: YES_CHIPS };
    const when = next.date === c.today ? `today at ${minToLabel(next.startMin)}` : `${WD[weekdayOf(next.date)]} ${minToLabel(next.startMin)}`;
    return {
      text: `Up next: **${next.customer.name}** — ${next.service.name} with ${next.staff.name}, ${when}. (${next.status === "PENDING" ? "still awaiting confirmation" : "confirmed"})`,
      chips: ["Who's free after that?", "How's today looking?"],
      next: { time: next.startMin, date: next.date },
    };
  },

  /* 7. in the chair right now */
  async in_chair(c) {
    const inChair = await db.appointment.findMany({
      where: { date: c.today, status: { in: ["CONFIRMED", "COMPLETED"] }, startMin: { lte: c.clock.min }, endMin: { gt: c.clock.min } },
      include: { customer: { select: { name: true } }, service: { select: { name: true } }, staff: { select: { name: true } } },
    });
    if (!inChair.length) {
      return {
        text: c.clock.min < (c.setting?.openMin ?? 540) ? "We're not open yet — chairs are empty and the kettle's on. ☕" : "Chairs are empty right now — quiet moment on the floor.",
        chips: ["Who's next?", "Who's free right now?"],
      };
    }
    return {
      text: `In the chair right now: ${inChair.map((a) => `**${a.customer.name}** (${a.service.name} with ${a.staff.name})`).join(", ")}.`,
      chips: ["Who's next?", "How's today looking?"],
    };
  },

  /* 8. schedule / agenda */
  async schedule(c) {
    const schedDay = resolveDate(c.msg, c.today, c.tz);
    const appts = await db.appointment.findMany({
      where: { date: schedDay },
      include: {
        customer: { select: { name: true } },
        service: { select: { name: true, durationMin: true } },
        staff: { select: { name: true } },
      },
      orderBy: { startMin: "asc" },
    });
    const when = schedDay === c.today ? "Today" : schedDay === salonDaysAgo(c.tz, -1) ? "Tomorrow" : WD[weekdayOf(schedDay)];
    if (!appts.length) {
      return {
        text: `${when} is wide open — zero appointments. Good day for a promo post. 📣`,
        chips: ["How did we do yesterday?", "Who are the regulars?"],
        next: { date: schedDay },
      };
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
      chips: schedDay === c.today ? ["Who's next?", "Who's free at 3pm?", "Revenue today?"] : ["How did we do yesterday?", "Best selling service?"],
      next: { date: schedDay },
    };
  },

  /* 9. no-shows */
  async no_shows(c) {
    const rows = await db.appointment.groupBy({
      by: ["status"],
      where: { date: { gte: c.range.from, lte: c.range.to } },
      _count: true,
    });
    const map = Object.fromEntries(rows.map((r) => [r.status, r._count]));
    const total = rows.reduce((a, r) => a + r._count, 0);
    const ns = map.NO_SHOW ?? 0;
    const rate = total ? Math.round((ns / total) * 1000) / 10 : 0;
    return {
      text: `In ${c.rangeLabel}: **${ns} no-show${ns === 1 ? "" : "s"}** out of ${total} appointments (${rate}%). ${rate > 8 ? "That's worth a deposit policy on peak hours. 📌" : "Under control. 👌"}`,
      chips: ["Cancellations this month?", "How's revenue this week?"],
    };
  },

  /* 10. cancellations */
  async cancellations(c) {
    const rows = await db.appointment.groupBy({
      by: ["status"],
      where: { date: { gte: c.range.from, lte: c.range.to } },
      _count: true,
    });
    const map = Object.fromEntries(rows.map((r) => [r.status, r._count]));
    const x = map.CANCELLED ?? 0;
    const total = rows.reduce((a, r) => a + r._count, 0);
    return {
      text: `**${x} cancellation${x === 1 ? "" : "s"}** in ${c.rangeLabel} (${total ? Math.round((x / total) * 1000) / 10 : 0}% of all appointments). ${x > 0 ? "A rebooking nudge usually wins most of them back." : ""}`,
      chips: ["No-shows this month?", "Pending approvals?"],
    };
  },

  /* 11. pending approvals */
  async pending(c) {
    const pending = await db.appointment.findMany({
      where: { status: "PENDING", date: { gte: c.today } },
      include: { customer: { select: { name: true } }, service: { select: { name: true } }, staff: { select: { name: true } } },
      orderBy: [{ date: "asc" }, { startMin: "asc" }],
    });
    if (!pending.length) return { text: "Zero pending requests — every booking on the calendar is confirmed. ✅", chips: ["Who's coming in today?"] };
    return {
      text: list([
        `**${pending.length} booking${pending.length === 1 ? "" : "s"} awaiting your yes:**`,
        ...pending.slice(0, 6).map((p) => `• ${p.date === c.today ? "Today" : WD[weekdayOf(p.date)]} ${minToLabel(p.startMin)} — ${p.customer.name} · ${p.service.name} · ${p.staff.name}`),
        pending.length > 6 ? `…and ${pending.length - 6} more on the Appointments board.` : "",
      ]),
      chips: ["Who's coming in today?", "How's this week looking?"],
    };
  },

  /* 12. stock */
  async stock(c) {
    const products = await db.product.findMany({ where: { active: true }, orderBy: { stock: "asc" } });
    const nameHit = products.find((p) => {
      const first = strip(p.name).split(" ")[0];
      return first.length > 2 && new RegExp(`\\b${first}\\b`).test(c.msg);
    });
    if (nameHit) {
      return {
        text: `**${nameHit.name}**${nameHit.brand ? ` (${nameHit.brand})` : ""}: **${nameHit.stock} on the shelf**, ${money(nameHit.price, c.sym)} each. ${nameHit.stock <= nameHit.lowStockAt ? "⚠️ That's at or below the reorder point." : ""}`,
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
        ...low.slice(0, 7).map((p) => `• ${p.name} — **${p.stock === 0 ? "SOLD OUT" : `${p.stock} left`}** (alert at ${p.lowStockAt})`),
      ]),
      chips: ["How's retail revenue this month?", "Best selling product?"],
    };
  },

  /* 13. staff leaderboard */
  async leaderboard(c) {
    const perfPeriod = /\b(today|yesterday|tomorrow|week|month|day)\b/.test(c.msg) ? c.period : ({ kind: "back", days: 30 } as const);
    const perfRange = periodRange(perfPeriod, c.tz);
    const rows = await c.salesIn(perfRange.start, perfRange.end);
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
          `${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "•"} **${r.name}** — ${money(r.revenue, c.sym)} revenue · ${r.sales} ticket${r.sales === 1 ? "" : "s"}${r.commission ? ` · ${money(r.commission, c.sym)} commission` : ""}${r.tips ? ` · ${money(r.tips, c.sym)} tips` : ""}`),
      ]),
      chips: ["Best selling service?", "Tips this month?"],
    };
  },

  /* 14. tips */
  async tips(c) {
    const s = c.summarizeSales(await c.salesIn());
    const perTicket = s.count ? Math.round(s.tips / s.count) : 0;
    return {
      text: `**${money(s.tips, c.sym)} in tips** across ${c.rangeLabel} — ${money(perTicket, c.sym)} average per ticket (${s.count} ticket${s.count === 1 ? "" : "s"}). ${s.tips === 0 ? "" : "The regulars are treating the team well. 💛"}`,
      chips: ["Who earned the most?", "How's revenue this week?"],
    };
  },

  /* 15. best sellers */
  async best_sellers(c) {
    const sellPeriod = /\b(today|yesterday|tomorrow|week|month|day)\b/.test(c.msg) ? c.period : ({ kind: "back", days: 30 } as const);
    const sellRange = periodRange(sellPeriod, c.tz);
    const rows = await c.salesIn(sellRange.start, sellRange.end);
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
    const wantsProduct = /\b(product|retail|shampoo|cream|oil)\b/.test(c.msg);
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
        ...top.map((t, i) => `${i === 0 ? "🏆" : "•"} **${t.name}** — ${t.qty} sold, ${money(t.rev, c.sym)}`),
      ]),
      chips: [wantsProduct ? "Best selling service?" : "Best selling product?", `How's ${other} revenue this month?`],
    };
  },

  /* 16. regulars */
  async regulars(c) {
    const visits = await db.appointment.groupBy({ by: ["customerId"], where: { status: { in: OPEN_STATUSES } }, _count: true });
    const spent = await db.sale.groupBy({ by: ["customerId"], _sum: { subtotal: true, discount: true }, _count: true });
    const spendMap = new Map(spent.map((s) => [s.customerId, (s._sum.subtotal ?? 0) - (s._sum.discount ?? 0)]));
    const top = visits
      .filter((v) => v.customerId)
      .sort((a, b) => (spendMap.get(b.customerId) ?? 0) - (spendMap.get(a.customerId) ?? 0))
      .slice(0, 5);
    if (!top.length) return { text: "No regulars on the book yet — every empire starts with one. 💇", chips: ["New clients this month?"] };
    const customers = await db.customer.findMany({ where: { id: { in: top.map((t) => t.customerId) } } });
    const nameOf = (id: string) => customers.find((x) => x.id === id)?.name ?? "Unknown";
    return {
      text: list([
        "**Your pillar clients** (most spent):",
        ...top.map((t) => `• **${nameOf(t.customerId)}** — ${t._count} visit${t._count === 1 ? "" : "s"}, ${money(spendMap.get(t.customerId) ?? 0, c.sym)} lifetime`),
      ]),
      chips: ["New clients this month?", "Find a client"],
    };
  },

  /* 17. new clients */
  async new_clients(c) {
    const rows = await db.customer.findMany({
      where: { createdAt: { gte: c.range.start } },
      orderBy: { createdAt: "desc" },
    });
    if (!rows.length) return { text: `No first-timers in ${c.rangeLabel} — a referral offer could wake that up. 🎁`, chips: ["Who are the regulars?"] };
    return {
      text: `**${rows.length} new client${rows.length === 1 ? "" : "s"}** in ${c.rangeLabel}: ${rows.slice(0, 6).map((x) => x.name).join(", ")}${rows.length > 6 ? ` and ${rows.length - 6} more` : ""}. ${rows.length >= 5 ? "The marketing's working. 📈" : ""}`,
      chips: ["Who are the regulars?", "How many clients in total?"],
    };
  },

  /* 18. total clients */
  async total_clients(c) {
    const total = await db.customer.count();
    const monthAgo = salonDayStart(salonDaysAgo(c.tz, -29), c.tz);
    const recent = await db.customer.count({ where: { createdAt: { gte: monthAgo } } });
    return { text: `**${total} clients** in the book, ${recent} of them added in the last 30 days.`, chips: ["Who are the regulars?", "New clients this month?"] };
  },

  /* 19. client lookup — now typo-tolerant */
  async client_lookup(c) {
    const lookupName = looksLikeLookup(c.msg);
    if (!lookupName) return null;
    const needle = strip(lookupName);

    const staffAll = await db.staff.findMany();
    const staffBest = bestNameMatch(needle, staffAll.map((s) => s.name));
    if (staffBest && /\b(who is|who's)\b/.test(c.msg) && staffBest.score >= 50) {
      const staffHit = staffAll.find((s) => s.name === staffBest.name)!;
      const todayWd = weekdayOf(c.today);
      const worksToday = staffHit.workingDays.split(",").map(Number).includes(todayWd);
      return {
        text: `**${staffHit.name}** — ${staffHit.title}. ${worksToday ? `Working today ${minToLabel(staffHit.shiftStartMin)}–${minToLabel(staffHit.shiftEndMin)}.` : `Off today; rostered ${staffHit.workingDays.split(",").map(Number).sort().map((d) => WD[d].slice(0, 3)).join(", ")}.`}`,
        chips: ["Who's working today?", "How's the team doing this week?"],
      };
    }

    const customers = await db.customer.findMany({ take: 1000 });
    const best = bestNameMatch(needle, customers.map((x) => x.name));
    if (!best || best.score < 30) {
      return {
        text: `No client named “${lookupName.trim()}” in the book. Try a first name, or check the Clients page.`,
        chips: ["Who are the regulars?"],
      };
    }
    const hits = customers.filter((x) => x.name === best.name).slice(0, 3);
    const detail = await Promise.all(hits.map(async (x) => {
      const [apptCount, lastAppt, salesAgg] = await Promise.all([
        db.appointment.count({ where: { customerId: x.id, status: { in: OPEN_STATUSES } } }),
        db.appointment.findFirst({ where: { customerId: x.id, status: { in: OPEN_STATUSES } }, orderBy: [{ date: "desc" }, { startMin: "desc" }] }),
        db.sale.aggregate({ where: { customerId: x.id }, _sum: { subtotal: true, discount: true, tip: true }, _count: true }),
      ]);
      const spent = (salesAgg._sum.subtotal ?? 0) - (salesAgg._sum.discount ?? 0);
      const notes = x.notes ? `\n  📝 ${x.notes}` : "";
      const last = lastAppt ? `last visit ${lastAppt.date === c.today ? "today" : lastAppt.date}` : "no visits yet";
      return `**${x.name}** (${x.phone})\n  ${apptCount} appointment${apptCount === 1 ? "" : "s"} · ${money(spent, c.sym)} spent · ${last}${salesAgg._sum.tip ? ` · ${money(salesAgg._sum.tip, c.sym)} tips left` : ""}${notes}`;
    }));
    return { text: detail.join("\n\n"), chips: ["Who are the regulars?", "Upcoming bookings?"] };
  },

  /* 20. roster */
  async roster(c) {
    const date = /\btomorrow\b/.test(c.msg) ? salonDaysAgo(c.tz, 1) : c.today;
    const wd = weekdayOf(date);
    const staffAll = await db.staff.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
    const onDuty = staffAll.filter((s) => s.workingDays.split(",").map(Number).includes(wd));
    const off = staffAll.filter((s) => !s.workingDays.split(",").map(Number).includes(wd));
    return {
      text: list([
        `**${date === c.today ? "Today's" : "Tomorrow's"} chairs:**`,
        ...onDuty.map((s) => `• **${s.name}** — ${minToLabel(s.shiftStartMin)}–${minToLabel(s.shiftEndMin)}`),
        off.length ? `Off: ${off.map((s) => s.name.split(" ")[0]).join(", ")}.` : "",
      ]),
      chips: ["Who's coming in today?", "Who's free at 3pm?"],
      next: { date },
    };
  },

  /* 21. busiest / quietest */
  async busiest(c) {
    const from = salonDaysAgo(c.tz, -27);
    const rows = await db.sale.findMany({
      where: { createdAt: { gte: salonDayStart(from, c.tz) } },
      select: { createdAt: true, subtotal: true, discount: true },
    });
    if (!rows.length) return { text: "Not enough sales history yet to find a pattern.", chips: YES_CHIPS };
    const byWd = new Map<number, number>();
    for (const r of rows) {
      const wd = weekdayOf(salonDateOf(r.createdAt, c.tz));
      byWd.set(wd, (byWd.get(wd) ?? 0) + r.subtotal - r.discount);
    }
    const ranked = [...byWd.entries()].sort((a, b) => b[1] - a[1]);
    const busiestDay = ranked[0];
    const quiet = ranked[ranked.length - 1];
    const asksQuiet = /\b(quiet|slow)\b/.test(c.msg);
    const [wd, rev] = asksQuiet ? quiet : busiestDay;
    return {
      text: `**${WD[wd]}** is your ${asksQuiet ? "quietest" : "busiest"} day — ${money(rev, c.sym)} over the last 4 weeks. ${asksQuiet ? "Perfect for pushing a mid-week offer. 📣" : "Staff it like it matters. 💪"}`,
      chips: ["Busiest hour?", "How's revenue this week?"],
    };
  },

  /* 22. opening hours */
  async hours(c) {
    const open = c.setting ? minToLabel(c.setting.openMin) : "09:00";
    const close = c.setting ? minToLabel(c.setting.closeMin) : "19:00";
    const closed = (c.setting?.closedDays ?? "0").split(",").filter(Boolean).map((d) => WD[Number(d)]);
    const isOpenToday = !(c.setting?.closedDays ?? "0").split(",").includes(String(weekdayOf(c.today)));
    return {
      text: `Hours: **${open}–${close}**${closed.length && closed[0] !== undefined ? `, closed on ${closed.join(", ")}` : ", open every day"}. ${isOpenToday ? `Today we're ${c.clock.min < (c.setting?.openMin ?? 540) ? "not open yet" : c.clock.min < (c.setting?.closeMin ?? 1140) ? "open now" : "closed for the day"}.` : "We're closed today."}`,
      chips: ["Who's working today?", "Who's coming in today?"],
    };
  },

  /* 23. payment methods */
  async payments(c) {
    const rows = await c.salesIn();
    const split = new Map<string, number>();
    for (const r of rows) split.set(r.method, (split.get(r.method) ?? 0) + r.total);
    if (!rows.length) return { text: `No payments taken in ${c.rangeLabel} yet.`, chips: YES_CHIPS };
    const total = [...split.values()].reduce((a, b) => a + b, 0);
    return {
      text: `Payments ${c.rangeLabel}: ${[...split.entries()].sort((a, b) => b[1] - a[1]).map(([m, v]) => `**${m === "CASH" ? "Cash" : m === "CARD" ? "Card" : "Mobile"}** ${money(v, c.sym)} (${Math.round((v / total) * 100)}%)`).join(" · ")}.`,
      chips: ["How's revenue this week?", "Discounts given this month?"],
    };
  },

  /* 24. discounts */
  async discounts(c) {
    const s = c.summarizeSales(await c.salesIn());
    return {
      text: `**${money(s.discounts, c.sym)}** given away in ${c.rangeLabel} across ${s.count} ticket${s.count === 1 ? "" : "s"}${s.revenue ? ` — that's ${Math.round((s.discounts / Math.max(1, s.revenue + s.discounts)) * 100)}% of gross` : ""}. ${s.discounts > s.revenue * 0.15 ? "That's running hot — worth a look. 👀" : ""}`,
      chips: ["How's revenue this week?", "Tips this month?"],
    };
  },

  /* 25. price of a service */
  async price_lookup(c) {
    const services = await db.service.findMany({ where: { active: true } });
    const hits = matchService(c.msg, services);
    if (hits.length) {
      const clear = hits.length === 1 || hits[0].score >= hits[1].score + 3;
      if (clear) {
        const hit = hits[0].service;
        const who = await db.serviceStaff.findMany({ where: { serviceId: hit.id }, include: { staff: { select: { name: true } } } });
        return {
          text: `**${hit.name}** — ${money(hit.price, c.sym)}, ${hit.durationMin} min. ${who.length ? `Done by ${who.map((w) => w.staff.name).join(", ")}.` : ""}${hit.description ? `\n${hit.description}` : ""}`,
          chips: ["How's revenue this week?", "Best selling service?"],
        };
      }
      return {
        text: `A few services sound like that — which one?\n${hits.slice(0, 3).map((h) => `• **${h.service.name}** — ${money(h.service.price, c.sym)}`).join("\n")}`,
        chips: hits.slice(0, 3).map((h) => `Price of ${h.service.name}?`),
      };
    }
    return { text: `I couldn't find that on the menu — want the full price list? It's on the Services page, or ask me “best selling service”.`, chips: ["Best selling service?"] };
  },

  /* 26. revenue */
  async revenue(c) {
    const s = c.summarizeSales(await c.salesIn());
    const appts = await db.appointment.groupBy({ by: ["status"], where: { date: { gte: c.range.from, lte: c.range.to } }, _count: true });
    const map = Object.fromEntries(appts.map((a) => [a.status, a._count]));
    const apptTotal = appts.reduce((a, x) => a + x._count, 0);
    return {
      text: list([
        `**${c.rangeLabel.charAt(0).toUpperCase()}${c.rangeLabel.slice(1)}:** ${money(s.revenue, c.sym)} revenue`,
        `• ${s.count} ticket${s.count === 1 ? "" : "s"} · avg ${money(s.avg, c.sym)}`,
        `• ${money(s.tips, c.sym)} tips · ${money(s.discounts, c.sym)} discounts`,
        s.retail ? `• ${money(s.retail, c.sym)} from retail` : "",
        apptTotal ? `• ${apptTotal} appointments${map.NO_SHOW ? `, ${map.NO_SHOW} no-show` : ""}${map.PENDING ? `, ${map.PENDING} pending` : ""}` : "",
      ].filter(Boolean)),
      chips: ["Best selling service?", "Who earned the most?", "Compare to last week?"],
    };
  },

  /* 27. walk-ins / online bookings */
  async walkins(c) {
    const source = /\bwalk\b/.test(c.msg) ? "WALK_IN" : "ONLINE";
    const count = await db.appointment.count({ where: { source, date: { gte: c.range.from, lte: c.range.to } } });
    const total = await db.appointment.count({ where: { date: { gte: c.range.from, lte: c.range.to } } });
    return {
      text: `**${count}** of ${total} appointments in ${c.rangeLabel} came ${source === "WALK_IN" ? "off the street 🚶" : "through the online booking page 💻"}.`,
      chips: ["Who's coming in today?", "How's this week looking?"],
    };
  },
};
