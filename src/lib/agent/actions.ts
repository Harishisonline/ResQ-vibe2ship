"use client";

/**
 * Shared, side-effecting planning actions.
 *
 * Both the AI agent (via the client tool executor) and the UI buttons on the
 * Tasks / Dashboard pages call these so there is one code path that writes to
 * the data repository. Each function returns a short human summary plus the
 * records it created, so callers can show a toast or feed the result back to
 * the model.
 */

import * as repo from "@/lib/data/repository";
import {
  panicScore,
  planBreakDown,
  buildDaySchedule,
  assignChunkSlots,
} from "@/lib/agent/planner";
import {
  chunkChildIds,
  removeEventsForTasks,
  syncRescheduleToCalendar,
  reconcilePool,
  pruneGoalLinks,
} from "@/lib/agent/task-sync";
import { inferEventKind, refreshLinkedEvent, ensureTaskCalendarEvents } from "@/lib/data/calendar-sync";
import { filterPlanSkipped, filterPlanLater } from "@/lib/agent/plan-filter";
import { pool } from "@/lib/data/pool";
import type { Task, CalendarEvent, RiskLevel } from "@/types/task";

async function workHoursFor(uid: string): Promise<{ start: string; end: string }> {
  const p = await repo.profile.get(uid).catch(() => null);
  return p?.workHours ?? { start: "09:00", end: "17:00" };
}

interface AiChunk {
  title: string;
  minutes: number;
}

async function aiBreakDown(input: {
  title: string;
  description?: string;
  estimatedMinutes?: number;
}): Promise<{ chunks?: AiChunk[]; needsClarification?: boolean; question?: string }> {
  try {
    const res = await fetch("/api/break-down", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`break-down ${res.status}`);
    return (await res.json()) as {
      chunks?: AiChunk[];
      needsClarification?: boolean;
      question?: string;
    };
  } catch {
    // Network/server failure: fall back to the deterministic planner.
    return { chunks: undefined };
  }
}

export interface BreakDownFallback {
  title?: string;
  description?: string;
  deadline?: string;
}

export interface BreakDownResult {
  summary: string;
  created: number;
  needsClarification?: boolean;
  question?: string;
  chunks: { id?: string; title: string; deadline: string; focusStart?: string; focusEnd?: string }[];
}

/**
 * Break a task into concrete chunks using the AI planner. If the task is too
 * vague, returns needsClarification so the caller can redirect the user to
 * chat to answer. Refuses to break down a task that is already a chunk (which
 * was causing nested "part 1/2 (part 1/2)" duplicates).
 *
 * If `taskId` doesn't resolve (e.g. the model referenced a task that isn't in
 * the repo) but a fallback title is provided, the parent task is created first
 * so the action still succeeds instead of failing with "Task not found".
 */
/** Find a top-level task by title that hasn't been broken down yet. */
function findUnbrokenParentByTitle(tasks: Task[], title?: string): Task | undefined {
  if (!title?.trim()) return undefined;
  const normalized = title.trim().toLowerCase();
  const candidates = tasks.filter(
    (t) =>
      !t.tags.includes("chunk") &&
      t.title.trim().toLowerCase() === normalized &&
      !tasks.some((c) => c.tags.includes("chunk") && c.dependencies.includes(t.id))
  );
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];
  // Multiple same-title tasks: prefer the one with a description, then newest.
  return candidates.sort(
    (a, b) =>
      (b.description ? 1 : 0) - (a.description ? 1 : 0) ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];
}

