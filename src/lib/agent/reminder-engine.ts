/**
 * Proactive reminder engine — turns a live task list into "nudges": overdue,
 * due-soon, and high-risk tasks, each with a concrete message and a tiny
 * "how to finish this" guide. Used by the ReminderProvider to fire browser
 * notifications and power the reminders bell.
 *
 * Pure (no IO) so it can be unit-tested and run from any client component.
 */

import type { Task, CalendarEvent, RiskLevel } from "@/types/task";
import { panicScore, guideFor } from "@/lib/agent/planner";
import { isEventVisible } from "@/lib/data/pool-sync";

export type NudgeKind =
  | "overdue"
  | "due_soon"
  | "high_risk"
  | "starting_soon"
  | "ending_soon";

export interface Nudge {
  id: string;
  taskId: string;
  title: string;
  kind: NudgeKind;
  message: string;
  guide: string[];
  deadline: string;
  score: number;
  level: RiskLevel;
}

function hoursUntil(iso: string, now: Date): number {
  return (new Date(iso).getTime() - now.getTime()) / 3_600_000;
}

function nudgeMessage(task: Task, kind: NudgeKind, hours: number, score: number): string {
  if (kind === "overdue") {
    const late = Math.max(0, Math.round(-hours));
    return `"${task.title}" is overdue${late ? ` by ${late}h` : ""}. Restart it now, even 10 minutes counts. Open the doc and do the easiest 25 minutes.`;
  }
  if (kind === "due_soon") {
    const h = Math.max(0, Math.round(hours));
    if (h <= 1) {
      return `"${task.title}" is due within an hour. Final push: wrap up and submit now.`;
    }
    return `"${task.title}" is due in ${h}h. Start the first chunk now: 25 focused minutes, outline only.`;
  }
  return `"${task.title}" is trending toward a slip (risk ${score}/100). Block a focus session today before it gets worse.`;
}

/**
 * Compute the current set of task nudges, ranked by urgency. Returns at most
 * `limit` so the bell stays scannable.
 */
export function computeNudges(tasks: Task[], now: Date = new Date(), limit = 8): Nudge[] {
  // Chunk subtasks are part of a parent — nudging them separately duplicates the
  // parent's nudge. Only nudge top-level active tasks.
  const active = tasks.filter(
    (t) =>
      t.status !== "done" &&
      t.status !== "archived" &&
      !t.tags.includes("chunk")
  );
  const out: Nudge[] = [];

  for (const t of active) {
    const p = panicScore(t, now);
    const hours = hoursUntil(t.deadline, now);

    let kind: NudgeKind | null = null;
    if (hours < 0) kind = "overdue";
    else if (hours <= 24) kind = "due_soon";
    else if (p.score > 60) kind = "high_risk";

    if (!kind) continue;

    out.push({
      id: `nudge_${t.id}`,
      taskId: t.id,
      title: t.title,
      kind,
      message: nudgeMessage(t, kind, hours, p.score),
      guide: guideFor(t),
      deadline: t.deadline,
      score: p.score,
      level: p.level,
    });
  }

  out.sort((a, b) => {
    if (a.kind === "overdue" && b.kind !== "overdue") return -1;
    if (b.kind === "overdue" && a.kind !== "overdue") return 1;
    return b.score - a.score;
  });

  return out.slice(0, limit);
}

/**
 * Compute nudges for calendar events: a focus/deadline block that's about to
 * start (within `startWithinMin`) or about to end (within `endWithinMin`).
 * These power the "your focus session starts in 5 minutes" notifications.
 */
export function computeEventNudges(
  events: CalendarEvent[],
  now: Date = new Date(),
  startWithinMin = 15,
  endWithinMin = 15,
  tasks?: Task[]
): Nudge[] {
  const out: Nudge[] = [];
  for (const e of events) {
    if (!isEventVisible(e, tasks ?? [])) continue;
    const s = new Date(e.start);
    const en = new Date(e.end);
    const minsToStart = (s.getTime() - now.getTime()) / 60_000;
    const minsToEnd = (en.getTime() - now.getTime()) / 60_000;

    if (minsToStart >= 0 && minsToStart <= startWithinMin) {
      const m = Math.max(1, Math.round(minsToStart));
      out.push({
        id: `evstart_${e.id}`,
        taskId: e.linkedTaskId ?? e.id,
        title: e.title,
        kind: "starting_soon",
        message:
          m <= 1
            ? `"${e.title}" starts now. Close distractions and begin.`
            : `"${e.title}" starts in ${m} minutes. Get ready to focus.`,
        guide: ["Open the work, silence notifications, start a 25-minute sprint."],
        deadline: e.start,
        score: 70,
        level: "warning",
      });
    } else if (minsToStart < 0 && minsToEnd > 0 && minsToEnd <= endWithinMin) {
      const m = Math.max(1, Math.round(minsToEnd));
      out.push({
        id: `evend_${e.id}`,
        taskId: e.linkedTaskId ?? e.id,
        title: e.title,
        kind: "ending_soon",
        message: `"${e.title}" ends in ${m} minutes. Note where you stopped so the next session is easy to resume.`,
        guide: ["Jot a 1-line note on what's next, then wrap up cleanly."],
        deadline: e.end,
        score: 55,
        level: "watch",
      });
    }
  }
  return out;
}

export const NUDGE_KIND_LABEL: Record<NudgeKind, string> = {
  overdue: "Overdue",
  due_soon: "Due soon",
  high_risk: "At risk",
  starting_soon: "Starting soon",
  ending_soon: "Ending soon",
};
