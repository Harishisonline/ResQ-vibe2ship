/**
 * ResQ planning engine — pure functions that turn a flat task list into a plan.
 *
 * This is the "actually finish work" core: score tasks by urgency x importance,
 * find free calendar slots inside the user's work hours, break big tasks into
 * chunks, and assign the top tasks to the nearest free focus blocks.
 *
 * Pure (no IO) so it can be shared by the AI tool executor and the UI buttons.
 */

import type { Task, CalendarEvent, RiskLevel } from "@/types/task";

export interface PanicScore {
  taskId: string;
  score: number; // 0-100
  level: RiskLevel;
  factors: {
    timePressure: number; // 0-50
    importance: number; // 0-30
    progress: number; // -10-15
  };
}

/**
 * Score how close a task is to slipping. Urgency (deadline proximity) dominates,
 * weighted by importance (priority) and a small progress adjustment.
 */
export function panicScore(task: Task, now: Date = new Date()): PanicScore {
  if (task.status === "done" || task.status === "archived") {
    return {
      taskId: task.id,
      score: 0,
      level: "safe",
      factors: { timePressure: 0, importance: 0, progress: 0 },
    };
  }

  const deadline = new Date(task.deadline);
  const hoursLeft = (deadline.getTime() - now.getTime()) / 3_600_000;

  let timePressure: number;
  if (hoursLeft <= 0) timePressure = 50;
  else if (hoursLeft <= 4) timePressure = 46;
  else if (hoursLeft <= 12) timePressure = 40;
  else if (hoursLeft <= 24) timePressure = 34;
  else if (hoursLeft <= 72) timePressure = 24;
  else if (hoursLeft <= 168) timePressure = 14;
  else timePressure = 6;

  // P1 = 30, P2 = 24, P3 = 18, P4 = 12, P5 = 6
  const importance = (6 - task.priority) * 6;

  let progress = 0;
  if (task.status === "blocked") progress = 12;
  else if (task.status === "in_progress") progress = -6;

  const score = Math.max(
    0,
    Math.min(100, Math.round(timePressure + importance + progress))
  );
  const level: RiskLevel =
    score > 75 ? "critical" : score > 50 ? "warning" : score > 25 ? "watch" : "safe";

  return { taskId: task.id, score, level, factors: { timePressure, importance, progress } };
}

export interface Slot {
  start: Date;
  end: Date;
  minutes: number;
}