export async function breakDownTaskAction(
  uid: string,
  taskId: string,
  fallback?: BreakDownFallback
): Promise<BreakDownResult> {
  const [tasks, events] = await Promise.all([
    repo.tasks.list(uid),
    repo.events.list(uid),
  ]);
  let parent = tasks.find((t) => t.id === taskId);

  // If the id didn't resolve (stale AI reference, sync lag), match the existing
  // task by title instead of creating a duplicate parent.
  if (!parent) {
    parent = findUnbrokenParentByTitle(tasks, fallback?.title);
  }

  if (!parent && fallback?.title) {
    const ts = new Date().toISOString();
    const deadline =
      fallback.deadline ?? new Date(Date.now() + 2 * 86_400_000).toISOString();
    parent = await repo.tasks.add(uid, {
      userId: uid,
      title: fallback.title.trim(),
      description: fallback.description?.trim() || undefined,
      deadline,
      priority: 2,
      status: "todo",
      estimatedMinutes: 120,
      tags: [],
      riskScore: 30,
      riskLevel: "safe" as RiskLevel,
      dependencies: [],
      attachments: [],
      reminders: [],
      source: "agent",
      createdAt: ts,
      updatedAt: ts,
    });
  }

  if (!parent) throw new Error("Task not found");
  const task = parent;
  if (task.status === "done") throw new Error("That task is already done");
  if (task.tags.includes("chunk")) {
    throw new Error("That's already a small chunk. Break down the parent task instead.");
  }

  // Duplicate orphan: same title as another task that already has subtasks (happens
  // when the AI couldn't resolve the task id and created a second parent). Drop the
  // empty duplicate and treat the real parent as authoritative.
  const peerWithChunks = tasks.find(
    (t) =>
      t.id !== task.id &&
      !t.tags.includes("chunk") &&
      t.title.trim().toLowerCase() === task.title.trim().toLowerCase() &&
      tasks.some((c) => c.tags.includes("chunk") && c.dependencies.includes(t.id))
  );
  const taskHasChunks = tasks.some(
    (c) => c.tags.includes("chunk") && c.dependencies.includes(task.id)
  );
  if (peerWithChunks && !taskHasChunks) {
    await repo.tasks.remove(uid, task.id);
    const count = tasks.filter(
      (c) => c.tags.includes("chunk") && c.dependencies.includes(peerWithChunks.id)
    ).length;
    return {
      summary: `"${peerWithChunks.title}" is already broken into ${count} subtask${
        count === 1 ? "" : "s"
      }. Removed the duplicate entry.`,
      created: 0,
      chunks: [],
    };
  }

  // Refuse to break down a task that already has chunk subtasks, so repeated
  // clicks (or an AI retry) can't create duplicate subtasks.
  const existingChunks = tasks.filter(
    (t) => t.tags.includes("chunk") && t.dependencies.includes(task.id)
  );
  if (existingChunks.length > 0) {
    return {
      summary: `"${task.title}" is already broken into ${existingChunks.length} subtask${
        existingChunks.length === 1 ? "" : "s"
      }. Complete those first, or tell me to add more in chat.`,
      created: 0,
      chunks: [],
    };
  }

  // User clarification (from chat or agent) — persist on the parent BEFORE we
  // ask the chunking model, so we break down the existing task instead of
  // treating the text as a brand-new project.
  let working = task;
  if (fallback?.description?.trim()) {
    const desc = fallback.description.trim();
    if (desc !== (working.description ?? "").trim()) {
      await repo.tasks.update(uid, working.id, { description: desc });
      working = { ...working, description: desc };
    }
  }

  const ai = await aiBreakDown({
    title: working.title,
    description: working.description,
    estimatedMinutes: working.estimatedMinutes,
  });

  if (ai.needsClarification) {
    return {
      summary: "Needs clarification",
      created: 0,
      needsClarification: true,
      question: ai.question ?? `What does "${working.title}" actually involve?`,
      chunks: [],
    };
  }

  const workHours = await workHoursFor(uid);
  const now = new Date();
  const deadline = new Date(working.deadline);

  // Use AI chunk titles/minutes if we got them, otherwise fall back to planner.
  const plan = planBreakDown(working, events, workHours, now);
  const aiChunks: { title: string; minutes: number }[] =
    ai.chunks && ai.chunks.length > 0
      ? ai.chunks
      : plan.chunks.map((c) => ({ title: c.title, minutes: c.minutes }));

  const slots = assignChunkSlots({
    count: aiChunks.length,
    minutesEach: aiChunks.map((c) => c.minutes),
    before: deadline,
    from: now,
    events,
    planningHours: { start: "07:00", end: "23:00" },
  });

  const chunks: BreakDownResult["chunks"] = [];
  for (let i = 0; i < aiChunks.length; i++) {
    const c = aiChunks[i];
    const slot = slots[i];
    const fallbackEnd = new Date(
      Math.min(deadline.getTime(), now.getTime() + (i + 1) * 86_400_000)
    );
    const chunkDeadline = (slot?.end ?? fallbackEnd).toISOString();
    const ts = new Date().toISOString();
    const child = await repo.tasks.add(uid, {
      userId: uid,
      entityType: "subtask",
      parentId: working.id,
      title: c.title,
      description: `Part of "${working.title}".${working.description ? ` ${working.description}` : ""}`,
      deadline: chunkDeadline,
      priority: working.priority,
      status: "todo",
      estimatedMinutes: c.minutes,
      tags: Array.from(new Set([...(working.tags ?? []), "chunk"])),
      riskScore: 30,
      riskLevel: "safe" as RiskLevel,
      dependencies: [working.id],
      attachments: [],
      reminders: [],
      source: "agent",
      scheduledStart: slot?.start.toISOString(),
      scheduledEnd: slot?.end.toISOString(),
      createdAt: ts,
      updatedAt: ts,
    });
    if (slot) {
      chunks.push({
        id: child.id,
        title: c.title,
        deadline: chunkDeadline,
        focusStart: slot.start.toISOString(),
        focusEnd: slot.end.toISOString(),
      });
    } else {
      chunks.push({ id: child.id, title: c.title, deadline: chunkDeadline });
    }
  }

  await repo.tasks.update(uid, working.id, { status: "in_progress" });

  const withSlots = chunks.filter((c) => c.focusStart).length;
  return {
    summary: `Broke "${working.title}" into ${chunks.length} concrete steps${
      withSlots
        ? ` and scheduled ${withSlots} before your ${deadline.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} deadline.`
        : ". Open the task card to see the schedule."
    }`,
    created: chunks.length,
    chunks,
  };
}

