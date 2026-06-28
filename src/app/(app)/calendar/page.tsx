"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Clock, List, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/auth-provider";
import { useCollection } from "@/hooks/use-collection";
import * as repo from "@/lib/data/repository";
import { pool } from "@/lib/data/pool";
import { filterVisibleEvents, isEventVisible, stalePoolEvents } from "@/lib/data/pool-sync";
import type { CalendarEvent, Task } from "@/types/task";
import { cn } from "@/lib/utils";
import { MiniCalendar, TimeSelect } from "@/components/mini-calendar";
import { Sparkles } from "lucide-react";

const HOUR_START = 0;
const HOUR_END = 24;
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => i + HOUR_START);
const ROW_H = 2.5; // rem per hour
const DAY_HEIGHT_REM = (HOUR_END - HOUR_START) * ROW_H;

const KIND_DOT: Record<CalendarEvent["kind"], string> = {
  focus: "bg-indigo-500",
  meeting: "bg-blue-500",
  class: "bg-amber-500",
  deadline: "bg-red-500",
  personal: "bg-emerald-500",
};

const KIND_LABELS: Record<CalendarEvent["kind"], string> = {
  focus: "Focus block",
  meeting: "Meeting",
  class: "Class",
  deadline: "Deadline",
  personal: "Personal",
};

