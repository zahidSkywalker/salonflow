"use client";

import { useEffect, useState } from "react";
import { initials, money } from "../shared";
import { cn } from "@/lib/utils";

/* ── the floor: a per-specialist day grid ──────────────────────────────────
   Rows are staff, columns are clock time. Appointment blocks are absolutely
   positioned on a shared canvas so the whole day reads at a glance — the way
   a front-desk book actually works. A live "now" line moves through the day. */

export interface GridStaff {
  id: string;
  name: string;
  title: string;
  imageUrl?: string;
  shiftStartMin: number;
  shiftEndMin: number;
  color: string;
}

export interface GridAppt {
  id: string;
  staffId: string;
  startMin: number;
  endMin: number;
  status: string;
  source: string;
  customer: { name: string; phone: string };
  service: { name: string; price: number; durationMin: number };
}

const BLOCK_STYLES: Record<string, string> = {
  CONFIRMED: "bg-[#b76e79] text-[#fff6f1] border-transparent",
  PENDING: "bg-[#c9a227]/15 text-[#7a6210] border-[#c9a227]/60 border-dashed",
  COMPLETED: "bg-[#ded3c6]/70 text-[#4a3a2f] border-transparent",
  NO_SHOW: "bg-[#f6dedd] text-[#8f2d26] border-[#e5b5b2]",
  CANCELLED: "bg-transparent text-[#a8998a] border-[#d8cbbd] line-through",
};

export function useNowMin(intervalMs = 30_000): number {
  const [now, setNow] = useState<number>(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  useEffect(() => {
    const t = setInterval(() => {
      const d = new Date();
      setNow(d.getHours() * 60 + d.getMinutes());
    }, intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export default function DayGrid({
  staff,
  appointments,
  openMin,
  closeMin,
  nowMin,
  currencySymbol,
  onSlotClick,
  rowHeight = 46,
}: {
  staff: GridStaff[];
  appointments: GridAppt[];
  openMin: number;
  closeMin: number;
  nowMin: number;
  currencySymbol: string;
  /** (staffId, startMin) — fired when an empty area of a row is clicked (booking mode) */
  onSlotClick?: (staffId: string, startMin: number) => void;
  rowHeight?: number;
}) {
  const range = Math.max(1, closeMin - openMin);
  const pct = (min: number) => ((min - openMin) / range) * 100;
  const hours: number[] = [];
  for (let h = Math.ceil(openMin / 60) * 60; h <= closeMin; h += 60) hours.push(h);

  const showNow = nowMin >= openMin && nowMin <= closeMin;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[680px]">
        {/* hour ruler */}
        <div className="flex items-end mb-1.5">
          <div className="w-36 shrink-0" />
          <div className="relative flex-1 h-5">
            {hours.map((h) => (
              <span
                key={h}
                className="absolute -translate-x-1/2 text-[10px] font-mono text-[#a8998a] tabular-nums"
                style={{ left: `${pct(h)}%` }}
              >
                {String(Math.floor(h / 60)).padStart(2, "0")}
              </span>
            ))}
          </div>
        </div>

        {/* staff rows */}
        <div className="relative space-y-1.5">
          {staff.map((st) => {
            const mine = appointments.filter((a) => a.staffId === st.id);
            return (
              <div key={st.id} className="flex items-stretch gap-0">
                {/* name cell */}
                <div className="w-36 shrink-0 pr-3 flex items-center gap-2">
                  <span
                    className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ background: st.color }}
                  >
                    {initials(st.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold truncate leading-tight">{st.name}</span>
                    <span className="block text-[10px] text-[#a8998a] truncate leading-tight">
                      {String(Math.floor(st.shiftStartMin / 60)).padStart(2, "0")}–{String(Math.floor(st.shiftEndMin / 60)).padStart(2, "0")}
                    </span>
                  </span>
                </div>

                {/* lane */}
                <div
                  className={cn(
                    "relative flex-1 rounded-lg border border-[#eee5da] bg-[#faf6f0]",
                    onSlotClick && "cursor-copy"
                  )}
                  style={{ height: rowHeight }}
                  onClick={(e) => {
                    if (!onSlotClick || e.target !== e.currentTarget) return;
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const rel = ((e.clientX - rect.left) / rect.width) * range + openMin;
                    const snapped = Math.round(rel / 15) * 15;
                    onSlotClick(st.id, Math.min(Math.max(snapped, openMin), closeMin - 15));
                  }}
                >
                  {/* shift band (off-hours shade) */}
                  {st.shiftStartMin > openMin && (
                    <div
                      className="absolute inset-y-0 left-0 bg-[#efe8df] rounded-l-lg"
                      style={{ width: `${pct(Math.min(st.shiftStartMin, closeMin))}%` }}
                    />
                  )}
                  {st.shiftEndMin < closeMin && (
                    <div
                      className="absolute inset-y-0 right-0 bg-[#efe8df] rounded-r-lg"
                      style={{ width: `${100 - pct(Math.max(st.shiftEndMin, openMin))}%` }}
                    />
                  )}
                  {/* hour gridlines */}
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="absolute inset-y-0 w-px bg-[#eee5da]"
                      style={{ left: `${pct(h)}%` }}
                    />
                  ))}

                  {/* live now-line */}
                  {showNow && (
                    <div
                      className="absolute inset-y-0 z-10 pointer-events-none"
                      style={{ left: `${pct(nowMin)}%` }}
                    >
                      <div className="w-[2px] -ml-[1px] h-full bg-[#b3453e]/80 rounded-full" />
                    </div>
                  )}

                  {/* appointment blocks */}
                  {mine.map((a) => {
                    const left = Math.max(0, pct(a.startMin));
                    const right = Math.min(100, pct(a.endMin));
                    const width = Math.max(1.2, right - left);
                    const live = a.status === "CONFIRMED" && a.startMin <= nowMin && a.endMin > nowMin;
                    return (
                      <div
                        key={a.id}
                        title={`${a.customer.name} · ${a.service.name} · ${money(a.service.price, currencySymbol)}${
                          a.source === "WALK_IN" ? " · walk-in" : ""
                        }`}
                        className={cn(
                          "absolute top-[4px] bottom-[4px] rounded-md border px-1.5 overflow-hidden flex items-center text-[10.5px] leading-tight transition-shadow",
                          BLOCK_STYLES[a.status] ?? BLOCK_STYLES.COMPLETED,
                          live && "ring-2 ring-[#b76e79]/40 z-10 shadow-sm"
                        )}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      >
                        <span className="truncate font-medium">
                          {width > 8 ? a.customer.name : ""}
                        </span>
                        {width > 16 && (
                          <span className="truncate opacity-80 ml-1">· {a.service.name}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
