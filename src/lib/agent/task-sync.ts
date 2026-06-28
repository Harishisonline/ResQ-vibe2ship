/**
 * Task ↔ calendar sync helpers (mutations).
 * Visibility rules live in `@/lib/data/pool-sync`.
 */

import * as repo from "@/lib/data/repository";
import {
  filterVisibleEvents,
  isEventVisible,
  reconcilePool,
  pruneGoalLinks,
} from "@/lib/data/pool-sync";
import type { CalendarEvent, Task } from "@/types/task";

export { filterVisibleEvents, isEventVisible, reconcilePool, pruneGoalLinks };

/** Events linked to any of the given task ids (any kind — focus, personal, etc.). */
export function eventsForTasks(
  events: CalendarEvent[],
  taskIds: Set<string>,
  opts?: { upcomingOnly?: boolean; from?: Date }
): CalendarEvent[] {
  const from = opts?.from ?? new Date();
  return events.filter((e) => {
    if (!e.linkedTaskId || !taskIds.has(e.linkedTaskId)) return false;
    if (opts?.upcomingOnly && new Date(e.end) < from) return false;
    return true;
  });
}

/** Remove all calendar blocks tied to the given tasks. */
export async function removeEventsForTasks(
  uid: string,
  taskIds: string[],
  opts?: { upcomingOnly?: boolean }
): Promise<number> {
  if (taskIds.length === 0) return 0;
  const events = await repo.events.list(uid);
  const idSet = new Set(taskIds);
  const toRemove = eventsForTasks(events, idSet, {
    upcomingOnly: opts?.upcomingOnly ?? false,
    from: new Date(),
  });
  await Promise.all(toRemove.map((e) => repo.events.remove(uid, e.id)));
  return toRemove.length;
}

/**
 * When a task deadline moves, shift linked calendar blocks by the same delta
 * (preserving each block's duration).
 */
export async function syncRescheduleToCalendar(
  uid: string,
  taskId: string,
  oldDeadline: string,
  newDeadline: string
): Promise<number> {
  const events = await repo.events.list(uid);
  const linked = events.filter((e) => e.linkedTaskId === taskId);
  if (linked.length === 0) return 0;

  const oldTs = new Date(oldDeadline).getTime();
  const newTs = new Date(newDeadline).getTime();
  const delta = newTs - oldTs;
  if (delta === 0) return 0;

  await Promise.all(
    linked.map((e) => {
      const start = new Date(new Date(e.start).getTime() + delta);
      const end = new Date(new Date(e.end).getTime() + delta);
      return repo.events.update(uid, e.id, {
        start: start.toISOString(),
        end: end.toISOString(),
      });
    })
  );
  return linked.length;
}

/** Collect chunk child ids for a parent task. */
export function chunkChildIds(tasks: Task[], parentId: string): string[] {
  return tasks
    .filter(
      (t) =>
        t.tags.includes("chunk") &&
        (t.parentId === parentId || t.dependencies.includes(parentId))
    )
    .map((t) => t.id);
}
