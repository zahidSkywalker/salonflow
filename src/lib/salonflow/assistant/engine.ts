/**
 * The Aria engine — one entry point, two scopes.
 *
 * Pipeline per question:
 *   1. strip + normalize
 *   2. follow-up detection ("what about sunday?" → reuse last intent)
 *   3. ordered rule pass (regex + custom matchers, most specific first)
 *   4. neural hint from the in-browser model (already thresholded client-side)
 *   5. fuzzy keyword pass (typo tolerance, scored)
 *   6. fallback with "did you mean" chips — never a dead end
 *
 * No external AI anywhere: the hint comes from a ~22M-parameter MiniLM
 * model served from this app's own /public and executed in the visitor's
 * browser via WebAssembly.
 */
import { db, dbReady } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { AssistantContext, AssistantReply, AskOptions, Scope } from "./types";
import { intentsForScope, intentIds, type IntentDef } from "./catalog";
import {
  strip, tokenize, parsePeriod, periodRange, periodLabel, keywordScore,
  tokenHits, salonClock,
} from "./entities";
import { ADMIN_HANDLERS } from "./handlers-admin";
import { PUBLIC_HANDLERS } from "./handlers-public";
import { parseItems } from "../time";

export type { AssistantReply, AssistantContext, Scope };

/** Money formatter shared with handlers. */
export const money = (cents: number, sym = "$") =>
  `${sym}${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type SaleRow = Prisma.SaleGetPayload<{
  include: { staff: { select: { id: true; name: true; commissionPct: true } } };
}>;

/** Everything a handler needs, bound to one request. */
export interface Ctx {
  msg: string;
  raw: string;
  scope: Scope;
  mem: AssistantContext;
  setting: {
    salonName: string; tagline: string; about: string; address: string;
    phone: string; email: string; currencySymbol: string; timeZone: string | null;
    openMin: number; closeMin: number; closedDays: string; slotStepMin: number;
  } | null;
  tz: string | null;
  sym: string;
  clock: { date: string; min: number };
  today: string;
  period: ReturnType<typeof parsePeriod>;
  range: ReturnType<typeof periodRange>;
  rangeLabel: string;
  salesIn: (from?: Date, to?: Date) => Promise<SaleRow[]>;
  summarizeSales: (rows: SaleRow[]) => {
    revenue: number; tips: number; discounts: number; retail: number; count: number; avg: number;
  };
}

/* ── follow-up detection ─────────────────────────────────────────────── */

const FILLER = new Set([
  "what", "how", "about", "and", "is", "are", "the", "a", "an", "for", "at",
  "on", "in", "to", "of", "then", "maybe", "ok", "okay", "nice", "yes", "yeah",
  "please", "instead", "also", "same", "time", "well", "so", "eh", "hmm",
]);

/**
 * Is this a bare continuation — only a time, a weekday, tomorrow/today,
 * possibly wrapped in "what about / how about / and"? Requires memory.
 */
function isFollowup(msg: string): boolean {
  if (!msg) return false;
  if (/\b(same time|same slot)\b/.test(msg)) return true;
  const tokens = tokenize(msg);
  if (!tokens.length) return false;
  const bare = tokens.filter((t) => !FILLER.has(t));
  if (!bare.length) return false;
  const timeish = parseBareTimeish(bare.join(" "));
  return timeish;
}

function parseBareTimeish(s: string): boolean {
  // a clock time, a word-number time, a weekday, tomorrow/today, or a day-part
  if (/\b\d{1,2}(?::\d{2})?\s*(am|pm)?\b/.test(s) && s.split(" ").length <= 3) return true;
  if (/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|weekend|tomorrow|today|noon|midday|morning|afternoon|evening|tonight|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/.test(s)) return true;
  return false;
}

/* ── fallback with did-you-mean ──────────────────────────────────────── */

function didYouMean(msg: string, intents: IntentDef[]): string[] {
  const tokens = tokenize(msg).filter((t) => t.length >= 3);
  if (!tokens.length) return [];
  const scored: { ex: string; s: number }[] = [];
  for (const it of intents) {
    for (const ex of it.examples) {
      const exTokens = tokenize(ex);
      let s = 0;
      for (const t of tokens) {
        if (exTokens.some((et) => tokenHits(t, et))) s += 1;
      }
      if (s > 0) scored.push({ ex, s: s / Math.sqrt(tokens.length) });
    }
  }
  return scored
    .sort((a, b) => b.s - a.s)
    .filter((x, i, arr) => arr.findIndex((y) => y.ex === x.ex) === i)
    .slice(0, 3)
    .map((x) => x.ex);
}

function fallback(scope: Scope, msg: string, intents: IntentDef[]): AssistantReply {
  const guesses = didYouMean(msg, intents);
  if (scope === "public") {
    return {
      text: "I didn't quite catch that — I'm the salon's booking brain, sharp on appointments, prices, hours and finding your booking. Try one of these:",
      chips: guesses.length ? guesses : ["Book an appointment", "What are your prices?", "When are you open?", "Where are you?"],
      fallback: true,
    };
  }
  return {
    text: "Hmm, I don't know that one yet — I'm sharpest on bookings, revenue, stock, clients and the team. Were you after one of these?",
    chips: guesses.length ? guesses : ["Who's coming in today?", "How did we do this week?", "What can you do?"],
    fallback: true,
  };
}

/* ── the engine ──────────────────────────────────────────────────────── */

export async function askAria(opts: AskOptions): Promise<AssistantReply> {
  await dbReady;

  const raw = String(opts.message ?? "").slice(0, 500).trim();
  const msg = strip(raw);
  if (!msg) {
    return opts.scope === "public"
      ? { text: "Say the word — I can book you in, quote prices or check the hours. ✨", chips: ["Book an appointment", "What are your prices?"] }
      : { text: "Say something and I'll dig into the numbers.", chips: ["Who's coming in today?"] };
  }

  const setting = await db.setting.findUnique({ where: { id: "main" } });
  const tz = setting?.timeZone ?? null;
  const sym = setting?.currencySymbol ?? "$";
  const clock = salonClock(tz);
  const today = clock.date;
  const period = parsePeriod(msg);
  const range = periodRange(period, tz);
  const rangeLabel = periodLabel(period);

  const salesIn = async (from = range.start, to = range.end): Promise<SaleRow[]> => {
    const rows = await db.sale.findMany({
      where: { createdAt: { gte: from, lt: to } },
      include: { staff: { select: { id: true, name: true, commissionPct: true } } },
    });
    return rows;
  };
  const summarizeSales = (rows: SaleRow[]) => {
    let revenue = 0, tips = 0, discounts = 0, retail = 0;
    for (const s of rows) {
      revenue += s.subtotal - s.discount;
      tips += s.tip;
      discounts += s.discount;
      for (const it of parseItems(s.items)) {
        if (it.kind === "product") retail += it.price * it.qty;
      }
    }
    return { revenue, tips, discounts, retail, count: rows.length, avg: rows.length ? Math.round(revenue / rows.length) : 0 };
  };

  const c: Ctx = {
    msg, raw, scope: opts.scope,
    mem: opts.context ?? {},
    setting: setting as Ctx["setting"],
    tz, sym, clock, today, period, range, rangeLabel, salesIn, summarizeSales,
  };

  const intents = intentsForScope(opts.scope);
  const memIntent = c.mem.lastIntent && intentIds.has(c.mem.lastIntent)
    ? intents.find((i) => i.id === c.mem.lastIntent) ?? null
    : null;

  /* candidate selection, best-first; handlers may decline (→ next candidate) */
  const candidates: IntentDef[] = [];

  // follow-up memory: "what about sunday?" continues the previous thread
  if (memIntent && isFollowup(msg)) candidates.push(memIntent);

  // ordered rule pass — every pattern hit, most specific first
  for (const it of intents) {
    if (candidates[0] === it) continue;
    if (it.patterns?.some((p) => p.test(msg)) || it.match?.(msg)) candidates.push(it);
  }

  // neural hint (client-embedded, thresholded) — rescues odd phrasings
  if (opts.hint && intentIds.has(opts.hint)) {
    const h = intents.find((i) => i.id === opts.hint);
    if (h && !candidates.includes(h)) candidates.push(h);
  }

  // fuzzy keyword pass — typo tolerance
  let kwBest: IntentDef | null = null;
  let kwScore = 0;
  for (const it of intents) {
    if (it.keywords) {
      const s = keywordScore(msg, it.keywords);
      if (s > kwScore) { kwBest = it; kwScore = s; }
    }
  }
  if (kwBest && kwScore >= 2 && !candidates.includes(kwBest)) candidates.push(kwBest);

  for (const intent of candidates) {
    const handler = ADMIN_HANDLERS[intent.id] ?? PUBLIC_HANDLERS[intent.id];
    if (!handler) continue;
    try {
      const reply = await handler(c);
      if (reply) return { ...reply, intent: intent.id };
    } catch (err) {
      console.error(`[aria] handler ${intent.id} failed:`, err);
      // fall through — the next candidate or the fallback catches it
    }
  }

  return fallback(opts.scope, msg, intents);
}
