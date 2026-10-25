"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/* ── money ─────────────────────────────────────────────────────────────── */
export function money(cents: number, symbol = "$"): string {
  const v = cents / 100;
  const hasFraction = Math.round(cents) !== cents;
  return `${symbol}${v.toLocaleString("en-US", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export const minToLabel = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/* ── status badge (appointments) ───────────────────────────────────────── */
const STATUS_STYLES: Record<string, string> = {
  CONFIRMED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  PENDING: "bg-amber-100 text-amber-800 border-amber-200",
  COMPLETED: "bg-stone-200 text-stone-700 border-stone-300",
  CANCELLED: "bg-rose-100 text-rose-800 border-rose-200",
  NO_SHOW: "bg-red-100 text-red-900 border-red-200",
};

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "Confirmed",
  PENDING: "Pending",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", STATUS_STYLES[status] ?? "bg-stone-100 text-stone-700", className)}
    >
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

/* ── payment badge ─────────────────────────────────────────────────────── */
export function MethodBadge({ method }: { method: string }) {
  const label = method === "CARD" ? "Card" : method === "MOBILE" ? "Mobile" : "Cash";
  return (
    <Badge variant="outline" className="border-stone-300 bg-stone-50 text-stone-700">
      {label}
    </Badge>
  );
}

/* ── initials avatar fallback ──────────────────────────────────────────── */
export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/* ── section heading used across admin views ───────────────────────────── */
export function SectionTitle({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
        {sub ? <p className="text-sm text-muted-foreground mt-0.5">{sub}</p> : null}
      </div>
      {right}
    </div>
  );
}

/* ── weekday helpers shared by booking UI ──────────────────────────────── */
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function prettyDate(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
