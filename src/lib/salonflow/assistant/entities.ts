/**
 * Aria's language layer — pure functions, zero dependencies on the database.
 * Everything here is safe to run in the browser (the public booking flow
 * reuses the same parsers) or on the server.
 *
 * The upgrade over v1.8: typo tolerance (Levenshtein), word-numbers,
 * relative times ("in 2 hours"), day-parts ("this evening"), weekend
 * handling, and fuzzy name matching.
 */
import {
  salonClock, salonDaysAgo, salonDayStart, salonDayEnd, salonDateOf, weekdayOf,
} from "../time";

/* ── text helpers ────────────────────────────────────────────────────── */

export const strip = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

export function tokenize(s: string): string[] {
  return strip(s).split(" ").filter(Boolean);
}

/** Capped Levenshtein — cheap because salons write short words. */
export function levenshtein(a: string, b: string, cap = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const prev = new Array(b.length + 1);
  const cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > cap) return cap + 1; // early exit — already too far
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/** Typo tolerance scales with word length: short words get strict, long words get slack. */
export function wordTolerance(w: string): number {
  if (w.length <= 2) return 0;
  if (w.length <= 6) return 1;
  return 2;
}

/** Does a single token match a keyword, allowing a typo? */
export function tokenHits(token: string, keyword: string): boolean {
  if (token === keyword) return true;
  const tol = wordTolerance(keyword);
  if (tol === 0) return false;
  return levenshtein(token, keyword, tol) <= tol;
}

/** How many keywords does this message hit (fuzzy)? Longer keywords weigh more. */
export function keywordScore(msg: string, keywords: string[]): number {
  const tokens = tokenize(msg);
  let score = 0;
  for (const kw of keywords) {
    if (kw.includes(" ")) {
      // phrase keyword: every word must land (fuzzy) in order
      const parts = kw.split(" ");
      let idx = 0;
      for (const t of tokens) {
        if (idx < parts.length && tokenHits(t, parts[idx])) idx++;
      }
      if (idx === parts.length) score += 2 * parts.length;
      continue;
    }
    if (tokens.some((t) => tokenHits(t, kw))) score += kw.length >= 6 ? 2 : 1;
  }
  return score;
}

/* ── periods (unchanged behaviour, moved for reuse) ──────────────────── */

export type Period =
  | { kind: "day"; offset: number }
  | { kind: "back"; days: number }
  | { kind: "week"; offset: number }
  | { kind: "month"; offset: number }
  | { kind: "all" };

export function parsePeriod(msg: string): Period {
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

export function periodLabel(p: Period): string {
  switch (p.kind) {
    case "day": return p.offset === 0 ? "today" : p.offset === -1 ? "yesterday" : "tomorrow";
    case "back": return `the last ${p.days} day${p.days === 1 ? "" : "s"}`;
    case "week": return p.offset === 0 ? "this week" : "last week";
    case "month": return p.offset === 0 ? "this month" : "last month";
    case "all": return "all time";
  }
}

/** [startInclusive, endExclusive) as UTC instants, plus the date-string span. */
export function periodRange(p: Period, tz: string | null | undefined) {
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
    const wd = weekdayOf(today);
    const backFromMonday = (wd + 6) % 7 + p.offset * 7;
    const from = salonDaysAgo(tz, -backFromMonday);
    const to = p.offset === 0 ? today : salonDaysAgo(tz, -(backFromMonday + 6));
    return { start: salonDayStart(from, tz), end: salonDayEnd(to, tz), from, to };
  }
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

/* ── time parsing (the big upgrade) ──────────────────────────────────── */

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, noon: 12, midday: 12,
};

export interface TimeParseOpts {
  /** salon clock's minutes-right-now, for "in 2 hours" */
  nowMin?: number;
}

/**
 * Understands: "6pm", "at 6", "six", "noon", "18:30", "9:15 am",
 * "in 2 hours", "in 45 minutes", "this evening" → minutes since midnight.
 */
