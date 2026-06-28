"use client";

/**
 * Client-side tool executor — runs planned agent tool calls against the data
 * repository (Firestore in prod, mock REST in demo). Returns a ToolResult per
 * action so the synthesize step can narrate what happened.
 */

import * as repo from "@/lib/data/repository";
import { getGmailAccessToken } from "@/lib/google/oauth";
import { sendMessage } from "@/lib/google/gmail";
import {
  breakDownTaskAction,
  completeTaskAction,
  formatDayPlanSummary,
  planMyDayAction,
  prioritizeTasksAction,
  rescheduleTaskAction,
} from "@/lib/agent/actions";
import { pool } from "@/lib/data/pool";
import { inferEventKind } from "@/lib/data/calendar-sync";
import type { AgentAction, ToolResult } from "@/types/agent";
import type {
  Task,
  CalendarEvent,
  DraftDocument,
  Goal,
  GoalMilestone,
} from "@/types/task";

function riskLevelFor(score: number): Task["riskLevel"] {
  return score > 75 ? "critical" : score > 50 ? "warning" : score > 25 ? "watch" : "safe";
}

function logAction(
  uid: string,
  partial: { action: string; tool: string; reasoning?: string; relatedTaskId?: string }
) {
  // Best-effort audit log write (Firestore in prod; no-op in demo where the
  // legacy server flow already logs).
  const log = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId: uid,
    timestamp: new Date().toISOString(),
    action: partial.action,
    tool: partial.tool,
    reasoning: partial.reasoning ?? "",
    userNotified: true,
    relatedTaskId: partial.relatedTaskId,
  };
  repo.logs.add(uid, log).catch(() => {
    /* ignore */
  });
}

export interface ExecutedAction {
  action: AgentAction;
  result: ToolResult;
}

export async function executeActions(
  uid: string,
  actions: AgentAction[]
): Promise<ExecutedAction[]> {
  const out: ExecutedAction[] = [];
  for (const action of actions) {
    const result = await executeOne(uid, action);
    action.result = result;
    action.status = result.success ? "success" : "failed";
    if (!result.success) action.error = result.error;
    out.push({ action, result });
  }
  return out;
}

