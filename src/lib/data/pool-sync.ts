/**
 * Unified data-pool sync — tasks, calendar events, and goals stay consistent.
 *
 * Rule: calendar blocks created by the AI must reference a live task in the pool.
 * User/manual and Google events are never auto-deleted. Orphan agent blocks are
 * purged whenever the pool changes or on app load.
 */

import * as repo from "@/lib/data/repository";
import { ensureTaskCalendarEvents } from "@/lib/data/calendar-sync";
import type { CalendarEvent, Goal, Task } from "@/types/task";

/** Agent-created events must link to an active top-level task in the pool. */
export function isEventVisible(event: CalendarEvent, tasks: Task[]): boolean {
  if (event.source === "manual" || event.source === "google") return true;

  if (event.source === "agent") {
    if (!event.linkedTaskId) return false;
    const task = tasks.find((t) => t.id === event.linkedTaskId);
    if (!task) return false;
    if (task.tags.includes("chunk")) return false;
    if (task.status === "done" || task.status === "archived") return false;
    return true;
  }

  if (event.linkedTaskId) {
    const task = tasks.find((t) => t.id === event.linkedTaskId);
    if (!task) return false;
    if (task.tags.includes("chunk")) return false;
    if (task.status === "done" || task.status === "archived") return false;
  }

  return true;
}

export function filterVisibleEvents(events: CalendarEvent[], tasks: Task[]): CalendarEvent[] {
  return events.filter((e) => isEventVisible(e, tasks));
}

/** Events that no longer belong in the pool (safe to delete from storage). */
export function stalePoolEvents(events: CalendarEvent[], tasks: Task[]): CalendarEvent[] {
  return events.filter((e) => !isEventVisible(e, tasks) && e.source !== "manual" && e.source !== "google");
}

const taskIds = (tasks: Task[]) => new Set(tasks.map((t) => t.id));

/** Remove goal → task links when tasks leave the pool. */
export async function pruneGoalLinks(uid: string, removedTaskIds: Set<string>): Promise<number> {
  if (removedTaskIds.size === 0) return 0;
  const goals = await repo.goals.list(uid);
  let updated = 0;
  for (const g of goals) {
    const next = g.linkedTasks.filter((id) => !removedTaskIds.has(id));
    if (next.length !== g.linkedTasks.length) {
      await repo.goals.update(uid, g.id, { linkedTasks: next } as Partial<Goal>);
      updated++;
    }
  }
  return updated;
}

/**
 * Purge orphan agent calendar blocks and fix goal links.
 * Call after any task delete/complete or on app load when drift is detected.
 */
export async function reconcilePool(uid: string): Promise<{ removedEvents: number; goalsPatched: number; createdEvents: number }> {
  const [tasks, events] = await Promise.all([
    repo.tasks.list(uid),
    repo.events.list(uid),
  ]);

  const stale = stalePoolEvents(events, tasks);
  const ids = taskIds(tasks);

  // Also drop agent events whose linked task id vanished (belt-and-suspenders).
  const orphanLinked = events.filter(
    (e) =>
      e.source === "agent" &&
      e.linkedTaskId &&
      !ids.has(e.linkedTaskId) &&
      !stale.some((s) => s.id === e.id)
  );
  const toRemove = [...stale, ...orphanLinked];

  await Promise.all(toRemove.map((e) => repo.events.remove(uid, e.id)));

  const removedIds = new Set(toRemove.map((e) => e.linkedTaskId).filter(Boolean) as string[]);
  const goalsPatched = await pruneGoalLinks(uid, removedIds);

  const tasksAfter = toRemove.length > 0 ? await repo.tasks.list(uid) : tasks;
  const eventsAfter = toRemove.length > 0 ? await repo.events.list(uid) : events;
  const createdEvents = await ensureTaskCalendarEvents(uid, tasksAfter, eventsAfter);

  return { removedEvents: toRemove.length, goalsPatched, createdEvents };
}
