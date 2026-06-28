/**
 * Calendar sync — infer event categories and mirror active tasks onto the calendar.
 */

import * as repo from "@/lib/data/repository";
import { isPersonalActivity, panicScore } from "@/lib/agent/planner";
import { isEventVisible } from "@/lib/data/pool-sync";
import type { CalendarEvent, Task } from "@/types/task";

/** Pick calendar category from task nature, complexity, and time pressure. */
export function inferEventKind(task: Task, now: Date = new Date()): CalendarEvent["kind"] {
  if (isPersonalActivity(task.title)) return "personal";

  const title = task.title.toLowerCase();
  if (/\b(meeting|call|sync|standup|interview|office hours|zoom|teams)\b/i.test(title)) {
    return "meeting";
  }
  if (/\b(class|lecture|lab|seminar|tutorial|exam|quiz)\b/i.test(title)) {
    return "class";
  }

  const hoursLeft = (new Date(task.deadline).getTime() - now.getTime()) / 3_600_000;
  const score = panicScore(task, now).score;
  const minutes = task.estimatedMinutes || 60;

  if (hoursLeft <= 3 && score >= 55) return "deadline";
  if (minutes >= 90 || (hoursLeft <= 48 && score >= 35)) return "focus";
  if (hoursLeft > 72 && score < 30 && minutes <= 90) return "personal";

  return hoursLeft <= 24 ? "focus" : "personal";
}

function eventTitle(task: Task, kind: CalendarEvent["kind"]): string {
  if (kind === "focus") return `Focus: ${task.title}`;
  if (kind === "deadline") return `${task.title} — due`;
  return task.title;
}

function eventWindow(
  task: Task,
  kind: CalendarEvent["kind"],
  now: Date
): { start: Date; end: Date } {
  if (task.scheduledStart && task.scheduledEnd) {
    return { start: new Date(task.scheduledStart), end: new Date(task.scheduledEnd) };
  }

  const due = new Date(task.deadline);
  const durMin = Math.min(Math.max(30, task.estimatedMinutes || 60), 120);

  if (kind === "deadline") {
    return { start: new Date(due.getTime() - 30 * 60_000), end: due };
  }

  if (kind === "focus") {
    const end = due;
    let start = new Date(end.getTime() - durMin * 60_000);
    if (start < now && end > now) start = now;
    if (end <= now) {
      start = now;
      return { start, end: new Date(start.getTime() + durMin * 60_000) };
    }
    return { start, end };
  }

  return { start: due, end: new Date(due.getTime() + durMin * 60_000) };
}

/** Create calendar events for active tasks that don't have a visible linked event. */
export async function ensureTaskCalendarEvents(
  uid: string,
  existingTasks?: Task[],
  existingEvents?: CalendarEvent[]
): Promise<number> {
  const now = new Date();
  const [tasks, events] = await Promise.all([
    existingTasks ? Promise.resolve(existingTasks) : repo.tasks.list(uid),
    existingEvents ? Promise.resolve(existingEvents) : repo.events.list(uid),
  ]);

  const activeTop = tasks.filter(
    (t) =>
      t.status !== "done" &&
      t.status !== "archived" &&
      !t.tags.includes("chunk")
  );

  let created = 0;
  for (const task of activeTop) {
    const hasVisible = events.some(
      (e) => e.linkedTaskId === task.id && isEventVisible(e, tasks)
    );
    if (hasVisible) continue;

    const kind = inferEventKind(task, now);
    const { start, end } = eventWindow(task, kind, now);

    await repo.events.add(uid, {
      userId: uid,
      source: "agent",
      sourceRef: "pool-calendar-sync",
      title: eventTitle(task, kind),
      start: start.toISOString(),
      end: end.toISOString(),
      kind,
      linkedTaskId: task.id,
    });
    created++;
  }

  return created;
}

/** Recompute kind/times for linked agent events when a task changes. */
export async function refreshLinkedEvent(
  uid: string,
  task: Task,
  events?: CalendarEvent[]
): Promise<void> {
  const allEvents = events ?? (await repo.events.list(uid));
  const linked = allEvents.filter((e) => e.linkedTaskId === task.id && e.source === "agent");
  if (linked.length === 0) return;

  const now = new Date();
  const kind = inferEventKind(task, now);
  const { start, end } = eventWindow(task, kind, now);

  await Promise.all(
    linked.map((e) =>
      repo.events.update(uid, e.id, {
        kind,
        title: eventTitle(task, kind),
        start: start.toISOString(),
        end: end.toISOString(),
      })
    )
  );
}
