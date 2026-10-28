/**
 * Aria's public handlers — the visitor-facing brain on the storefront.
 * Visitors can explore services, prices, hours, the team and the space,
 * check real openings, start a chat booking and find their booking by
 * reference.
 *
 * Hard privacy wall: these handlers never touch revenue, client records,
 * sales or staff performance. The admin scope is a different handler set.
 */
import { db } from "@/lib/db";
import type { Ctx } from "./engine";
import { money } from "./engine";
import type { AssistantReply } from "./types";
import {
  parseTime, resolveDate, matchService, bestNameMatch, strip, tokenize,
  salonDaysAgo, weekdayOf, parseWeekday,
} from "./entities";
import { minToLabel } from "../time";
import { computeSlots } from "../slotengine";

const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const list = (items: string[]) => items.join("\n");

function openStateLine(c: Ctx): string {
  const closedDays = (c.setting?.closedDays ?? "0").split(",").filter(Boolean);
  const todayClosed = closedDays.includes(String(weekdayOf(c.today)));
  if (todayClosed) return "We're closed today.";
  if (c.clock.min < (c.setting?.openMin ?? 540)) return `We open at **${minToLabel(c.setting?.openMin ?? 540)}** today.`;
  if (c.clock.min < (c.setting?.closeMin ?? 1140)) return `We're open right now — until **${minToLabel(c.setting?.closeMin ?? 1140)}**.`;
  return `We're closed for today (open ${minToLabel(c.setting?.openMin ?? 540)}–${minToLabel(c.setting?.closeMin ?? 1140)}).`;
}

/** Slots helper shared by p_slots — real openings, zero private data. */
async function slotsReply(c: Ctx, serviceNameHint?: string): Promise<AssistantReply> {
  const services = await db.service.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  if (!services.length) {
    return { text: "The menu's being set up right now — call us and we'll sort you out. 📞", chips: ["What are your opening hours?"] };
  }
  const hits = matchService(c.msg, services);
  if (!hits.length && !serviceNameHint) {
    return {
      text: `Happy to check the book! Which service are you thinking?\n(most visitors ask about ${services.slice(0, 3).map((s) => `**${s.name}**`).join(", ")})`,
      chips: services.slice(0, 4).map((s) => `Availability for ${s.name}?`),
    };
  }
  const svc = hits.length ? hits[0].service : services.find((s) => s.id === serviceNameHint);
  if (!svc) return { text: "I couldn't find that service on the menu — ask me “what services do you offer?”", chips: ["What services do you offer?"] };

  const closedDays = (c.setting?.closedDays ?? "0").split(",").filter(Boolean);
  const openMin = c.setting?.openMin ?? 540;
  const closeMin = c.setting?.closeMin ?? 1140;
  const date = resolveDate(c.msg, c.today, c.tz);
  const wd = weekdayOf(date);

  if (closedDays.includes(String(wd))) {
    for (let d = 1; d <= 7; d++) {
      const nwd = (wd + d) % 7;
      if (!closedDays.includes(String(nwd))) {
        const ndate = salonDaysAgo(c.tz, d);
        const slots = await computeSlots(svc.id, "any", ndate);
        const free = slots.filter((s) => s.available).slice(0, 4);
        return {
          text: `We're closed on ${WD[wd]}s. **${WD[nwd]}** is our next open day — ${free.length ? `I can put you in at ${free.map((s) => `**${s.label}**`).join(", ")}.` : `open ${minToLabel(openMin)}–${minToLabel(closeMin)}.`}\nService: **${svc.name}** (${money(svc.price, c.sym)}, ${svc.durationMin} min).`,
          chips: [`Book ${svc.name} on ${WD[nwd]}`, "What are your prices?"],
          next: { date: ndate },
        };
      }
    }
  }

  const slots = await computeSlots(svc.id, "any", date);
  const free = slots.filter((s) => s.available);
  const when = date === c.today ? "today" : WD[wd];
  if (!free.length) {
    return {
      text: `**${svc.name}** (${money(svc.price, c.sym)}, ${svc.durationMin} min) is fully booked ${when} — sorry! Want me to check tomorrow or another day?`,
      chips: ["Availability tomorrow?", "Book something else"],
      next: { date },
    };
  }
  const show = free.slice(0, 6).map((s) => `**${s.label}**`);
  return {
    text: `Yes! **${svc.name}** (${money(svc.price, c.sym)}, ${svc.durationMin} min) has ${free.length} opening${free.length === 1 ? "" : "s"} ${when}: ${show.join(", ")}${free.length > 6 ? "…" : ""}.\nSay a time and I'll start the booking — or tap “Book”.`,
    chips: [`Book ${svc.name} ${when === "today" ? "today" : WD[wd]}`, "What are your prices?"],
    next: { date, time: free[0].min },
  };
}