export interface PlanMyDayResult {
  summary: string;
  blocked: number;
  items: {
    id: string;
    title: string;
    start: string;
    end: string;
    kind: string;
    parentTitle?: string;
    isSubtask?: boolean;
  }[];
  routines: { title: string; start: string; end: string }[];
  skipped: { id: string; title: string }[];
  later?: { id: string; title: string }[];
  /** Parent / project deadlines due today — shown prominently in plan summary. */
  deadlines?: { id: string; title: string; due: string }[];
}

/**
 * Build today's timeline: wellness routines + tasks at their stated deadline
 * times + flexible focus blocks in remaining free slots.
 */
export async function planMyDayAction(
  uid: string,
  opts: { days?: number; maxTasks?: number } = {}
): Promise<PlanMyDayResult> {
  await reconcilePool(uid);
  const [tasks, events] = await Promise.all([
    repo.tasks.list(uid),
    repo.events.list(uid),
  ]);
  const workHours = await workHoursFor(uid);
  const now = new Date();
  const schedule = buildDaySchedule(tasks, events, workHours, now, {
    maxFocus: opts.maxTasks ?? 12,
  });

  const items: PlanMyDayResult["items"] = [];
  const routines: PlanMyDayResult["routines"] = [];
  let blocked = 0;

  for (const block of schedule.blocks) {
    const start = block.start.toISOString();
    const end = block.end.toISOString();

    if (block.isRoutine) {
      // Routines live in the plan table only — not the calendar pool.
      routines.push({ title: block.title, start, end });
      continue;
    }

    if (block.isDeadlineMarker && block.taskId) {
      await repo.events.add(uid, {
        userId: uid,
        source: "agent",
        title: block.title,
        start,
        end,
        kind: "deadline",
        linkedTaskId: block.taskId,
      });
      items.push({
        id: block.taskId,
        title: block.title,
        start,
        end,
        kind: "deadline",
      });
      continue;
    }

    // Chunk subtasks: store schedule on the task, keep calendar clean
    if (block.hideFromCalendar || block.isChunk) {
      if (block.taskId && block.task) {
        await repo.tasks.update(uid, block.taskId, {
          status: "in_progress",
          scheduledStart: start,
          scheduledEnd: end,
          deadline: end,
        });
        items.push({
          id: block.taskId,
          title: block.task.title,
          start,
          end,
          kind: block.kind,
          parentTitle: block.parentTitle,
          isSubtask: true,
        });
        blocked++;
      }
      continue;
    }

    await repo.events.add(uid, {
      userId: uid,
      source: "agent",
      title: block.title,
      start,
      end,
      kind: block.task ? inferEventKind(block.task, now) : block.kind,
      linkedTaskId: block.taskId,
    });
    if (block.taskId && block.task) {
      await repo.tasks.update(uid, block.taskId, {
        status: "in_progress",
        scheduledStart: start,
        scheduledEnd: end,
      });
      items.push({
        id: block.taskId,
        title: block.task.title,
        start,
        end,
        kind: block.kind,
      });
      blocked++;
    }
  }

  const scheduledIds = new Set(items.map((i) => i.id));
  const scheduledTitles = new Set(items.map((i) => i.title.trim().toLowerCase()));
  const skippedToday = filterPlanSkipped(
    schedule.skipped,
    scheduledIds,
    scheduledTitles,
    tasks,
    now
  ).map((t) => ({ id: t.id, title: t.title }));
  const later = filterPlanLater(schedule.skipped, now).map((t) => ({
    id: t.id,
    title: t.title,
  }));

  const deadlines = schedule.deadlinesToday
    .sort((a, b) => a.deadline.getTime() - b.deadline.getTime())
    .map((d) => ({
      id: d.task.id,
      title: d.task.title,
      due: d.deadline.toISOString(),
    }));

  if (deadlines.length > 0) {
    const primary = schedule.deadlinesToday.sort(
      (a, b) => a.deadline.getTime() - b.deadline.getTime()
    )[0];
    const dueLabel = primary.deadline.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    await pool.context.save(uid, {
      currentProject: `${primary.task.title} — due ${dueLabel}`,
    }).catch(() => undefined);
  }

  const total = routines.length + blocked;
  return {
    summary: total
      ? `Planned your day with ${routines.length} routine block${routines.length === 1 ? "" : "s"} and ${blocked} task session${blocked === 1 ? "" : "s"}.`
      : skippedToday.length > 0
      ? "Couldn't fit everything due today — see details below."
      : "Nothing to plan right now. Your active tasks already have blocks, or you have no active tasks.",
    blocked,
    items,
    routines,
    skipped: skippedToday,
    later,
    deadlines,
  };
}

