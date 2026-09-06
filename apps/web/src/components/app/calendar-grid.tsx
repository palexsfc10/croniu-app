"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  availabilityBackground,
  layoutDayBlocks,
  nowMinutesInGrid,
  type DayScheduleLike,
} from "@/lib/calendar-grid";
import { appointmentStatusLabel, formatOrgDateTime, type Appointment } from "@/lib/api";

const PX_PER_MIN = 1.4;
const SNAP_MINUTES = 15;
const CANCELLED_STRIP_HEIGHT = 20;

export type CalendarGridDay = {
  date: string; // YYYY-MM-DD
  headerLabel: string; // e.g. "Seg 10/08"
  appointments: Appointment[];
  daySchedule: DayScheduleLike | null;
  isToday: boolean;
  isPast: boolean; // entire day already elapsed (before org-local today)
};

type Props = {
  days: CalendarGridDay[];
  timeZone: string;
  gridStartMinutes: number;
  gridEndMinutes: number;
  showCancelled: boolean;
  nowDate: Date;
  onCreateSlot: (date: string, startLabel: string, endLabel: string) => void;
  defaultDurationMinutes?: number;
};

function minutesToLabel(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function hourTicks(startMinutes: number, endMinutes: number): number[] {
  const ticks: number[] = [];
  const first = Math.ceil(startMinutes / 60) * 60;
  for (let t = first; t <= endMinutes; t += 60) ticks.push(t);
  return ticks;
}

export function CalendarGrid({
  days,
  timeZone,
  gridStartMinutes,
  gridEndMinutes,
  showCancelled,
  nowDate,
  onCreateSlot,
  defaultDurationMinutes = 60,
}: Props) {
  const totalMinutes = gridEndMinutes - gridStartMinutes;
  const gridHeight = totalMinutes * PX_PER_MIN;
  const ticks = useMemo(() => hourTicks(gridStartMinutes, gridEndMinutes), [gridStartMinutes, gridEndMinutes]);
  const nowMinutes = nowMinutesInGrid(timeZone, gridStartMinutes, gridEndMinutes, nowDate);

  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex min-w-[560px]">
        <div className="w-14 shrink-0 border-r border-[var(--color-border)] pt-6">
          <div style={{ height: gridHeight, position: "relative" }}>
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-[var(--color-ink-subtle)]"
                style={{ top: (t - gridStartMinutes) * PX_PER_MIN }}
              >
                {minutesToLabel(t)}
              </div>
            ))}
          </div>
        </div>

        {days.map((day) => {
          const active = day.appointments.filter((a) => a.status !== "cancelled");
          const cancelled = showCancelled
            ? day.appointments.filter((a) => a.status === "cancelled")
            : [];
          const laidOut = layoutDayBlocks(active, timeZone, gridStartMinutes, gridEndMinutes);
          const laidOutById = Object.fromEntries(laidOut.map((b) => [b.id, b]));
          const bands = availabilityBackground(day.daySchedule, gridStartMinutes, gridEndMinutes);
          const canCreate = !day.isPast;

          return (
            <div
              key={day.date}
              className="relative min-w-[150px] flex-1 border-r border-[var(--color-border)] last:border-r-0"
            >
              <div
                className={[
                  "sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-center text-xs font-semibold",
                  day.isToday ? "text-[var(--color-primary)]" : "text-[var(--color-ink-muted)]",
                ].join(" ")}
              >
                {day.headerLabel}
              </div>
              <div
                className={["relative", canCreate ? "cursor-copy" : "cursor-default"].join(" ")}
                style={{ height: gridHeight }}
                onClick={(e) => {
                  if (!canCreate) return;
                  if (e.target !== e.currentTarget) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const offsetY = e.clientY - rect.top;
                  const rawMinutes = gridStartMinutes + offsetY / PX_PER_MIN;
                  const snapped = Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES;
                  const clamped = Math.min(
                    Math.max(snapped, gridStartMinutes),
                    gridEndMinutes - SNAP_MINUTES,
                  );
                  if (day.isToday && nowMinutes != null && clamped < nowMinutes) return;
                  onCreateSlot(
                    day.date,
                    minutesToLabel(clamped),
                    minutesToLabel(Math.min(clamped + defaultDurationMinutes, gridEndMinutes)),
                  );
                }}
              >
                {/* Hour grid lines */}
                {ticks.map((t) => (
                  <div
                    key={t}
                    className="absolute left-0 right-0 border-t border-[var(--color-border)]/60"
                    style={{ top: (t - gridStartMinutes) * PX_PER_MIN }}
                  />
                ))}

                {/* Availability background — continuous bands, never per-slot boxes */}
                {bands.map((band, i) => (
                  <div
                    key={i}
                    aria-hidden
                    className={
                      band.kind === "available"
                        ? "pointer-events-none absolute left-0 right-0 bg-[var(--color-success-subtle)]/40"
                        : "pointer-events-none absolute left-0 right-0 bg-[var(--color-surface-subtle)]"
                    }
                    style={{
                      top: (band.topMinutes - gridStartMinutes) * PX_PER_MIN,
                      height: band.heightMinutes * PX_PER_MIN,
                    }}
                  />
                ))}

                {/* Cancelled — thin, low-opacity strips that never dominate the column */}
                {cancelled.map((appt) => {
                  const laid = laidOutById[appt.id];
                  const top =
                    laid != null
                      ? laid.topMinutes
                      : layoutDayBlocks([appt], timeZone, gridStartMinutes, gridEndMinutes)[0]?.topMinutes ??
                        gridStartMinutes;
                  return (
                    <Link
                      key={appt.id}
                      href={`/app/appointments/${appt.id}`}
                      className="absolute left-1 right-1 z-[1] flex items-center gap-1 overflow-hidden rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-1.5 text-[10px] text-[var(--color-ink-subtle)] opacity-60 hover:opacity-90"
                      style={{ top: (top - gridStartMinutes) * PX_PER_MIN, height: CANCELLED_STRIP_HEIGHT }}
                    >
                      <span className="truncate line-through">
                        {formatOrgDateTime(appt.starts_at, timeZone)} · {appt.client_name}
                      </span>
                    </Link>
                  );
                })}

                {/* Active appointments — positioned by real start/duration, packed side-by-side on overlap */}
                {laidOut.map((block) => {
                  const appt = active.find((a) => a.id === block.id);
                  if (!appt) return null;
                  const widthPct = 100 / block.columnCount;
                  const leftPct = block.column * widthPct;
                  const heightPx = block.heightMinutes * PX_PER_MIN;
                  const compact = heightPx < 44;
                  return (
                    <Link
                      key={appt.id}
                      href={`/app/appointments/${appt.id}`}
                      className="card-rail card-rail-primary absolute z-[2] overflow-hidden rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
                      style={{
                        top: (block.topMinutes - gridStartMinutes) * PX_PER_MIN,
                        height: heightPx,
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                      }}
                    >
                      <p className="flex items-center gap-1 text-[11px] font-semibold tabular-nums text-[var(--color-ink)]">
                        {formatOrgDateTime(appt.starts_at, timeZone)}
                        <span
                          className={[
                            "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                            appt.status === "completed"
                              ? "bg-[var(--color-success)]"
                              : appt.status === "no_show"
                                ? "bg-[var(--color-warning)]"
                                : "bg-[var(--color-info)]",
                          ].join(" ")}
                          aria-hidden
                        />
                      </p>
                      {!compact ? (
                        <p className="truncate text-xs font-medium text-[var(--color-ink)]">
                          {appt.client_name}
                        </p>
                      ) : null}
                      {!compact ? (
                        <p className="truncate text-[10px] text-[var(--color-ink-muted)]">
                          <span>{appointmentStatusLabel(appt.status)}</span>
                          {appt.service_name || appt.cycle_service_name
                            ? ` · ${appt.service_name || appt.cycle_service_name}`
                            : ""}
                        </p>
                      ) : null}
                    </Link>
                  );
                })}

                {/* Current-time line — only on today's column, only inside the visible window */}
                {day.isToday && nowMinutes != null ? (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-[3] border-t-2 border-[var(--color-danger)]"
                    style={{ top: (nowMinutes - gridStartMinutes) * PX_PER_MIN }}
                  >
                    <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-[var(--color-danger)]" />
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--color-ink-muted)]">
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-info)]" /> Agendado
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-success)]" /> Realizado
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-warning)]" /> Falta
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-3 rounded-[3px] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] opacity-60" />{" "}
        Cancelado
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-3 rounded-[3px] bg-[var(--color-success-subtle)]" /> Disponível
      </li>
    </ul>
  );
}