export const PUBLIC_HANDLERS: Record<string, (c: Ctx) => Promise<AssistantReply | null>> = {
  async p_help(c) {
    return {
      text: list([
        "I'm Aria — this salon's own assistant. Here's what I can do:",
        "• **Book you in** — “book a haircut friday at 3”",
        "• **Check openings** — “any slots tomorrow?”",
        "• **Prices & services** — “how much is a balayage?”",
        "• **Hours, address, phone** — just ask",
        "• **Find your booking** — drop your reference (SA-XXXXX)",
      ]),
      chips: ["Book an appointment", "What are your prices?", "When are you open?"],
    };
  },

  async p_identity() {
    return {
      text: "I'm **Aria** — the salon's built-in assistant. I'm not a person and not a cloud chatbot: I run inside this salon's own app (a small neural net on your device + the salon's live calendar), so answers are instant and private. ✨",
      chips: ["What can you do?", "Book an appointment"],
    };
  },

  async p_thanks() {
    return { text: "Anytime! See you at the salon. 💐", chips: ["Book an appointment", "What are your opening hours?"] };
  },

  async p_bye() {
    return { text: "See you soon! The book's always open here. ✂️", chips: ["Book an appointment"] };
  },

  async p_greeting(c) {
    if (tokenize(c.msg).length > 3) return null;
    return {
      text: `Hey! I'm **Aria**, the assistant at ${c.setting?.salonName ?? "the salon"}. ${openStateLine(c)} I can book you in, quote prices or answer anything about the place. What can I do for you?`,
      chips: ["Book an appointment", "What are your prices?", "When are you open?"],
    };
  },

  /* booking — the server hands off to the in-chat booking flow */
  async p_book(c) {
    const services = await db.service.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    const hits = matchService(c.msg, services);
    const svc = hits[0]?.service;
    return {
      text: svc
        ? `**${svc.name}** — lovely choice (${money(svc.price, c.sym)}, ${svc.durationMin} min). Let's lock a time.`
        : "Love it — let's get you in the chair. ✨",
      chips: [],
      next: svc ? { date: resolveDate(c.msg, c.today, c.tz), time: parseTime(c.msg, { nowMin: c.clock.min }) } : {},
    };
  },

  /* real openings, per service */
  async p_slots(c) {
    return slotsReply(c);
  },

  /* prices */
  async p_price(c) {
    const services = await db.service.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    if (!services.length) return { text: "The menu's still being set up — call us for prices. 📞", chips: [] };
    const hits = matchService(c.msg, services);
    if (hits.length) {
      const clear = hits.length === 1 || hits[0].score >= hits[1].score + 3;
      if (clear) {
        const s = hits[0].service;
        return {
          text: `**${s.name}** — **${money(s.price, c.sym)}** (${s.durationMin} min).${s.description ? `\n${s.description}` : ""}\nWant me to book you in?`,
          chips: [`Book ${s.name}`, "What else do you offer?"],
        };
      }
      return {
        text: `A few things match — which one?\n${hits.slice(0, 3).map((h) => `• **${h.service.name}** — ${money(h.service.price, c.sym)}`).join("\n")}`,
        chips: hits.slice(0, 3).map((h) => `Price of ${h.service.name}?`),
      };
    }
    const cats = [...new Set(services.map((s) => s.category))];
    return {
      text: `Our menu runs from **${money(Math.min(...services.map((s) => s.price)), c.sym)}** to **${money(Math.max(...services.map((s) => s.price)), c.sym)}** across ${cats.length} categories: ${cats.slice(0, 5).join(", ")}. Ask about any service by name!`,
      chips: [`Price of ${services[0].name}?`, "What services do you offer?"],
    };
  },

  /* the menu */
  async p_services(c) {
    const services = await db.service.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    if (!services.length) return { text: "The menu's being set up right now — check back soon!", chips: [] };
    const byCat = new Map<string, typeof services>();
    for (const s of services) {
      const arr = byCat.get(s.category) ?? [];
      arr.push(s);
      byCat.set(s.category, arr);
    }
    const lines: string[] = [`**The menu** — ${services.length} services:`];
    for (const [cat, arr] of byCat) {
      lines.push(`• **${cat}**: ${arr.slice(0, 3).map((s) => s.name).join(", ")}${arr.length > 3 ? ` +${arr.length - 3} more` : ""}`);
    }
    lines.push("Ask me about any of them — price, duration, or “book it”.");
    return {
      text: lines.join("\n"),
      chips: services.slice(0, 3).map((s) => `Book ${s.name}`),
    };
  },

  /* the team — names, titles, skills (all already public on the site) */
  async p_staff(c) {
    const staff = await db.staff.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: { services: { include: { service: { select: { name: true } } } } },
    });
    if (!staff.length) return { text: "The team page is being updated — book a slot and we'll match you with the right hands.", chips: ["Book an appointment"] };

    // a specific person?
    const best = bestNameMatch(strip(c.msg).replace(/^(who is|who's|whos|tell me about|about)\s+/, ""), staff.map((s) => s.name));
    if (best && best.score >= 50) {
      const s = staff.find((x) => x.name === best.name)!;
      const skills = s.services.map((x) => x.service.name).slice(0, 4);
      return {
        text: `**${s.name}** — ${s.title}.${s.bio ? ` ${s.bio}` : ""}${skills.length ? `\nSpecialises in: ${skills.join(", ")}.` : ""}\nWant ${s.name.split(" ")[0]}'s chair?`,
        chips: [`Book with ${s.name}`, "Who else is on the team?"],
      };
    }
    return {
      text: list([
        `**Meet the team** — ${staff.length} specialists:`,
        ...staff.slice(0, 8).map((s) => `• **${s.name}** — ${s.title}`),
      ]),
      chips: staff.slice(0, 3).map((s) => `Who is ${s.name}?`),
    };
  },

  /* hours */
  async p_hours(c) {
    const open = minToLabel(c.setting?.openMin ?? 540);
    const close = minToLabel(c.setting?.closeMin ?? 1140);
    const closed = (c.setting?.closedDays ?? "0").split(",").filter(Boolean).map((d) => WD[Number(d)]);
    const todayWd = weekdayOf(c.today);
    const closedToday = (c.setting?.closedDays ?? "0").split(",").filter(Boolean).includes(String(todayWd));
    return {
      text: `Hours: **${open}–${close}**${closed.length && closed[0] !== undefined ? `, closed on ${closed.join(" & ")}` : ", open every day"}. ${closedToday ? "We're closed today — but the book is open for the rest of the week!" : openStateLine(c)}`,
      chips: ["Book an appointment", "Where are you located?"],
    };
  },

  /* location + parking */
  async p_location(c) {
    const parking = /\bparking\b/.test(c.msg);
    return {
      text: parking
        ? `We're at **${c.setting?.address ?? "downtown"}** — street parking and a small lot around the corner. Most guests find a spot within a couple of minutes. 🚗`
        : `You'll find us at **${c.setting?.address ?? "downtown"}**. ${openStateLine(c)}`,
      chips: ["Book an appointment", "What are your opening hours?"],
    };
  },

  /* contact */
  async p_contact(c) {
    return {
      text: `You can reach the salon on **${c.setting?.phone ?? "—"}**${c.setting?.email ? ` or **${c.setting.email}**` : ""}. Or just book right here — I'll take care of it. 📞`,
      chips: ["Book an appointment", "What are your opening hours?"],
    };
  },

  /* the story */
  async p_about(c) {
    return {
      text: `${c.setting?.about ?? "A modern salon with honest craft."}\n\n— ${c.setting?.salonName ?? "the salon"}, ${c.setting?.tagline ?? ""}`,
      chips: ["Book an appointment", "Who's on the team?"],
    };
  },

  /* booking lookup / cancel by reference */
  async p_booking_lookup(c) {
    const refMatch = c.raw.toUpperCase().match(/\bSA-[A-Z0-9]{4,6}\b/);
    if (refMatch) {
      const ref = refMatch[0];
      const appt = await db.appointment.findUnique({
        where: { ref },
        include: {
          service: { select: { name: true, price: true, durationMin: true } },
          staff: { select: { name: true } },
          customer: { select: { name: true } },
        },
      });
      if (!appt) {
        return { text: `I couldn't find a booking with reference **${ref}** — double-check the code (it looks like SA-XXXXX), or tap “Find my booking”.`, chips: [] };
      }
      const first = (appt.customer?.name ?? "you").split(" ")[0];
      const status = appt.status === "CANCELLED" ? "cancelled" : appt.status === "COMPLETED" ? "completed" : appt.status === "NO_SHOW" ? "marked as a no-show" : "confirmed";
      return {
        text: `Found it! **${ref}** — ${appt.service.name} with ${appt.staff?.name ?? "our team"}, ${appt.date === c.today ? "today" : appt.date} at **${minToLabel(appt.startMin)}** (${money(appt.service.price, c.sym)}). Status: **${status}**.\nTo change or cancel, tap “Find my booking” and enter the code.`,
        chips: ["Find my booking", "Book another appointment"],
      };
    }
    const wantsCancel = /\b(cancel|reschedule|move|change)\b/.test(c.msg);
    return {
      text: wantsCancel
        ? `No problem — I can pull that up. Drop your **booking reference** here (it looks like SA-XXXXX, it's in your confirmation), or tap “Find my booking”.`
        : `Happy to check on that! Give me your **booking reference** (looks like SA-XXXXX — it's in your confirmation message), or tap “Find my booking”.`,
      chips: ["Find my booking"],
    };
  },
};
