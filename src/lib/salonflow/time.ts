export const pad = (n: number) => String(n).padStart(2, "0");

/** 545 -> "09:05" */
export function minToLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${pad(h)}:${pad(m)}`;
}

/** "YYYY-MM-DD" for a Date in server-local time */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr(): string {
  return isoDate(new Date());
}

/** weekday (0=Sun..6=Sat) for a "YYYY-MM-DD" string, interpreted at noon to dodge TZ edges */
export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00`).getDay();
}

/** minutes since midnight right now (server-local) */
export function nowMin(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/* ── salon-clock helpers ──────────────────────────────────────────────────
 * The server (Vercel) runs UTC, but the salon doesn't. Every "today" /
 * "right now" decision that matters — the operations board, booking cutoffs,
 * cancellation rules — must use the salon's local clock, or an evening
 * buyer demo would show tomorrow's board. The IANA zone lives in Setting.
 */

/** Broken-down wall clock in an IANA timezone. */
export function salonClock(timeZone: string | null | undefined): { date: string; min: number } {
  const tz = timeZone && isValidZone(timeZone) ? timeZone : "America/New_York";
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const hour = Number(parts.hour) % 24; // "24" can appear for midnight on some ICU builds
    const min = hour * 60 + Number(parts.minute);
    return { date, min };
  } catch {
    return { date: todayStr(), min: nowMin() }; // never let a bad tz string take the app down
  }
}

export function isValidZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Salon-local "YYYY-MM-DD". */
export function salonToday(timeZone?: string | null): string {
  return salonClock(timeZone).date;
}

/** Salon-local minutes since midnight. */
export function salonNowMin(timeZone?: string | null): number {
  return salonClock(timeZone).min;
}

/** Salon-local "YYYY-MM-DD" N days from today (negative = past). */
export function salonDaysAgo(timeZone: string | null | undefined, n: number): string {
  const { date } = salonClock(timeZone);
  const d = new Date(`${date}T12:00:00Z`); // noon UTC anchor — safe to add days
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The UTC instant of salon-local midnight for a date — the correct lower
 * bound when filtering sales by day. (Server-local midnight would put a
 * US salon's 8pm receipts on the wrong day once Vercel's UTC clock rolls.)
 */
export function salonDayStart(date: string, timeZone: string | null | undefined): Date {
  const tz = timeZone && isValidZone(timeZone) ? timeZone : "America/New_York";
  let offMin = 0;
  try {
    const probe = new Date(`${date}T12:00:00Z`);
    const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
      .formatToParts(probe).find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
    const m = part.match(/GMT([+-])(\d{2}):(\d{2})/);
    if (m) offMin = (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
  } catch { /* fall through with 0 */ }
  return new Date(Date.parse(`${date}T00:00:00Z`) - offMin * 60_000);
}

/** Exclusive upper bound: salon-local midnight of the NEXT day. */
export function salonDayEnd(date: string, timeZone: string | null | undefined): Date {
  const start = salonDayStart(date, timeZone);
  return new Date(start.getTime() + 24 * 60 * 60_000);
}

/** Salon-local "YYYY-MM-DD" for any instant (sale timestamps, series keys). */
export function salonDateOf(instant: Date, timeZone: string | null | undefined): string {
  const tz = timeZone && isValidZone(timeZone) ? timeZone : "America/New_York";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(instant);
  } catch {
    return `${instant.getFullYear()}-${String(instant.getMonth() + 1).padStart(2, "0")}-${String(instant.getDate()).padStart(2, "0")}`;
  }
}

/** do [aStart,aEnd) and [bStart,bEnd) overlap? */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function parseItems(itemsJson: string): SaleItem[] {
  try {
    const parsed = JSON.parse(itemsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface SaleItem {
  kind: "service" | "product";
  id: string;
  name: string;
  price: number;
  qty: number;
}