/**
 * Turn a planMyDay result into a readable, chat-friendly day timeline.
 */
export function formatDayPlanSummary(res: PlanMyDayResult): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  const deadlineBanner =
    res.deadlines && res.deadlines.length > 0
      ? res.deadlines
          .map(
            (d) =>
              `- **${d.title}** — finish by **${fmt(d.due)}**`
          )
          .join("\n")
      : "";

  const timeline = [
    ...res.routines.map((r) => ({
      start: r.start,
      end: r.end,
      label: r.title,
      tag: "routine" as const,
    })),
    ...res.items
      .filter((it) => it.kind !== "deadline")
      .map((it) => ({
        start: it.start,
        end: it.end,
        label: it.title,
        tag: it.kind,
        parentTitle: it.parentTitle,
        isSubtask: it.isSubtask,
      })),
  ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  if (timeline.length === 0) {
    const skippedNames = res.skipped.map((s) => s.title).join(", ");
    const dlNote = deadlineBanner ? `\n\n**Key deadlines today:**\n${deadlineBanner}` : "";
    return `**Your plan for today**${dlNote}\n\n${res.summary}${
      skippedNames ? `\n\nStill on your plate: ${skippedNames}.` : ""
    }\n\nAdd a task or clear some calendar time and I'll re-plan.`;
  }

  const rows = timeline.map((entry) => {
    const time = `${fmt(entry.start)} – ${fmt(entry.end)}`;
    const parentTitle = "parentTitle" in entry ? entry.parentTitle : undefined;
    const isSubtask = "isSubtask" in entry ? entry.isSubtask : false;
    const activity =
      isSubtask && parentTitle
        ? `${entry.label} *(part of ${parentTitle})*`
        : entry.label;
    return `| ${time} | ${activity} |`;
  });

  const table = ["| Time | Activity |", "| --- | --- |", ...rows].join("\n");

  const dlSection = deadlineBanner
    ? `\n\n**Key deadlines today:**\n${deadlineBanner}`
    : "";

  const skippedNote =
    res.skipped.length > 0
      ? `\n\n**Couldn't fit today:** ${res.skipped.map((s) => s.title).join(", ")}. Break these into subtasks or extend your day.`
      : "";

  const laterNote =
    res.later && res.later.length > 0
      ? `\n\n**Coming up later:** ${res.later.map((s) => s.title).join(", ")}.`
      : "";

  return `**Here's your plan for today.**${dlSection}\n\n${table}${skippedNote}${laterNote}\n\nStart with the next row on the list. Subtask times live inside the parent task on your Tasks page — the calendar stays uncluttered.`;
}