export function parseTime(msg: string, opts: TimeParseOpts = {}): number | null {
  // 1. explicit am/pm — always wins
  const ampm = msg.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (ampm) {
    let h = Number(ampm[1]);
    const min = Number(ampm[2] ?? 0);
    if (h > 23 || min > 59) return null;
    if (ampm[3] === "pm" && h < 12) h += 12;
    if (ampm[3] === "am" && h === 12) h = 0;
    return h * 60 + min;
  }

  // 2. relative to now — "in 2 hours", "in 45 min"
  if (opts.nowMin != null) {
    const rel = msg.match(/\bin\s+(\d{1,3}|an?|half an?)\s*(hour|hr|min|minute)s?\b/);
    if (rel) {
      const unit = rel[2].startsWith("h") ? 60 : 1;
      let n: number;
      if (/^half/.test(rel[1])) n = 0.5;
      else if (/^an?$/.test(rel[1])) n = 1;
      else n = Number(rel[1]);
      return ((opts.nowMin + Math.round(n * unit)) % 1440 + 1440) % 1440;
    }
  }

  // 3. 24h clock — "18:30" / "at 9:45"
  const colon = msg.match(/\b(?:at\s+)?(\d{1,2}):(\d{2})\b/);
  if (colon) {
    const h = Number(colon[1]);
    const min = Number(colon[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  // 4. word numbers / noon — "at six", "noon", "3 thirty" is not supported
  const words = Object.keys(WORD_NUMBERS);
  const wm = msg.match(new RegExp(`\\b(?:at\\s+)?(${words.join("|")})\\b`));
  if (wm) {
    let h = WORD_NUMBERS[wm[1]];
    // "six pm" spelled apart
    if (/\bp\.?m\b/.test(msg) && h < 12) h += 12;
    else if (!/\ba\.?m\b/.test(msg) && h <= 7) h += 12; // "at 6" in salon context = evening
    return h * 60;
  }

  // 5. bare digit without am/pm — "at 6", "at 11"
  const bare = msg.match(/\b(?:at\s+)(\d{1,2})\b/);
  if (bare) {
    let h = Number(bare[1]);
    if (h > 23) return null;
    if (h <= 7) h += 12; // salons don't book at 6 AM
    return h * 60;
  }

  // 6. day-parts
  if (/\bthis\s+morning\b|\bin the morning\b|\bmorning\b/.test(msg)) return 10 * 60;
  if (/\bthis\s+afternoon\b|\bin the afternoon\b|\bafternoon\b/.test(msg)) return 14 * 60;
  if (/\b(evening|tonight)\b/.test(msg)) return 18 * 60;

  return null;
}

/* ── weekdays & dates ────────────────────────────────────────────────── */

const WD_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WD_SHORT: string[][] = [
  ["sun"], ["mon"], ["tue", "tues"], ["wed"], ["thu", "thur", "thurs"], ["fri"], ["sat"],
];

/** 0=Sunday..6=Saturday; understands "weekend" → Saturday. null if none. */
export function parseWeekday(msg: string): number | null {
  if (/\bweekend\b/.test(msg)) return 6;
  for (let i = 0; i < 7; i++) {
    if (new RegExp(`\\b(next\\s+)?${WD_NAMES[i]}\\b`).test(msg)) return i;
  }
  for (let i = 0; i < 7; i++) {
    for (const s of WD_SHORT[i]) {
      if (new RegExp(`\\b(next\\s+)?${s}\\b\\.?\\b`).test(msg)) return i;
    }
  }
  return null;
}

/** Resolve "saturday"/"tomorrow"/"next friday" to a salon-local date string. */
export function resolveDate(msg: string, today: string, tz: string | null | undefined): string {
  const wd = parseWeekday(msg);
  if (wd !== null) {
    const todayWd = weekdayOf(today);
    let diff = (wd - todayWd + 7) % 7;
    if (diff === 0 && /next/.test(msg)) diff = 7;
    return salonDaysAgo(tz, diff); // positive = future (salonDaysAgo ADDS n)
  }
  if (/\btomorrow\b/.test(msg)) return salonDaysAgo(tz, 1);
  if (/\byesterday\b/.test(msg)) return salonDaysAgo(tz, -1);
  return today;
}

/* ── fuzzy name lookup ───────────────────────────────────────────────── */

/**
 * "find Ingrid" / "who is Ingrid" / "ingrids history" → the name fragment.
 */
export function looksLikeLookup(msg: string): string | null {
  const m = msg.match(
    /(?:client|customer|who\s+is|who's|who\s+s|find|search|info|details|about|profile|look\s*up)\s+(?:for\s+|on\s+|named\s+)?([a-z][a-z' -]{1,40})/
  );
  if (!m) return null;
  const name = m[1]
    .replace(/\b(phone|number|email|notes|history|visits|info|details|profile)\b.*$/, "")
    .trim();
  return name.length >= 2 ? name : null;
}

/** Best fuzzy match of a needle against a list of names (typo tolerant). */
export function bestNameMatch(
  needle: string,
  names: string[]
): { name: string; score: number } | null {
  const n = strip(needle);
  if (!n) return null;
  let best: { name: string; score: number } | null = null;
  for (const raw of names) {
    const cand = strip(raw);
    const words = cand.split(" ");
    let score = 0;
    if (cand.includes(n)) score = 100;
    else {
      for (const w of words) {
        if (w.length < 3) continue;
        const tol = wordTolerance(w);
        const d = levenshtein(n, w, Math.max(tol, 2));
        if (d <= tol) score = Math.max(score, 50 - d * 10);
        else if (w.startsWith(n) || n.startsWith(w)) score = Math.max(score, 30);
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { name: raw, score };
  }
  return best;
}

export { salonClock, salonDaysAgo, salonDayStart, salonDayEnd, salonDateOf, weekdayOf };

/* ── service matching ────────────────────────────────────────────────── */

/** Words customers actually say, mapped to words that appear in service names. */
const SERVICE_ALIASES: Record<string, string[]> = {
  haircut: ["cut", "chop", "trim"],
  trim: ["cut", "trim"],
  shave: ["beard", "razor"],
  dye: ["color"],
  colour: ["color"],
  coloring: ["color"],
  highlights: ["balayage", "color"],
  ombre: ["balayage"],
  manicure: ["manicure"],
  nails: ["nail", "manicure", "pedicure"],
  pedicure: ["pedicure"],
  facial: ["facial", "face"],
  skincare: ["facial", "peel", "glow"],
  massage: ["massage"],
  blowdry: ["blowout", "waves"],
  "blow dry": ["blowout", "waves"],
  smoothing: ["keratin"],
  "root touchup": ["root", "touch"],
  touchup: ["root", "touch"],
};

export interface ServiceLike {
  id: string;
  name: string;
  category: string;
}

export interface ServiceHit<T> {
  service: T;
  score: number;
}

/**
 * Fuzzy service matcher: "a haircut" → Signature Cut / Gentleman's Cut /
 * Cut & Beard Combo (ambiguous on purpose — caller offers the top hits).
 */
export function matchService<T extends ServiceLike>(msg: string, services: T[]): ServiceHit<T>[] {
  const tokens = tokenize(msg);
  const hits: ServiceHit<T>[] = [];
  for (const svc of services) {
    const nameWords = tokenize(svc.name);
    const catWords = tokenize(svc.category);
    let score = 0;
    for (const t of tokens) {
      if (t.length < 3) continue;
      for (const w of nameWords) {
        if (w.length >= 3 && tokenHits(t, w)) { score += 3; break; }
      }
      for (const w of catWords) {
        if (w.length >= 3 && tokenHits(t, w)) { score += 1; break; }
      }
      const alias = SERVICE_ALIASES[t];
      if (alias) {
        for (const a of alias) {
          if (nameWords.some((w) => w.includes(a))) { score += 2; break; }
        }
      }
    }
    if (score > 0) hits.push({ service: svc, score });
  }
  return hits.sort((a, b) => b.score - a.score);
}