async function executeOne(uid: string, action: AgentAction): Promise<ToolResult> {
  const args = action.args;
  try {
    switch (action.tool) {
      case "createTask": {
        const ts = new Date().toISOString();
        const title = (args.title as string)?.trim() || "Untitled task";
        const deadline =
          (args.deadline as string) ||
          new Date(Date.now() + 2 * 86_400_000).toISOString();
        const task = await pool.tasks.create(uid, {
          id: `task_${Date.now()}`,
          userId: uid,
          title,
          description: args.description as string | undefined,
          deadline,
          priority: ((args.priority as number) ?? 3) as Task["priority"],
          status: "todo",
          estimatedMinutes: (args.estimatedMinutes as number) ?? 60,
          tags: (args.tags as string[]) ?? [],
          riskScore: 30,
          riskLevel: "safe",
          dependencies: [],
          attachments: [],
          reminders: [],
          source: "agent",
          createdAt: ts,
          updatedAt: ts,
        });
        logAction(uid, {
          action: `Created task "${task.title}"`,
          tool: "createTask",
          reasoning: "User mentioned a new commitment",
          relatedTaskId: task.id,
        });
        return { success: true, summary: `Created task "${task.title}"`, data: task };
      }

      case "blockFocusTime": {
        const start = args.start as string;
        const end = args.end as string;
        if (!start || !end || new Date(end) <= new Date(start)) {
          return {
            success: false,
            summary: "Invalid focus time (end must be after start)",
            error: "Invalid time range",
          };
        }
        // Conflict check: don't double-book over an existing event.
        const existing = await repo.events.list(uid);
        const sTs = new Date(start).getTime();
        const eTs = new Date(end).getTime();
        const conflict = existing.find((e) => {
          const es = new Date(e.start).getTime();
          const en = new Date(e.end).getTime();
          return es < eTs && en > sTs;
        });
        if (conflict) {
          return {
            success: false,
            summary: `That overlaps "${conflict.title}". Pick another time.`,
            error: "Time conflict",
          };
        }
        const linkedTaskId = args.linkedTaskId as string | undefined;
        let kind: CalendarEvent["kind"] = "focus";
        if (linkedTaskId) {
          const tasks = await repo.tasks.list(uid);
          const linked = tasks.find((t) => t.id === linkedTaskId);
          if (linked) kind = inferEventKind(linked);
        }
        const ev = await repo.events.add(uid, {
          id: `event_${Date.now()}`,
          userId: uid,
          source: "agent",
          title: (args.title as string) ?? "Focus block",
          start,
          end,
          kind,
          linkedTaskId,
        } as Omit<CalendarEvent, "id">);
        logAction(uid, {
          action: `Blocked focus block "${ev.title}"`,
          tool: "blockFocusTime",
          reasoning: "Reverse-engineered schedule from deadline",
          relatedTaskId: ev.linkedTaskId,
        });
        return { success: true, summary: `Blocked "${ev.title}"`, data: ev };
      }

      case "draftEmail": {
        const to = (args.to as string) ?? "";
        const subject = (args.subject as string) ?? "Draft";
        const body = (args.body as string) ?? "";

        // If Gmail is already connected (cached token, no popup), actually send
        // the email now. Otherwise save as a pending draft for review in Inbox.
        let token: string | null = null;
        if (typeof window !== "undefined") {
          try {
            const { getAuth } = await import("firebase/auth");
            const currentUser = getAuth().currentUser;
            token = getGmailAccessToken(currentUser);
          } catch {
            token = null;
          }
        }

        let status: DraftDocument["status"] = "pending";
        let sentAt: string | undefined;
        if (token && to) {
          try {
            await sendMessage({ accessToken: token, to, subject, body });
            status = "sent";
            sentAt = new Date().toISOString();
          } catch (err) {
            // Send failed (expired token, quota, etc.) - keep as pending draft.
            console.warn("[draftEmail] Gmail send failed, saved as draft:", err);
          }
        }

        const draft = await repo.drafts.add(uid, {
          id: `draft_${Date.now()}`,
          userId: uid,
          kind: "email",
          title: subject,
          subject,
          body,
          status,
          sentAt,
          generatedFor: (args.relatedTaskId as string) ?? "",
          generatedBy: "resq",
          createdAt: new Date().toISOString(),
          metadata: {
            context: args.context as string | undefined,
            tone: args.tone as string | undefined,
            to: to || undefined,
          },
        } as Omit<DraftDocument, "id">);
        logAction(uid, {
          action:
            status === "sent"
              ? `Sent email "${subject}" to ${to}`
              : `Drafted email "${subject}"`,
          tool: "draftEmail",
          reasoning: (args.context as string) ?? "Email needed for upcoming task",
        });
        return {
          success: true,
          summary:
            status === "sent"
              ? `Sent email "${subject}" to ${to}`
              : `Drafted email "${subject}" (review in Inbox to send)`,
          data: draft,
        };
      }

      case "createGoal": {
        const id = `goal_${Date.now()}`;
        const milestones: GoalMilestone[] = Array.isArray(args.milestones)
          ? (args.milestones as Array<{ title: string; targetDate?: string }>).map((m, i) => ({
              id: `${id}_m${i}`,
              title: m.title ?? `Milestone ${i + 1}`,
              targetDate: m.targetDate ?? (args.targetDate as string),
              completed: false,
            }))
          : [];
        const goal = await repo.goals.add(uid, {
          id,
          userId: uid,
          title: (args.title as string) ?? "Untitled goal",
          description: args.description as string | undefined,
          targetDate:
            (args.targetDate as string) ?? new Date(Date.now() + 14 * 86400000).toISOString(),
          linkedTasks: [],
          milestones,
          status: "active",
          createdAt: new Date().toISOString(),
        } as Omit<Goal, "id">);
        logAction(uid, {
          action: `Created goal "${goal.title}"`,
          tool: "createGoal",
          reasoning: "Long-term outcome defined",
        });
        return { success: true, summary: `Created goal "${goal.title}"`, data: goal };
      }

      case "escalateRisk": {
        const taskId = args.taskId as string;
        const tasks = await repo.tasks.list(uid);
        if (!tasks.some((t) => t.id === taskId)) {
          return { success: false, summary: "Task not found", error: "Task not found" };
        }
        await repo.tasks.update(uid, taskId, {
          riskScore: args.newRiskScore as number,
          riskLevel: riskLevelFor(args.newRiskScore as number),
        } as Partial<Task>);
        logAction(uid, {
          action: `Risk escalated to ${args.newRiskScore}: ${args.reason}`,
          tool: "escalateRisk",
          reasoning: (args.reason as string) ?? "",
          relatedTaskId: taskId,
        });
        return {
          success: true,
          summary: `Risk raised to ${args.newRiskScore}/100`,
          data: { taskId, newRisk: args.newRiskScore },
        };
      }

      case "rescheduleTask": {
        const taskId = args.taskId as string;
        const tasks = await repo.tasks.list(uid);
        if (!tasks.some((t) => t.id === taskId)) {
          return { success: false, summary: "Task not found", error: "Task not found" };
        }
        await rescheduleTaskAction(uid, taskId, args.newDeadline as string);
        return {
          success: true,
          summary: `Rescheduled task`,
          data: { taskId, newDeadline: args.newDeadline },
        };
      }

      case "updateTaskStatus": {
        const taskId = args.taskId as string;
        const newStatus = args.status as Task["status"];
        const tasks = await repo.tasks.list(uid);
        if (!tasks.some((t) => t.id === taskId)) {
          return { success: false, summary: "Task not found", error: "Task not found" };
        }
        if (newStatus === "done") {
          await completeTaskAction(uid, taskId, true);
        } else if (newStatus === "todo") {
          await completeTaskAction(uid, taskId, false);
        } else {
          await repo.tasks.update(uid, taskId, {
            status: newStatus,
            actualMinutes: args.actualMinutes as number | undefined,
          } as Partial<Task>);
        }
        return {
          success: true,
          summary: `Task status -> ${newStatus}`,
          data: { taskId, status: newStatus },
        };
      }

      case "fetchTasks": {
        const userTasks = await repo.tasks.list(uid);
        return {
          success: true,
          summary: `Found ${userTasks.length} tasks`,
          data: { tasks: userTasks, totalCount: userTasks.length },
        };
      }

      case "fetchCalendarEvents": {
        const [evs, userTasks] = await Promise.all([
          repo.events.list(uid),
          repo.tasks.list(uid),
        ]);
        const { filterVisibleEvents } = await import("@/lib/data/pool-sync");
        const visible = filterVisibleEvents(evs, userTasks);
        return {
          success: true,
          summary: `Found ${visible.length} calendar event${visible.length === 1 ? "" : "s"}`,
          data: { events: visible, totalCount: visible.length },
        };
      }

      case "createReminder":
        return {
          success: true,
          summary: `Set reminder`,
          data: { id: `reminder_${Date.now()}`, ...args, sent: false },
        };

      case "breakDownTask": {
        const res = await breakDownTaskAction(uid, args.taskId as string, {
          title: args.title as string | undefined,
          description: args.description as string | undefined,
          deadline: args.deadline as string | undefined,
        });
        logAction(uid, {
          action: res.summary,
          tool: "breakDownTask",
          reasoning: "Split a big task into scheduled chunks",
          relatedTaskId: args.taskId as string,
        });
        // Surface clarification / no-op as a non-success so the synthesizer
        // narrates the question instead of claiming it broke the task down.
        if (res.needsClarification) {
          return {
            success: false,
            summary: res.question ?? res.summary,
            error: res.question ?? res.summary,
            data: res,
          };
        }
        if (res.created === 0) {
          return { success: true, summary: res.summary, data: res };
        }
        return { success: true, summary: res.summary, data: res };
      }

      case "planMyDay": {
        const res = await planMyDayAction(uid, {
          days: (args.days as number) ?? 2,
          maxTasks: (args.maxTasks as number) ?? 4,
        });
        const formatted = formatDayPlanSummary(res);
        logAction(uid, {
          action: res.summary,
          tool: "planMyDay",
          reasoning: "Ranked tasks by urgency x importance and booked focus time",
        });
        return { success: true, summary: formatted, data: res };
      }

      case "prioritizeTasks": {
        const res = await prioritizeTasksAction(uid, args.taskIds as string[] | undefined);
        logAction(uid, {
          action: res.summary,
          tool: "prioritizeTasks",
          reasoning: "Re-scored tasks by urgency x importance",
        });
        return { success: true, summary: res.summary, data: res };
      }

      case "generateDeliverable":
        return {
          success: true,
          summary: `Generated ${args.type}: ${args.title}`,
          data: {
            id: `doc_${Date.now()}`,
            url: `https://docs.google.com/document/d/mock_${Date.now()}`,
            ...args,
          },
        };

      default:
        return {
          success: false,
          summary: `Unknown tool: ${action.tool}`,
          error: `Tool "${action.tool}" not implemented`,
        };
    }
  } catch (err) {
    return {
      success: false,
      summary: "Tool execution failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