export interface PrioritizeResult {
  summary: string;
  updates: { id: string; title: string; score: number; level: RiskLevel }[];
}

/**
 * Re-score every active task by urgency x importance and persist the new risk
 * score/level so the Tasks page and sidebar reflect true priority.
 */
/**
 * Mark a task done (or reopen it) AND keep the calendar in sync: when a task is
 * completed, any upcoming AI focus blocks linked to it are removed so the
 * calendar stops showing sessions for finished work. Reopening leaves the
 * calendar untouched (the user can re-plan if they want).
 */
export async function completeTaskAction(
  uid: string,
  taskId: string,
  done: boolean
): Promise<void> {
  const tasks = await repo.tasks.list(uid);
  const childIds = chunkChildIds(tasks, taskId);

  await repo.tasks.update(uid, taskId, {
    status: done ? "done" : "todo",
    completedAt: done ? new Date().toISOString() : undefined,
    ...(done ? { scheduledStart: undefined, scheduledEnd: undefined } : {}),
  });

  if (done) {
    await Promise.all([
      ...childIds.map((cid) =>
        repo.tasks.update(uid, cid, {
          status: "done",
          completedAt: new Date().toISOString(),
          scheduledStart: undefined,
          scheduledEnd: undefined,
        })
      ),
      removeEventsForTasks(uid, [taskId, ...childIds], { upcomingOnly: true }),
    ]);
    await reconcilePool(uid);
  } else if (childIds.length > 0) {
    await Promise.all(
      childIds.map((cid) =>
        repo.tasks.update(uid, cid, {
          status: "todo",
          completedAt: undefined,
        })
      )
    );
  }
}

/**
 * Delete a task together with any focus blocks the AI scheduled for it, so the
 * calendar never keeps orphaned sessions. Also deletes chunk subtasks (and
 * their focus blocks) so deleting a parent doesn't leave orphaned chunks.
 */
export async function deleteTaskAction(uid: string, taskId: string): Promise<void> {
  const tasks = await repo.tasks.list(uid);
  const childIds = chunkChildIds(tasks, taskId);
  const allIds = [taskId, ...childIds];

  await Promise.all([
    removeEventsForTasks(uid, allIds),
    repo.tasks.remove(uid, taskId),
    ...childIds.map((cid) => repo.tasks.remove(uid, cid)),
  ]);
  await pruneGoalLinks(uid, new Set(allIds));
  await reconcilePool(uid);
}

/** Reschedule a task and keep linked calendar blocks in sync. */
export async function rescheduleTaskAction(
  uid: string,
  taskId: string,
  newDeadline: string
): Promise<void> {
  const tasks = await repo.tasks.list(uid);
  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw new Error("Task not found");
  const oldDeadline = task.deadline;
  await repo.tasks.update(uid, taskId, { deadline: newDeadline });
  await syncRescheduleToCalendar(uid, taskId, oldDeadline, newDeadline);
  const updated = { ...task, deadline: newDeadline };
  await refreshLinkedEvent(uid, updated);
}

export async function prioritizeTasksAction(
  uid: string,
  taskIds?: string[]
): Promise<PrioritizeResult> {
  const tasks = await repo.tasks.list(uid);
  const targets = taskIds && taskIds.length
    ? tasks.filter((t) => taskIds.includes(t.id))
    : tasks.filter((t) => t.status !== "done" && t.status !== "archived");

  const updates: PrioritizeResult["updates"] = [];
  for (const t of targets) {
    const p = panicScore(t);
    await repo.tasks.update(uid, t.id, { riskScore: p.score, riskLevel: p.level });
    updates.push({ id: t.id, title: t.title, score: p.score, level: p.level });
  }
  updates.sort((a, b) => b.score - a.score);

  const top = updates[0];
  return {
    summary: top
      ? `Re-ranked ${updates.length} task${updates.length === 1 ? "" : "s"} by urgency x importance. Top: "${top.title}" (${top.score}/100).`
      : "No active tasks to prioritize.",
    updates,
  };
}
