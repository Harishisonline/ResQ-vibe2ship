/**
 * Filter plan-my-day skipped list — no duplicates with the schedule table.
 */

import type { Task } from "@/types/task";

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

export function filterPlanSkipped(
  skipped: Task[],
  scheduledIds: Set<string>,
  scheduledTitles: Set<string>,
  tasks: Task[],
  today: Date = new Date()
): Task[] {
  const todayStart = startOfDay(today);
  const parentIdsWithChunks = new Set(
    tasks
      .filter((t) => t.tags.includes("chunk") && (t.parentId || t.dependencies[0]))
      .map((t) => t.parentId ?? t.dependencies[0])
  );

  const seen = new Set<string>();
  return skipped.filter((t) => {
    if (scheduledIds.has(t.id) || seen.has(t.id)) return false;

    const normTitle = t.title.trim().toLowerCase();
    if (scheduledTitles.has(normTitle)) return false;

    // Parent with subtasks is not a schedulable row — never list as "couldn't fit"
    if (parentIdsWithChunks.has(t.id)) return false;

    // Subtasks are managed under their parent — never list individually
    if (t.tags.includes("chunk")) return false;

    // Only tasks due today belong in "Couldn't fit today"
    if (!sameCalendarDay(new Date(t.deadline), todayStart)) return false;

    seen.add(t.id);
    return true;
  });
}

/** Tasks due later — show separately from today's overflow. */
export function filterPlanLater(skipped: Task[], today: Date = new Date()): Task[] {
  const todayStart = startOfDay(today);
  const seen = new Set<string>();
  return skipped.filter((t) => {
    if (seen.has(t.id)) return false;
    if (sameCalendarDay(new Date(t.deadline), todayStart)) return false;
    seen.add(t.id);
    return true;
  });
}