/** Round a Date up to the next 15-minute mark so defaults never start in the past. */
function roundToQuarter(d: Date): Date {
  const x = new Date(d);
  x.setSeconds(0, 0);
  const m = x.getMinutes();
  x.setMinutes(m - (m % 15) + 15);
  return x;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Week starting Sunday.
function getWeekStart(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay(); // 0 = Sunday
  x.setDate(x.getDate() - day);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function fmtHour(h: number): string {
  const hh = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hh}${h >= 12 ? "p" : "a"}`;
}

export default function CalendarPage() {
  const { user } = useAuth();
  const userId = user?.uid ?? "demo-user";
  const { data: events, loading, error, refresh } = useCollection<CalendarEvent>(
    repo.events,
    userId
  );
  const { data: tasks } = useCollection<Task>(repo.tasks, userId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));

  const [title, setTitle] = useState("");
  const [start, setStart] = useState<Date>(() => roundToQuarter(new Date()));
  const [end, setEnd] = useState<Date>(() => new Date(roundToQuarter(new Date()).getTime() + 60 * 60000));
  const [kind, setKind] = useState<CalendarEvent["kind"]>("personal");
  const [description, setDescription] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const now = useMemo(() => new Date(), []);

  const resetForm = () => {
    setTitle("");
    setStart(roundToQuarter(new Date()));
    setEnd(new Date(roundToQuarter(new Date()).getTime() + 60 * 60000));
    setKind("personal");
    setDescription("");
  };

  const setStartDate = (date: Date) => {
    // Keep the existing time, swap in the new date.
    const next = new Date(start);
    next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    // If the chosen date is today and the preserved time is in the past, bump to now.
    if (next.getTime() < Date.now()) next.setTime(roundToQuarter(new Date()).getTime());
    setStart(next);
    if (end.getTime() <= next.getTime()) {
      setEnd(new Date(next.getTime() + 60 * 60000));
    }
  };

  const setStartTime = (d: Date) => {
    setStart(d);
    if (end.getTime() <= d.getTime()) setEnd(new Date(d.getTime() + 60 * 60000));
  };

  const setDuration = (minutes: number) => {
    setEnd(new Date(start.getTime() + minutes * 60000));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return toast.error("Title is required");
    if (start.getTime() < Date.now()) {
      return toast.error("Start time cannot be in the past");
    }
    if (end.getTime() <= start.getTime()) {
      return toast.error("End must be after start");
    }
    setSaving(true);
    try {
      await pool.events.create(userId, {
        userId,
        source: "manual",
        title: title.trim(),
        start: start.toISOString(),
        end: end.toISOString(),
        kind,
        description: description.trim() || undefined,
        linkedEntityType: undefined,
      });
      toast.success("Event added");
      resetForm();
      setDialogOpen(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add event");
    } finally {
      setSaving(false);
    }
  };

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const handleDelete = async (id: string) => {
    try {
      await repo.events.remove(userId, id);
      toast.success("Event deleted");
      refresh();
    } catch {
      toast.error("Delete failed");
    }
  };

  const displayEvents = useMemo(
    () => filterVisibleEvents(events, tasks),
    [events, tasks]
  );

  const handleCleanupFinished = async () => {
    const stale = stalePoolEvents(events, tasks);
    if (stale.length === 0) {
      toast.info("Nothing to clean up — your calendar is tidy.");
      return;
    }
    try {
      await Promise.all(stale.map((e) => repo.events.remove(userId, e.id)));
      toast.success(`Cleared ${stale.length} stale block${stale.length === 1 ? "" : "s"}.`);
      refresh();
    } catch {
      toast.error("Clean up failed");
    }
  };

  const goToday = () => setWeekStart(getWeekStart(new Date()));
  const prevWeek = () => setWeekStart((w) => addDays(w, -7));
  const nextWeek = () => setWeekStart((w) => addDays(w, 7));

  const today = new Date();
  // Per-day list of events that overlap that calendar day, with their visible
  // (clamped-to-day) start/end so multi-day events render on each day they span.
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    weekDays.forEach((d) => map.set(d.toDateString(), []));
    displayEvents.forEach((e) => {
      const s = new Date(e.start);
      const key = s.toDateString();
      if (map.has(key)) map.get(key)!.push(e);
    });
    map.forEach((list) =>
      list.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    );
    return map;
  }, [displayEvents, weekDays]);

  // Per-day clamped bounds used by the absolute-positioned day columns.
  const dayColumns = useMemo(() => {
    return weekDays.map((d) => {
      const dayStart = startOfDay(d);
      const dayEnd = addDays(dayStart, 1);
      const list = displayEvents
        .map((e) => {
          const es = new Date(e.start);
          const en = new Date(e.end);
          if (en <= dayStart || es >= dayEnd) return null;
          const clampStart = es < dayStart ? dayStart : es;
          const clampEnd = en > dayEnd ? dayEnd : en;
          return { event: e, clampStart, clampEnd };
        })
        .filter((x): x is { event: CalendarEvent; clampStart: Date; clampEnd: Date } => x !== null)
        .sort(
          (a, b) => a.clampStart.getTime() - b.clampStart.getTime()
        );
      // Active task deadlines that already have a linked calendar block are not
      // duplicated — ensureTaskCalendarEvents mirrors tasks into the event pool.
      return { day: d, dayStart, items: list };
    });
  }, [weekDays, displayEvents]);

  const weekEvents = useMemo(
    () =>
      displayEvents.filter((e) => {
        const s = new Date(e.start);
        return s >= weekStart && s < addDays(weekStart, 7);
      }),
    [displayEvents, weekStart]
  );

  const weekTotal = weekEvents.length;
  const busiestDay = weekDays.reduce<{ day: Date; count: number } | null>((acc, d) => {
    const count = eventsByDay.get(d.toDateString())!.length;
    if (!acc || count > acc.count) return { day: d, count };
    return acc;
  }, null);

  const busyMinutes = weekEvents.reduce((sum, e) => {
    const s = new Date(e.start);
    const en = new Date(e.end);
    return sum + Math.max(0, en.getTime() - s.getTime()) / 60000;
  }, 0);
  const busyHours = Math.round((busyMinutes / 60) * 10) / 10;

  const weekLabel = `${weekStart.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} - ${addDays(weekStart, 6).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;

  // Density-based column tint: 0 events -> none, 1-2 -> light, 3+ -> stronger.
  const densityTint = (count: number) =>
    count === 0
      ? ""
      : count <= 2
      ? "bg-primary/[0.03]"
      : count <= 4
      ? "bg-primary/[0.07]"
      : "bg-primary/[0.12]";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
            <p className="text-sm text-muted-foreground">
              {weekLabel} · {weekTotal} event{weekTotal === 1 ? "" : "s"} · {busyHours}h booked
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToday}>
              Today
            </Button>
            <Button variant="outline" size="icon" onClick={prevWeek} aria-label="Previous week">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={nextWeek} aria-label="Next week">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={refresh} aria-label="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleCleanupFinished}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Clean up finished
            </Button>
            <ManageEventsDialog events={displayEvents} userId={userId} onChanged={refresh} />
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger render={<Button size="sm" />}>
                <Plus className="mr-1.5 h-4 w-4" /> New event
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>New event</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ev-title">Title</Label>
                    <Input
                      id="ev-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Study session"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Date</Label>
                    <MiniCalendar value={start} onChange={setStartDate} min={now} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Start time</Label>
                      <TimeSelect value={start} onChange={setStartTime} min={now} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>End time</Label>
                      <TimeSelect value={end} onChange={setEnd} min={start} />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Duration:</span>
                    {[
                      { label: "30m", mins: 30 },
                      { label: "1h", mins: 60 },
                      { label: "2h", mins: 120 },
                      { label: "3h", mins: 180 },
                    ].map((d) => (
                      <button
                        key={d.mins}
                        type="button"
                        onClick={() => setDuration(d.mins)}
                        className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>

                  <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    <Clock className="mr-1 inline h-3 w-3" />
                    {format(start, "EEE, MMM d · h:mm a")} - {format(end, "h:mm a")}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ev-kind">Type</Label>
                    <select
                      id="ev-kind"
                      value={kind}
                      onChange={(e) => setKind(e.target.value as CalendarEvent["kind"])}
                      className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring"
                    >
                      {(Object.keys(KIND_LABELS) as CalendarEvent["kind"][]).map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ev-desc">Description</Label>
                    <Textarea
                      id="ev-desc"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                      placeholder="Optional"
                    />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={saving}>
                      {saving ? "Saving…" : "Add event"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Event details dialog */}
        <EventDetailsDialog
          event={selectedEvent}
          tasks={tasks}
          onClose={() => setSelectedEvent(null)}
          onDelete={async (id) => {
            await handleDelete(id);
            setSelectedEvent(null);
          }}
        />

        {/* Busy / free summary bar */}
        {!loading && (
          <Card className="mb-4">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                {weekDays.map((d) => {
                  const list = eventsByDay.get(d.toDateString())!;
                  const count = list.length;
                  const isToday = sameDay(d, today);
                  return (
                    <div key={d.toISOString()} className="flex flex-1 flex-col items-center gap-1">
                      <span
                        className={cn(
                          "text-[10px] font-medium uppercase",
                          isToday ? "text-primary" : "text-muted-foreground"
                        )}
                      >
                        {d.toLocaleDateString(undefined, { weekday: "short" })}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-semibold",
                          isToday ? "text-primary" : "text-foreground"
                        )}
                      >
                        {d.getDate()}
                      </span>
                      <div
                        className={cn(
                          "h-8 w-full rounded-md transition-colors",
                          densityTint(count)
                        )}
                        title={`${count} event${count === 1 ? "" : "s"}`}
                      >
                        <div className="flex h-full items-center justify-center gap-0.5 px-1">
                          {list.slice(0, 5).map((e) => (
                            <span
                              key={e.id}
                              className={cn("h-1.5 w-1.5 rounded-full", KIND_DOT[e.kind])}
                            />
                          ))}
                          {count === 0 && (
                            <span className="text-[9px] text-muted-foreground/60">free</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {error && (
          <Card className="mb-4 border-amber-500/40 bg-amber-500/5">
            <CardContent className="p-3 text-sm text-amber-700 dark:text-amber-300">
              Couldn&apos;t reach the cloud calendar. If an ad-blocker is on, disable it for this
              site, or your events are being saved locally in this browser.
            </CardContent>
          </Card>
        )}

        {loading ? (
          <Skeleton className="h-[36rem]" />
        ) : (
          <Card>
            <CardContent className="p-4">
              {/* Legend */}
              <div className="mb-3 flex flex-wrap items-center gap-3">
                {(Object.keys(KIND_LABELS) as CalendarEvent["kind"][]).map((k) => (
                  <div key={k} className="flex items-center gap-1.5">
                    <span className={cn("h-2.5 w-2.5 rounded-full", KIND_DOT[k])} />
                    <span className="text-xs text-muted-foreground">{KIND_LABELS[k]}</span>
                  </div>
                ))}
                {busiestDay && busiestDay.count > 0 && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    Busiest:{" "}
                    <span className="font-medium text-foreground">
                      {busiestDay.day.toLocaleDateString(undefined, { weekday: "short" })}
                    </span>{" "}
                    ({busiestDay.count})
                  </span>
                )}
              </div>

              {/* Week grid: time axis + absolute-positioned day columns */}
              <div className="grid grid-cols-[2.5rem_repeat(7,1fr)] gap-px overflow-x-auto">
                {/* Header row */}
                <div />
                {weekDays.map((d) => {
                  const isToday = sameDay(d, today);
                  return (
                    <div
                      key={d.toISOString()}
                      className={cn(
                        "pb-2 text-center",
                        isToday && "rounded-t-md bg-primary/5"
                      )}
                    >
                      <p
                        className={cn(
                          "text-[10px] font-medium uppercase",
                          isToday ? "text-primary" : "text-muted-foreground"
                        )}
                      >
                        {d.toLocaleDateString(undefined, { weekday: "short" })}
                      </p>
                      <p
                        className={cn(
                          "text-sm font-semibold",
                          isToday ? "text-primary" : "text-foreground"
                        )}
                      >
                        {d.getDate()}
                      </p>
                    </div>
                  );
                })}

                {/* Time axis label column (spans the full day height) */}
                <div className="relative" style={{ height: `${DAY_HEIGHT_REM}rem` }}>
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="absolute left-0 right-0 flex items-start justify-end pr-1 text-[10px] font-medium text-muted-foreground"
                      style={{ top: `${hour * ROW_H}rem`, height: `${ROW_H}rem` }}
                    >
                      {fmtHour(hour)}
                    </div>
                  ))}
                </div>

                {/* One absolute-positioned column per day */}
                {dayColumns.map((col) => {
                  const isToday = sameDay(col.day, today);
                  const count = col.items.length;
                  return (
                    <DayColumn
                      key={col.day.toISOString()}
                      day={col.day}
                      dayStart={col.dayStart}
                      items={col.items}
                      onSelect={setSelectedEvent}
                      isToday={isToday}
                      tint={densityTint(count)}
                    />
                  );
                })}
              </div>

              {weekEvents.length === 0 && (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No events this week. Add one with &ldquo;New event&rdquo; or ask ResQ to block
                  focus time.
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function DayColumn({
  day,
  dayStart,
  items,
  onSelect,
  isToday,
  tint,
}: {
  day: Date;
  dayStart: Date;
  items: { event: CalendarEvent; clampStart: Date; clampEnd: Date }[];
  onSelect: (event: CalendarEvent) => void;
  isToday: boolean;
  tint: string;
}) {
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    <div
      className={cn(
        "relative border-l border-border/30",
        isToday && "bg-primary/[0.04]",
        tint
      )}
      style={{ height: `${DAY_HEIGHT_REM}rem` }}
      aria-label={`${day.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}`}
    >
      {/* Hour gridlines */}
      {HOURS.map((hour) => (
        <div
          key={hour}
          className={cn(
            "absolute left-0 right-0 border-t border-border/20",
            hour === 0 && "border-t-0"
          )}
          style={{ top: `${hour * ROW_H}rem`, height: `${ROW_H}rem` }}
        />
      ))}

      {/* Event cards — click to open details */}
      {items.map(({ event, clampStart, clampEnd }) => {
        const topRem = ((clampStart.getTime() - dayStart.getTime()) / 3600000) * ROW_H;
        const heightRem = Math.max(
          1.1,
          ((clampEnd.getTime() - clampStart.getTime()) / 3600000) * ROW_H
        );
        const s = new Date(event.start);
        const en = new Date(event.end);
        const isContinuation = clampStart.getTime() > s.getTime();
        const isTruncated = clampEnd.getTime() < en.getTime();
        const dot = KIND_DOT[event.kind];
        return (
          <button
            key={event.id}
            type="button"
            onClick={() => onSelect(event)}
            className={cn(
              "group absolute left-1 right-1 z-10 flex flex-col overflow-hidden rounded-md border border-border/70 bg-card/95 px-1.5 py-1 text-left shadow-sm transition-all hover:border-primary/60 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            )}
            style={{ top: `${topRem}rem`, height: `${heightRem}rem` }}
          >
            <span
              className={cn("absolute inset-y-1 left-0 w-1 rounded-full", dot)}
              aria-hidden
            />
            <div className="flex items-center gap-1 pl-1">
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} aria-hidden />
              <p className="truncate text-[10px] font-semibold leading-tight text-foreground">
                {isContinuation ? "↳ " : ""}
                {event.title}
              </p>
              {event.source === "agent" && (
                <Badge variant="secondary" className="h-3.5 shrink-0 px-1 py-0 text-[8px]">
                  AI
                </Badge>
              )}
            </div>
            <p className="mt-0.5 truncate pl-1 text-[9px] text-muted-foreground">
              {fmtTime(s)} - {fmtTime(en)}
              {isTruncated ? " →" : ""}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function EventDetailsDialog({
  event,
  tasks,
  onClose,
  onDelete,
}: {
  event: CalendarEvent | null;
  tasks: Task[];
  onClose: () => void;
  onDelete: (id: string) => Promise<void> | void;
}) {
  const [deleting, setDeleting] = useState(false);
  if (!event) return null;
  const linkedTask = event.linkedTaskId
    ? tasks.find((t) => t.id === event.linkedTaskId)
    : undefined;
  const s = new Date(event.start);
  const en = new Date(event.end);
  const durationMin = Math.max(1, Math.round((en.getTime() - s.getTime()) / 60000));
  const durationLabel =
    durationMin >= 60
      ? `${Math.floor(durationMin / 60)}h ${durationMin % 60 ? `${durationMin % 60}m` : ""}`.trim()
      : `${durationMin}m`;

  return (
    <Dialog open={!!event} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate">{event.title}</DialogTitle>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span
                  className={cn("h-2 w-2 rounded-full", KIND_DOT[event.kind])}
                  aria-hidden
                />
                <Badge variant="secondary" className="text-[10px]">
                  {KIND_LABELS[event.kind]}
                </Badge>
                {event.source === "agent" && (
                  <Badge variant="secondary" className="text-[10px]">AI created</Badge>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Start</span>
              <span className="font-medium">
                {format(s, "EEE, MMM d, yyyy · h:mm a")}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-muted-foreground">End</span>
              <span className="font-medium">
                {format(en, "EEE, MMM d, yyyy · h:mm a")}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Duration</span>
              <span className="font-medium">{durationLabel}</span>
            </div>
          </div>

          {event.description ? (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Description
              </p>
              <p className="whitespace-pre-line rounded-lg border border-border/40 p-3 text-sm text-foreground/90">
                {event.description}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No description added.</p>
          )}

          {linkedTask && (
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Linked task
              </p>
              <p className="mt-1 font-medium">{linkedTask.title}</p>
              <p className="text-xs text-muted-foreground">
                Due{" "}
                {new Date(linkedTask.deadline).toLocaleString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
                {linkedTask.status === "done" ? " · completed" : ""}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="destructive"
            size="sm"
            disabled={deleting}
            onClick={async () => {
              setDeleting(true);
              try {
                await onDelete(event.id);
              } finally {
                setDeleting(false);
              }
            }}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            {deleting ? "Deleting…" : "Delete event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageEventsDialog({
  events,
  userId,
  onChanged,
}: {
  events: CalendarEvent[];
  userId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<CalendarEvent["kind"]>("personal");
  const [start, setStart] = useState<Date>(new Date());
  const [end, setEnd] = useState<Date>(new Date());
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sorted = [...events].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  const startEdit = (e: CalendarEvent) => {
    setEditId(e.id);
    setTitle(e.title);
    setKind(e.kind);
    setStart(new Date(e.start));
    setEnd(new Date(e.end));
    setDescription(e.description ?? "");
  };

  const cancelEdit = () => {
    setEditId(null);
    setTitle("");
    setDescription("");
  };

  const setEditDate = (date: Date) => {
    const next = new Date(start);
    next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    setStart(next);
    if (end.getTime() <= next.getTime()) setEnd(new Date(next.getTime() + 60 * 60000));
  };

  const setEditStart = (d: Date) => {
    setStart(d);
    if (end.getTime() <= d.getTime()) setEnd(new Date(d.getTime() + 60 * 60000));
  };

  const save = async () => {
    if (!editId) return;
    if (!title.trim()) return toast.error("Title is required");
    if (end.getTime() <= start.getTime()) return toast.error("End must be after start");
    setSaving(true);
    try {
      await repo.events.update(userId, editId, {
        title: title.trim(),
        kind,
        start: start.toISOString(),
        end: end.toISOString(),
        description: description.trim() || undefined,
      });
      toast.success("Event updated");
      setEditId(null);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      await repo.events.remove(userId, id);
      toast.success("Event deleted");
      if (editId === id) setEditId(null);
      onChanged();
    } catch {
      toast.error("Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <List className="mr-1.5 h-4 w-4" /> Manage events
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage events</DialogTitle>
        </DialogHeader>
        {sorted.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No events yet.</p>
        ) : (
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {sorted.map((e) => (
              <li key={e.id} className="rounded-lg border border-border/60 bg-card/60 p-2.5">
                {editId === e.id ? (
                  <div className="space-y-2">
                    <Input
                      value={title}
                      onChange={(ev) => setTitle(ev.target.value)}
                      placeholder="Title"
                    />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <Label className="text-[11px]">Date</Label>
                        <MiniCalendar value={start} onChange={setEditDate} />
                      </div>
                      <div className="space-y-2">
                        <div>
                          <Label className="text-[11px]">Start time</Label>
                          <TimeSelect value={start} onChange={setEditStart} />
                        </div>
                        <div>
                          <Label className="text-[11px]">End time</Label>
                          <TimeSelect value={end} onChange={setEnd} min={start} />
                        </div>
                        <div>
                          <Label className="text-[11px]">Type</Label>
                          <select
                            value={kind}
                            onChange={(ev) => setKind(ev.target.value as CalendarEvent["kind"])}
                            className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring"
                          >
                            {(Object.keys(KIND_LABELS) as CalendarEvent["kind"][]).map((k) => (
                              <option key={k} value={k}>
                                {KIND_LABELS[k]}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                    <Textarea
                      value={description}
                      onChange={(ev) => setDescription(ev.target.value)}
                      rows={2}
                      placeholder="Description (optional)"
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={cancelEdit}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={save} disabled={saving}>
                        {saving ? "Saving…" : "Save changes"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", KIND_DOT[e.kind])} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {format(new Date(e.start), "EEE, MMM d · h:mm a")} -{" "}
                        {format(new Date(e.end), "h:mm a")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 flex-shrink-0 px-2 text-xs"
                      onClick={() => startEdit(e)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(e.id)}
                      disabled={deletingId === e.id}
                      aria-label="Delete event"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