function setTimeOn(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Find free focus slots within the user's work hours over the next `days` days,
 * subtracting existing calendar events. Slots shorter than `minMinutes` are
 * dropped so we never schedule a focus block too short to be useful.
 */
export function findFreeSlots(opts: {
  from: Date;
  days: number;
  events: CalendarEvent[];
  workHours: { start: string; end: string };
  minMinutes?: number;
}): Slot[] {
  const minMinutes = opts.minMinutes ?? 30;
  const slots: Slot[] = [];

  for (let d = 0; d < opts.days; d++) {
    const day = new Date(opts.from);
    day.setDate(day.getDate() + d);
    // Don't look earlier than "now" on the first day.
    const ws = setTimeOn(day, opts.workHours.start);
    const we = setTimeOn(day, opts.workHours.end);
    const dayStart = d === 0 ? new Date(Math.max(ws.getTime(), opts.from.getTime())) : ws;
    if (we <= dayStart) continue;

    const busy: { s: Date; e: Date }[] = [];
    for (const ev of opts.events) {
      const s = new Date(ev.start);
      const e = new Date(ev.end);
      if (e <= dayStart || s >= we) continue;
      busy.push({ s: s < dayStart ? dayStart : s, e: e > we ? we : e });
    }
    busy.sort((a, b) => a.s.getTime() - b.s.getTime());

    let cursor = dayStart;
    for (const b of busy) {
      if (b.s > cursor) {
        const mins = (b.s.getTime() - cursor.getTime()) / 60_000;
        if (mins >= minMinutes) {
          slots.push({ start: new Date(cursor), end: new Date(b.s), minutes: Math.floor(mins) });
        }
      }
      if (b.e > cursor) cursor = b.e;
    }
    const mins = (we.getTime() - cursor.getTime()) / 60_000;
    if (mins >= minMinutes) {
      slots.push({ start: new Date(cursor), end: new Date(we), minutes: Math.floor(mins) });
    }
  }

  return slots;
}

export interface DayPlanItem {
  task: Task;
  slot?: Slot;
  /** True when scheduled at the task's deadline (user-stated time). */
  atDeadline?: boolean;
}

export interface PlannedBlock {
  title: string;
  start: Date;
  end: Date;
  kind: "personal" | "focus" | "deadline";
  taskId?: string;
  task?: Task;
  isRoutine?: boolean;
  /** Chunk subtask — stored on task, not shown on calendar. */
  isChunk?: boolean;
  parentId?: string;
  parentTitle?: string;
  hideFromCalendar?: boolean;
  /** Hard deadline marker at parent due time. */
  isDeadlineMarker?: boolean;
}

export interface DaySchedule {
  blocks: PlannedBlock[];
  skipped: Task[];
  /** Parent tasks due today — for deadline banner in plan summary. */
  deadlinesToday: { task: Task; deadline: Date }[];
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

type Interval = { start: number; end: number };

function overlapsAny(s: Date, e: Date, occupied: Interval[]): boolean {
  const a = s.getTime();
  const b = e.getTime();
  return occupied.some((o) => o.start < b && o.end > a);
}

function addOccupied(occupied: Interval[], s: Date, e: Date): void {
  occupied.push({ start: s.getTime(), end: e.getTime() });
}

export interface ChunkSlot {
  start: Date;
  end: Date;
}

/**
 * Assign focus slots for subtasks/chunks that must all finish before `before`
 * (typically the parent task deadline). Fills earliest free gaps first.
 */
export function assignChunkSlots(opts: {
  count: number;
  minutesEach: number[];
  before: Date;
  from: Date;
  events: CalendarEvent[];
  occupied?: Interval[];
  planningHours?: { start: string; end: string };
}): ChunkSlot[] {
  const planningHours = opts.planningHours ?? { start: "07:00", end: "23:00" };
  const horizonDays = Math.max(
    1,
    Math.min(14, Math.ceil((opts.before.getTime() - opts.from.getTime()) / 86_400_000) + 1)
  );
  const dayEnd = new Date(startOfDay(opts.before).getTime() + 86_400_000);
  const occupied = opts.occupied
    ? [...opts.occupied]
    : collectOccupied(opts.events, opts.from, dayEnd);
  const slots = findFreeSlots({
    from: opts.from,
    days: horizonDays,
    events: opts.events,
    workHours: planningHours,
    minMinutes: 25,
  });
  const result: ChunkSlot[] = [];

  for (let i = 0; i < opts.count; i++) {
    const need = Math.min(Math.max(25, opts.minutesEach[i] ?? 45), 120);
    const slot = slots.find((s) => {
      if (s.start < opts.from) return false;
      const dur = Math.min(need, s.minutes);
      const end = new Date(s.start.getTime() + dur * 60_000);
      if (end > opts.before) return false;
      return !overlapsAny(s.start, end, occupied);
    });
    if (!slot) continue;
    const dur = Math.min(need, slot.minutes);
    const start = new Date(slot.start);
    const end = new Date(start.getTime() + dur * 60_000);
    result.push({ start, end });
    addOccupied(occupied, start, end);
  }

  return result;
}

/** Schedule chunk subtasks backward from parent deadline into free gaps. */
function scheduleChunksForParent(
  parent: Task,
  chunks: Task[],
  from: Date,
  today: Date,
  occupied: Interval[],
  events: CalendarEvent[],
  planningHours: { start: string; end: string },
  skipped: Task[]
): PlannedBlock[] {
  const parentEnd = new Date(parent.deadline);
  if (!sameCalendarDay(parentEnd, today) || parentEnd <= from) {
    skipped.push(...chunks);
    return [];
  }

  const sorted = [...chunks].sort(
    (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
  );
  const blocks: PlannedBlock[] = [];
  let cursor = parentEnd.getTime();

  for (let i = sorted.length - 1; i >= 0; i--) {
    const chunk = sorted[i];
    const needMin = Math.min(Math.max(25, chunk.estimatedMinutes || 45), 90);
    let end = new Date(cursor);
    let start = new Date(end.getTime() - needMin * 60_000);

    if (start < from) {
      skipped.push(chunk);
      continue;
    }

    // Nudge earlier if overlapping occupied intervals (routines, meals, etc.)
    if (overlapsAny(start, end, occupied)) {
      const slots = findFreeSlots({
        from,
        days: 1,
        events,
        workHours: planningHours,
        minMinutes: 25,
      });
      const slot = slots.find((s) => {
        const dur = Math.min(needMin, s.minutes);
        const e = new Date(s.start.getTime() + dur * 60_000);
        if (e > parentEnd) return false;
        return !overlapsAny(s.start, e, occupied);
      });
      if (!slot) {
        skipped.push(chunk);
        continue;
      }
      const dur = Math.min(needMin, slot.minutes);
      start = new Date(slot.start);
      end = new Date(start.getTime() + dur * 60_000);
    }

    blocks.unshift({
      title: chunk.title,
      start,
      end,
      kind: "focus",
      taskId: chunk.id,
      task: chunk,
      isChunk: true,
      parentId: parent.id,
      parentTitle: parent.title,
      hideFromCalendar: true,
    });
    addOccupied(occupied, start, end);
    cursor = start.getTime();
  }

  // Deadline marker at parent due time
  blocks.push({
    title: `${parent.title} — due`,
    start: new Date(parentEnd.getTime() - 15 * 60_000),
    end: parentEnd,
    kind: "deadline",
    taskId: parent.id,
    task: parent,
    parentId: parent.id,
    parentTitle: parent.title,
    isDeadlineMarker: true,
    hideFromCalendar: false,
  });
  addOccupied(occupied, new Date(parentEnd.getTime() - 15 * 60_000), parentEnd);

  return blocks;
}

/** Lifestyle / meal / exercise tasks happen AT their deadline, not in random morning slots. */
export function isPersonalActivity(title: string): boolean {
  return /\b(breakfast|lunch|dinner|brunch|meal|snack|gym|workout|exercise|walk|walking|run|running|yoga|stretch|coffee|tea|nap|sleep|wind.?down|games?|play|movie|relax)\b/i.test(
    title
  );
}

const ROUTINE_TEMPLATES: { title: string; start: string; end: string }[] = [
  { title: "Breakfast", start: "07:30", end: "08:00" },
  { title: "Morning walk", start: "08:00", end: "08:20" },
  { title: "Lunch", start: "12:30", end: "13:00" },
  { title: "Afternoon break", start: "15:00", end: "15:15" },
  { title: "Evening wind-down", start: "21:30", end: "22:00" },
];

function collectOccupied(events: CalendarEvent[], from: Date, dayEnd: Date): Interval[] {
  const occupied: Interval[] = [];
  for (const ev of events) {
    const s = new Date(ev.start);
    const e = new Date(ev.end);
    if (e <= from || s >= dayEnd) continue;
    occupied.push({
      start: Math.max(s.getTime(), from.getTime()),
      end: Math.min(e.getTime(), dayEnd.getTime()),
    });
  }
  return occupied;
}

/**
 * Build a full day timeline: wellness routines + user tasks at their stated
 * deadline times + flexible focus blocks in remaining free slots.
 */
export function buildDaySchedule(
  tasks: Task[],
  events: CalendarEvent[],
  workHours: { start: string; end: string },
  from: Date = new Date(),
  opts: { maxFocus?: number } = {}
): DaySchedule {
  const maxFocus = opts.maxFocus ?? 4;
  const today = startOfDay(from);
  const dayEnd = new Date(today.getTime() + 86_400_000);
  const occupied = collectOccupied(events, from, dayEnd);
  const blocks: PlannedBlock[] = [];
  const skipped: Task[] = [];

  // 1) Daily wellness routines (only if slot is free and still ahead of us)
  for (const r of ROUTINE_TEMPLATES) {
    const start = setTimeOn(today, r.start);
    const end = setTimeOn(today, r.end);
    if (end <= from) continue;
    if (overlapsAny(start, end, occupied)) continue;
    blocks.push({ title: r.title, start, end, kind: "personal", isRoutine: true });
    addOccupied(occupied, start, end);
  }

  const horizonEnd = dayEnd;
  const hasUpcomingFocus = (taskId: string) =>
    events.some(
      (e) =>
        e.kind === "focus" &&
        e.linkedTaskId === taskId &&
        new Date(e.start) >= from &&
        new Date(e.start) < horizonEnd
    );

  const parentIdsWithChunks = new Set(
    tasks
      .filter((t) => t.tags.includes("chunk") && t.dependencies.length > 0)
      .map((t) => t.dependencies[0])
  );

  const isActive = (t: Task) =>
    t.status !== "done" &&
    t.status !== "archived" &&
    t.status !== "blocked" &&
    !hasUpcomingFocus(t.id);

  // Top-level tasks (parents without chunks, or standalone tasks)
  const activeTop = tasks.filter(
    (t) => isActive(t) && !t.tags.includes("chunk") && !parentIdsWithChunks.has(t.id)
  );

  // Chunk subtasks — scheduled under their parent, never as calendar events
  const activeChunks = tasks.filter((t) => isActive(t) && t.tags.includes("chunk"));

  const planningHours = { start: "07:00", end: "23:00" };

  // 2) Tasks due TODAY — personal at deadline; work tasks scheduled BEFORE deadline
  const timedToday = activeTop
    .filter((t) => {
      const dl = new Date(t.deadline);
      return sameCalendarDay(dl, today) && dl >= from;
    })
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());

  const timedIds = new Set<string>();
  const deadlinesToday: { task: Task; deadline: Date }[] = [];

  for (const t of timedToday) {
    const personal = isPersonalActivity(t.title);
    if (!personal) {
      // Work due today → flex/chunk scheduling before deadline, not at deadline
      continue;
    }
    const dur = Math.min(Math.max(30, t.estimatedMinutes || 60), 120);
    const start = new Date(t.deadline);
    const end = new Date(start.getTime() + dur * 60_000);
    if (overlapsAny(start, end, occupied)) {
      skipped.push(t);
      continue;
    }
    blocks.push({
      title: t.title,
      start,
      end,
      kind: "personal",
      taskId: t.id,
      task: t,
    });
    timedIds.add(t.id);
    addOccupied(occupied, start, end);
  }

  // 3) Chunk subtasks — fit into free slots BEFORE parent deadline (never after)
  const chunksByParent = new Map<string, Task[]>();
  for (const chunk of activeChunks) {
    const parentId = chunk.dependencies[0];
    if (!parentId) continue;
    const arr = chunksByParent.get(parentId) ?? [];
    arr.push(chunk);
    chunksByParent.set(parentId, arr);
  }

  for (const [parentId, chunks] of chunksByParent) {
    const parent = tasks.find((p) => p.id === parentId);
    if (!parent || parent.status === "done" || parent.status === "archived") {
      skipped.push(...chunks);
      continue;
    }
    const chunkBlocks = scheduleChunksForParent(
      parent,
      chunks,
      from,
      today,
      occupied,
      events,
      planningHours,
      skipped
    );
    blocks.push(...chunkBlocks);
    if (sameCalendarDay(new Date(parent.deadline), today)) {
      deadlinesToday.push({ task: parent, deadline: new Date(parent.deadline) });
    }
  }

  // 4) Flexible focus work in remaining free slots (top-level only, not chunks)
  const flexCandidates = activeTop
    .filter((t) => !timedIds.has(t.id))
    .map((t) => ({ t, s: panicScore(t, from).score }))
    .sort((a, b) => b.s - a.s);

  const slots = findFreeSlots({ from, days: 1, events, workHours: planningHours, minMinutes: 30 });
  let focusCount = 0;

  for (const { t } of flexCandidates) {
    const dl = new Date(t.deadline);
    const dueToday = sameCalendarDay(dl, today);
    if (!dueToday && focusCount >= maxFocus) {
      skipped.push(t);
      continue;
    }
    const need = Math.min(Math.max(30, t.estimatedMinutes || 60), 120);
    const slot = slots.find((s) => {
      if (s.minutes < Math.min(need, 45)) return false;
      const dur = Math.min(need, s.minutes);
      const endTs = s.start.getTime() + dur * 60_000;
      if (dueToday && endTs > dl.getTime()) return false;
      return !overlapsAny(s.start, new Date(endTs), occupied);
    });
    if (!slot) {
      skipped.push(t);
      continue;
    }
    const dur = Math.min(need, slot.minutes);
    const start = new Date(slot.start);
    const end = new Date(start.getTime() + dur * 60_000);
    blocks.push({
      title: t.title,
      start,
      end,
      kind: "focus",
      taskId: t.id,
      task: t,
    });
    addOccupied(occupied, start, end);
    focusCount++;
    if (dueToday && !parentIdsWithChunks.has(t.id)) {
      const exists = deadlinesToday.some((d) => d.task.id === t.id);
      if (!exists) deadlinesToday.push({ task: t, deadline: dl });
      // Single deadline marker for standalone due-today work
      if (!blocks.some((b) => b.isDeadlineMarker && b.parentId === t.id)) {
        blocks.push({
          title: `${t.title} — due`,
          start: new Date(dl.getTime() - 15 * 60_000),
          end: dl,
          kind: "deadline",
          taskId: t.id,
          task: t,
          isDeadlineMarker: true,
        });
      }
    }
  }

  blocks.sort((a, b) => a.start.getTime() - b.start.getTime());

  const scheduledIds = new Set(
    blocks.filter((b) => b.taskId).map((b) => b.taskId as string)
  );
  const seenSkipped = new Set<string>();
  const dedupedSkipped = skipped.filter((t) => {
    if (scheduledIds.has(t.id) || seenSkipped.has(t.id)) return false;
    seenSkipped.add(t.id);
    return true;
  });

  return { blocks, skipped: dedupedSkipped, deadlinesToday };
}

/**
 * Legacy greedy planner — delegates to buildDaySchedule for timed + routine logic.
 */
export function planDay(
  tasks: Task[],
  events: CalendarEvent[],
  workHours: { start: string; end: string },
  from: Date = new Date(),
  _days: number = 1
): DayPlanItem[] {
  const { blocks, skipped } = buildDaySchedule(tasks, events, workHours, from, {
    maxFocus: 99,
  });
  const skippedIds = new Set(skipped.map((t) => t.id));
  const items: DayPlanItem[] = [];

  for (const b of blocks) {
    if (!b.task || b.isRoutine) continue;
    items.push({
      task: b.task,
      slot: { start: b.start, end: b.end, minutes: Math.round((b.end.getTime() - b.start.getTime()) / 60_000) },
      atDeadline: sameCalendarDay(new Date(b.task.deadline), startOfDay(from)),
    });
  }

  for (const t of skipped) {
    if (!items.some((i) => i.task.id === t.id)) {
      items.push({ task: t });
    }
  }

  return items;
}

/**
 * Group a flat task list into parent tasks and their chunk subtasks. A task is
 * treated as a child of another task when it has the `chunk` tag and its first
 * dependency points to a task that exists in the list. Children whose parent
 * is missing stay at the top level so they're never hidden.
 */
export function groupTasksByParent(tasks: Task[]): {
  top: Task[];
  childrenOf: Map<string, Task[]>;
} {
  const ids = new Set(tasks.map((t) => t.id));
  const childrenOf = new Map<string, Task[]>();
  const top: Task[] = [];
  for (const t of tasks) {
    const parentId = t.parentId ?? (t.tags.includes("chunk") ? t.dependencies[0] : undefined);
    if (parentId && ids.has(parentId)) {
      const arr = childrenOf.get(parentId) ?? [];
      arr.push(t);
      childrenOf.set(parentId, arr);
    } else {
      top.push(t);
    }
  }
  // Sort each parent's children by deadline so subtasks read in order.
  childrenOf.forEach((list) =>
    list.sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
  );
  return { top, childrenOf };
}

export interface BreakDownChunk {
  title: string;
  minutes: number;
  deadline: string;
  focusStart?: string;
  focusEnd?: string;
}

export interface BreakDownPlan {
  parent: Task;
  chunks: BreakDownChunk[];
}

/**
 * Split a task into 2-6 finishable chunks and place each in a free focus slot
 * before the deadline. If no slots are free, chunks still get spaced-out
 * deadlines working backward from the parent deadline.
 */
export function planBreakDown(
  task: Task,
  events: CalendarEvent[],
  workHours: { start: string; end: string },
  now: Date = new Date()
): BreakDownPlan {
  const totalMin = Math.max(45, task.estimatedMinutes || 60);
  const chunkCount = Math.min(6, Math.max(2, Math.ceil(totalMin / 45)));
  const perChunk = Math.ceil(totalMin / chunkCount);

  const deadline = new Date(task.deadline);
  const horizonDays = Math.max(
    1,
    Math.min(14, Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000) + 1)
  );
  const slots = findFreeSlots({
    from: now,
    days: horizonDays,
    events,
    workHours,
    minMinutes: Math.min(perChunk, 45),
  });

  const chunks: BreakDownChunk[] = [];
  for (let i = 0; i < chunkCount; i++) {
    const slot = slots[i];
    const fallbackEnd = new Date(
      Math.min(deadline.getTime(), now.getTime() + (i + 1) * 86_400_000)
    );
    chunks.push({
      title: `${task.title} (part ${i + 1}/${chunkCount})`,
      minutes: perChunk,
      deadline: (slot?.end ?? fallbackEnd).toISOString(),
      focusStart: slot?.start.toISOString(),
      focusEnd: slot?.end.toISOString(),
    });
  }

  return { parent: task, chunks };
}

/**
 * A tiny, concrete "how to finish this" guide. The first step is always
 * under 5 minutes so the user starts now instead of stalling.
 */
export function guideFor(task: Task): string[] {
  const sprints = Math.max(1, Math.round((task.estimatedMinutes || 60) / 25));
  return [
    `Open "${task.title}" and spend 5 minutes writing what "done" looks like.`,
    `Break it into ${sprints} x 25-minute focus sprints with 5-minute breaks.`,
    `Do the hardest part first while your energy is highest.`,
    `At 80% done, take a 10-minute review pass, then submit and close it out.`,
  ];
}
