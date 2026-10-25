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
