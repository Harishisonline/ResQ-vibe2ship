"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface MiniCalendarProps {
  value: Date;
  onChange: (date: Date) => void;
  /** Earliest selectable date. Dates before this are disabled. */
  min?: Date;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/**
 * A compact month-grid date picker. Dates before `min` are disabled and
 * unclickable. Used in the event form so picking a start/end date feels smooth
 * instead of relying on the confusing native datetime-local control.
 */
export function MiniCalendar({ value, onChange, min }: MiniCalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(value));

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  const minTime = min ? startOfMonth(min).getTime() : 0;
  const canGoPrev = viewMonth.getTime() > minTime;

  return (
    <div className="w-full select-none rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => canGoPrev && setViewMonth((m) => addMonths(m, -1))}
          disabled={!canGoPrev}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground",
            canGoPrev
              ? "hover:bg-muted hover:text-foreground"
              : "cursor-not-allowed opacity-40"
          )}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">
          {format(viewMonth, "MMMM yyyy")}
        </span>
        <button
          type="button"
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="text-center text-[10px] font-medium uppercase text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const inMonth = d.getMonth() === viewMonth.getMonth();
          const disabled = min ? d.getTime() < startOfMonth(min).getTime() : false;
          const selected = isSameDay(d, value);
          return (
            <button
              key={d.toISOString()}
              type="button"
              disabled={disabled}
              onClick={() => onChange(d)}
              className={cn(
                "flex h-8 items-center justify-center rounded-md text-xs transition-colors",
                !inMonth && "text-muted-foreground/40",
                disabled && "cursor-not-allowed text-muted-foreground/30",
                !disabled && !selected && "hover:bg-muted",
                selected && "bg-primary font-semibold text-primary-foreground",
                !selected && isToday(d) && "ring-1 ring-primary/60"
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Time picker as two compact selects (hour : minute, 12h format). */
export function TimeSelect({
  value,
  onChange,
  min,
}: {
  value: Date;
  onChange: (d: Date) => void;
  min?: Date;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = [0, 15, 30, 45];

  const setH = (h: number) => {
    const d = new Date(value);
    d.setHours(h, d.getMinutes(), 0, 0);
    if (min && d.getTime() < min.getTime()) d.setTime(min.getTime());
    onChange(d);
  };
  const setM = (m: number) => {
    const d = new Date(value);
    d.setMinutes(m, 0, 0);
    if (min && d.getTime() < min.getTime()) d.setTime(min.getTime());
    onChange(d);
  };

  const fmtH = (h: number) => {
    const ampm = h >= 12 ? "PM" : "AM";
    const hh = h % 12 === 0 ? 12 : h % 12;
    return `${hh} ${ampm}`;
  };

  const selCls =
    "h-9 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring";

  return (
    <div className="flex items-center gap-1.5">
      <select
        aria-label="Hour"
        value={value.getHours()}
        onChange={(e) => setH(Number(e.target.value))}
        className={selCls}
      >
        {hours.map((h) => (
          <option key={h} value={h}>
            {fmtH(h)}
          </option>
        ))}
      </select>
      <span className="text-muted-foreground">:</span>
      <select
        aria-label="Minute"
        value={value.getMinutes()}
        onChange={(e) => setM(Number(e.target.value))}
        className={selCls}
      >
        {minutes.map((m) => (
          <option key={m} value={m}>
            {String(m).padStart(2, "0")}
          </option>
        ))}
      </select>
    </div>
  );
}
