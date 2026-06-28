/**
 * ResQ Agent Orchestrator
 *
 * The main agent loop:
 *   1. Build context (user, tasks, calendar, history)
 *   2. Call MiniMax with system prompt + tools + context
 *   3. Execute any tool calls (writes to Firestore, calls Gmail API, etc.)
 *   4. Optionally call MiniMax again to synthesize a final response
 *   5. Return { text, actions } for the UI
 *
 * Designed to be called from:
 *   - /api/agent (chat endpoint, streams via SSE)
 *   - /api/panic-engine (proactive, scheduled)
 *   - Voice interface (low-latency variant)
 */

import { chatComplete, isMiniMaxConfigured, type MiniMaxMessage } from "../minimax/client";
import { RESQ_SYSTEM_PROMPT, buildContextPreamble } from "../minimax/prompts";
import { RESQ_TOOLS } from "../minimax/tools";
import { sanitizeReply } from "../minimax/sanitize";
import type { AgentAction, ToolResult, AgentContext } from "@/types/agent";
import { encodeEmail } from "../google/gmail";
import { store } from "../store/mock-store";
import {
  panicScore,
  planBreakDown,
  planDay,
} from "../agent/planner";
import type { Task, DraftDocument, CalendarEvent, AgentLog, RiskLevel } from "@/types/task";

export interface OrchestratorInput {
  userId: string;
  userMessage: string;
  history: { role: "user" | "assistant" | "function"; content: string }[];
  context: AgentContext;
  /** Google OAuth access token for Gmail lookup (resolved by the API route). */
  googleAccessToken?: string | null;
  /** If true, run tool calls (writes to DB). If false, only plan. */
  executeTools?: boolean;
  /** If true, don't synthesize a final response — just return tool calls. */
  toolsOnly?: boolean;
}

export interface OrchestratorResult {
  text: string;
  actions: AgentAction[];
  error?: string;
}

/**
 * Build the system instruction with embedded context.
 */
function buildSystemInstruction(ctx: AgentContext): string {
  return `${RESQ_SYSTEM_PROMPT}\n\n${buildContextPreamble({
    userName: ctx.user.name,
    energyPattern: ctx.user.energyPattern,
    workHours: ctx.user.workHours,
    tasks: ctx.tasks,
    calendar: ctx.calendar,
    recentActivity: ctx.recentActivity,
    taskList: ctx.taskList,
    eventList: ctx.eventList,
    goalList: ctx.goalList,
    habitList: ctx.habitList,
    draftList: ctx.draftList,
  })}`;
}

/**
 * Execute a tool call. Dispatches to the right service (Firestore / Gmail /
 * Calendar) depending on what's configured. Falls back to a working mock
 * implementation so the demo UI is fully functional offline.
 */
async function executeTool(
  input: OrchestratorInput,
  toolName: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const userId = input.userId;
  const ts = new Date().toISOString();

  switch (toolName) {
    case "createTask": {
      const id = `task_${Date.now()}`;
      const task: Task = {
        id,
        userId,
        title: (args.title as string) ?? "Untitled task",
        description: args.description as string | undefined,
        deadline: args.deadline as string,
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
      };
      store.saveTask(task);
      logAgentAction(userId, {
        action: `Created task "${task.title}"`,
        tool: "createTask",
        reasoning: "User mentioned a new commitment",
        relatedTaskId: id,
      });
      return {
        success: true,
        summary: `Created task "${task.title}", due ${formatDate(task.deadline)}`,
        data: task,
      };
    }

    case "draftEmail": {
      const draftId = `draft_${Date.now()}`;
      const draft: DraftDocument = {
        id: draftId,
        userId,
        kind: "email",
        title: (args.subject as string) ?? "Draft",
        subject: args.subject as string,
        body: (args.body as string) ?? "",
        status: "pending",
        generatedFor: (args.relatedTaskId as string) ?? "",
        generatedBy: "resq",
        createdAt: ts,
        metadata: { context: args.context, tone: args.tone, to: args.to },
      };

      // Try real Gmail API first if we have an access token.
      const accessToken =
        input.googleAccessToken ||
        process.env.GMAIL_ACCESS_TOKEN || // server-side env var fallback for demos
        (typeof window !== "undefined"
          ? (window as { __resqGoogleToken?: string }).__resqGoogleToken
          : null);

      if (accessToken) {
        try {
          const raw = encodeEmail({
            to: (args.to as string) ?? "",
            subject: (args.subject as string) ?? "",
            body: (args.body as string) ?? "",
          });
          const res = await fetch(
            "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ message: { raw } }),
            }
          );
          if (!res.ok) throw new Error(`Gmail API ${res.status}: ${await res.text()}`);
          const data = (await res.json()) as {
            id: string;
            message: { id: string; threadId: string };
          };
          draft.metadata = { ...draft.metadata, gmailId: data.id, threadId: data.message.threadId };
        } catch (err) {
          console.warn("[orchestrator] Gmail draft failed, using local mock:", err);
        }
      }

      store.saveDraft(draft);
      logAgentAction(userId, {
        action: `Drafted email "${draft.subject}"`,
        tool: "draftEmail",
        reasoning: (args.context as string) ?? "Email needed for upcoming task",
        relatedTaskId: draft.generatedFor || undefined,
      });
      return {
        success: true,
        summary: `Drafted email "${draft.subject}". Review and send from Inbox`,
        data: draft,
      };
    }

    case "blockFocusTime": {
      const id = `event_${Date.now()}`;
      const event: CalendarEvent = {
        id,
        userId,
        source: "agent",
        title: (args.title as string) ?? "Focus block",
        start: args.start as string,
        end: args.end as string,
        kind: "focus",
        linkedTaskId: args.linkedTaskId as string | undefined,
      };
      store.saveEvent(event);
      logAgentAction(userId, {
        action: `Blocked focus block "${event.title}"`,
        tool: "blockFocusTime",
        reasoning: "Reverse-engineered schedule from deadline",
        relatedTaskId: event.linkedTaskId,
      });
      return {
        success: true,
        summary: `Blocked "${event.title}" ${formatDateTime(event.start)}`,
        data: event,
      };
    }

    case "escalateRisk": {
      const taskId = args.taskId as string;
      const existing = store.getTask(taskId);
      if (existing) {
        store.updateTask(taskId, {
          riskScore: args.newRiskScore as number,
          riskLevel:
            (args.newRiskScore as number) > 75
              ? "critical"
              : (args.newRiskScore as number) > 50
              ? "warning"
              : (args.newRiskScore as number) > 25
              ? "watch"
              : "safe",
        });
      }
      logAgentAction(userId, {
        action: `Risk escalated to ${args.newRiskScore}: ${args.reason}`,
        tool: "escalateRisk",
        reasoning: (args.reason as string) ?? "",
        relatedTaskId: taskId,
      });
      return {
        success: true,
        summary: `Risk raised to ${args.newRiskScore}/100: ${args.reason}`,
        data: { taskId, newRisk: args.newRiskScore },
      };
    }

    case "generateDeliverable": {
      const url = `https://docs.google.com/document/d/mock_${Date.now()}`;
      logAgentAction(userId, {
        action: `Generated ${args.type}: ${args.title}`,
        tool: "generateDeliverable",
        reasoning: "Created starter deliverable from template",
        relatedTaskId: args.relatedTaskId as string | undefined,
      });
      return {
        success: true,
        summary: `Generated ${args.type}: ${args.title}`,
        data: { id: `doc_${Date.now()}`, url, type: args.type, ...args },
      };
    }

    case "createReminder":
      logAgentAction(userId, {
        action: `Set reminder for ${formatDateTime(args.triggerAt as string)}`,
        tool: "createReminder",
        reasoning: `Strategy: ${args.strategy}`,
        relatedTaskId: args.taskId as string | undefined,
      });
      return {
        success: true,
        summary: `Set adaptive reminder for ${formatDateTime(args.triggerAt as string)}`,
        data: { id: `reminder_${Date.now()}`, ...args, sent: false },
      };

    case "fetchCalendarEvents":
      return {
        success: true,
        summary: "Found 4 events in range, 3 confirmed, 1 tentative",
        data: {
          events: [
            { start: "2026-06-24T09:00:00Z", end: "2026-06-24T10:30:00Z", title: "Standup" },
            { start: "2026-06-24T14:00:00Z", end: "2026-06-24T16:00:00Z", title: "Class" },
            { start: "2026-06-25T11:00:00Z", end: "2026-06-25T12:00:00Z", title: "Team sync" },
          ],
          busyHours: 5,
          freeHours: 3,
        },
      };

    case "fetchTasks": {
      const userTasks = store.listTasks({ userId });
      return {
        success: true,
        summary: `Found ${userTasks.length} active tasks`,
        data: { tasks: userTasks, totalCount: userTasks.length },
      };
    }

    case "createGoal": {
      const id = `goal_${Date.now()}`;
      const milestones = Array.isArray(args.milestones)
        ? (args.milestones as Array<{ title: string; targetDate?: string }>).map((m, i) => ({
            id: `${id}_m${i}`,
            title: (m.title as string) ?? `Milestone ${i + 1}`,
            targetDate: (m.targetDate as string) ?? (args.targetDate as string),
            completed: false,
          }))
        : [];
      store.saveGoal({
        id,
        userId,
        title: (args.title as string) ?? "Untitled goal",
        description: args.description as string | undefined,
        targetDate: (args.targetDate as string) ?? new Date(Date.now() + 14 * 86400000).toISOString(),
        linkedTasks: [],
        milestones,
        status: "active",
        createdAt: ts,
      });
      logAgentAction(userId, {
        action: `Created goal "${args.title}"`,
        tool: "createGoal",
        reasoning: "Long-term outcome defined",
      });
      return {
        success: true,
        summary: `Created goal "${args.title}"`,
        data: { id, ...args, status: "active" },
      };
    }

    case "rescheduleTask": {
      const updated = store.updateTask(args.taskId as string, {
        deadline: args.newDeadline as string,
      });
      return {
        success: !!updated,
        summary: updated
          ? `Rescheduled task to ${formatDate(args.newDeadline as string)}`
          : "Task not found",
        data: { taskId: args.taskId, newDeadline: args.newDeadline },
      };
    }

    case "updateTaskStatus": {
      const updated = store.updateTask(args.taskId as string, {
        status: args.status as Task["status"],
        actualMinutes: args.actualMinutes as number | undefined,
      });
      return {
        success: !!updated,
        summary: `Task status → ${args.status}`,
        data: { taskId: args.taskId, status: args.status },
      };
    }

    case "breakDownTask": {
      let parent = store.getTask(args.taskId as string);
      if (!parent && args.title) {
        const cid = `task_${Date.now()}`;
        parent = {
          id: cid,
          userId,
          title: (args.title as string).trim(),
          description: args.description as string | undefined,
          deadline: (args.deadline as string) ?? new Date(Date.now() + 2 * 86400000).toISOString(),
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
        };
        store.saveTask(parent);
      }
      if (!parent) {
        return { success: false, summary: "Task not found", error: "Task not found" };
      }
      const events = store.listEvents({ userId });
      const plan = planBreakDown(parent, events, { start: "09:00", end: "17:00" });
      let created = 0;
      for (const c of plan.chunks) {
        const cid = `task_${Date.now()}_${created}`;
        store.saveTask({
          id: cid,
          userId,
          title: c.title,
          description: `Part of "${parent.title}".`,
          deadline: c.deadline,
          priority: parent.priority,
          status: "todo",
          estimatedMinutes: c.minutes,
          tags: Array.from(new Set([...(parent.tags ?? []), "chunk"])),
          riskScore: 30,
          riskLevel: "safe" as RiskLevel,
          dependencies: [parent.id],
          attachments: [],
          reminders: [],
          source: "agent",
          createdAt: ts,
          updatedAt: ts,
        });
        if (c.focusStart && c.focusEnd) {
          store.saveEvent({
            id: `event_${Date.now()}_${created}`,
            userId,
            source: "agent",
            title: `Focus: ${c.title}`,
            start: c.focusStart,
            end: c.focusEnd,
            kind: "focus",
            linkedTaskId: cid,
          });
        }
        created++;
      }
      store.updateTask(parent.id, { status: "in_progress" });
      logAgentAction(userId, {
        action: `Broke "${parent.title}" into ${created} chunks`,
        tool: "breakDownTask",
        reasoning: "Split a big task into scheduled chunks",
        relatedTaskId: parent.id,
      });
      return {
        success: true,
        summary: `Broke "${parent.title}" into ${created} chunks and blocked focus time for each.`,
        data: { created, parentId: parent.id },
      };
    }

    case "planMyDay": {
      const allTasks = store.listTasks({ userId });
      const events = store.listEvents({ userId });
      const plan = planDay(allTasks, events, { start: "09:00", end: "17:00" }, new Date(), 2);
      const max = (args.maxTasks as number) ?? 4;
      let blocked = 0;
      const items: { title: string; start: string }[] = [];
      for (const item of plan) {
        if (!item.slot || blocked >= max) continue;
        const eid = `event_${Date.now()}_${blocked}`;
        store.saveEvent({
          id: eid,
          userId,
          source: "agent",
          title: `Focus: ${item.task.title}`,
          start: item.slot.start.toISOString(),
          end: item.slot.end.toISOString(),
          kind: "focus",
          linkedTaskId: item.task.id,
        });
        store.updateTask(item.task.id, { status: "in_progress" });
        items.push({ title: item.task.title, start: item.slot.start.toISOString() });
        blocked++;
      }
      logAgentAction(userId, {
        action: `Planned the day: ${blocked} focus session${blocked === 1 ? "" : "s"} blocked`,
        tool: "planMyDay",
        reasoning: "Ranked by urgency x importance",
      });
      return {
        success: true,
        summary: blocked
          ? `Blocked ${blocked} focus session${blocked === 1 ? "" : "s"} for your top task${blocked === 1 ? "" : "s"}.`
          : "No free slots found in your work hours.",
        data: { blocked, items },
      };
    }

    case "prioritizeTasks": {
      const allTasks = store.listTasks({ userId });
      const targets = (args.taskIds as string[] | undefined)?.length
        ? allTasks.filter((t) => (args.taskIds as string[]).includes(t.id))
        : allTasks.filter((t) => t.status !== "done" && t.status !== "archived");
      const updates: { id: string; title: string; score: number; level: RiskLevel }[] = [];
      for (const t of targets) {
        const p = panicScore(t);
        store.updateTask(t.id, { riskScore: p.score, riskLevel: p.level });
        updates.push({ id: t.id, title: t.title, score: p.score, level: p.level });
      }
      updates.sort((a, b) => b.score - a.score);
      const top = updates[0];
      logAgentAction(userId, {
        action: top
          ? `Re-ranked ${updates.length} tasks. Top: "${top.title}" (${top.score}/100)`
          : "No active tasks to prioritize",
        tool: "prioritizeTasks",
        reasoning: "Re-scored by urgency x importance",
      });
      return {
        success: true,
        summary: top
          ? `Re-ranked ${updates.length} task${updates.length === 1 ? "" : "s"}. Top: "${top.title}" (${top.score}/100).`
          : "No active tasks to prioritize.",
        data: { updates },
      };
    }

    default:
      return {
        success: false,
        summary: `Unknown tool: ${toolName}`,
        error: `Tool "${toolName}" not implemented`,
      };
  }
}

/**
 * Helper: write an entry to the agent audit log.
 */
function logAgentAction(
  userId: string,
  partial: Pick<AgentLog, "action" | "tool" | "reasoning" | "relatedTaskId">
): AgentLog {
  const log: AgentLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId,
    timestamp: new Date().toISOString(),
    action: partial.action,
    tool: partial.tool,
    reasoning: partial.reasoning,
    userNotified: true,
    relatedTaskId: partial.relatedTaskId,
  };
  store.saveAgentLog(log);
  return log;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
    if (diff === 0) return "today";
    if (diff === 1) return "tomorrow";
    if (diff < 0) return `${Math.abs(diff)} days ago`;
    if (diff < 7) return `in ${diff} days`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Run the agent loop.
 *
 * For a single-turn interaction, this:
 * 1. Calls MiniMax with tools enabled
 * 2. If MiniMax returns tool_calls, executes them
 * 3. Calls MiniMax again with tool results to get a final response
 * 4. Returns { text, actions }
 */
export async function runAgent(input: OrchestratorInput): Promise<OrchestratorResult> {
  if (!isMiniMaxConfigured) {
    return mockAgentResponse(input);
  }

  const { userMessage, history, context, executeTools = true, toolsOnly = false } = input;

  const systemInstruction = buildSystemInstruction(context);

  const historyMessages: MiniMaxMessage[] = history.map((h) => ({
    role: h.role === "assistant" ? "assistant" : "user",
    content: h.content,
  }));

  const baseMessages: MiniMaxMessage[] = [
    { role: "system", content: systemInstruction },
    ...historyMessages,
    { role: "user", content: userMessage },
  ];

  // First pass: MiniMax decides what to do (may emit tool_calls)
  const firstResponse = await chatComplete({
    messages: baseMessages,
    tools: RESQ_TOOLS,
    temperature: 0.7,
    max_tokens: 2048,
  });

  const choice = firstResponse.choices[0];
  const message = choice?.message;

  const functionCalls = message?.tool_calls ?? [];
  const firstText = message?.content ?? "";

  // If no tool calls, just return the text response
  if (functionCalls.length === 0) {
    const clean = sanitizeReply(firstText);
    return { text: clean || "I'm here to help. What's on your mind?", actions: [] };
  }

  // Execute tool calls
  const actions: AgentAction[] = [];
  const toolResults: { call: (typeof functionCalls)[number]; result: ToolResult }[] = [];

  for (const call of functionCalls) {
    let parsedArgs: Record<string, unknown> = {};
    try {
      parsedArgs = call.function.arguments ? JSON.parse(call.function.arguments) : {};
    } catch {
      parsedArgs = {};
    }

    const action: AgentAction = {
      tool: call.function.name ?? "unknown",
      args: parsedArgs,
      status: "running",
    };
    actions.push(action);

    if (executeTools) {
      try {
        const result = await executeTool(input, call.function.name ?? "", action.args);
        action.result = result;
        action.status = result.success ? "success" : "failed";
        if (!result.success) action.error = result.error;
        toolResults.push({ call, result });
      } catch (err) {
        action.status = "failed";
        action.error = err instanceof Error ? err.message : String(err);
        toolResults.push({
          call,
          result: { success: false, summary: "Tool execution failed", error: action.error },
        });
      }
    } else {
      action.status = "success";
      action.result = { success: true, summary: "[Plan mode, not executed]" };
      toolResults.push({ call, result: action.result });
    }
  }

  if (toolsOnly) {
    return {
      text: sanitizeReply(firstText),
      actions,
    };
  }

  // Second pass: MiniMax synthesizes a final response with tool results.
  // The assistant message with tool_calls must be echoed back verbatim, then
  // each tool result follows as a `tool` role message keyed by tool_call_id.
  const toolResultMessages: MiniMaxMessage[] = toolResults.map((tr) => ({
    role: "tool",
    tool_call_id: tr.call.id,
    name: tr.call.function.name,
    content: JSON.stringify(tr.result),
  }));

  const finalMessages: MiniMaxMessage[] = [
    ...baseMessages,
    {
      role: "assistant",
      content: message?.content ?? "",
      tool_calls: message?.tool_calls,
    },
    ...toolResultMessages,
  ];

  const finalResponse = await chatComplete({
    messages: finalMessages,
    temperature: 0.7,
    max_tokens: 1024,
  });

  const finalText = sanitizeReply(finalResponse.choices[0]?.message?.content ?? firstText);
  const fallback = "Done. Anything else you'd like me to take care of?";
  return { text: finalText || fallback, actions };
}

// ----- Plan / synthesize split (Phase 2) -----
//
// planAgent: ask the model what to do and return the planned tool calls WITHOUT
// executing them. The client executes them against the data repository, then
// calls synthesizeAgent to stream the final reply from the tool results.

export interface PlanResult {
  isMock: boolean;
  text: string;
  actions: AgentAction[];
  assistantMessage: MiniMaxMessage | null;
}

export async function planAgent(input: OrchestratorInput): Promise<PlanResult> {
  if (!isMiniMaxConfigured) {
    const mock = mockAgentResponse(input);
    return {
      isMock: true,
      text: mock.text,
      actions: mock.actions,
      assistantMessage: null,
    };
  }

  const { userMessage, history, context } = input;
  const systemInstruction = buildSystemInstruction(context);
  const historyMessages: MiniMaxMessage[] = history.map((h) => ({
    role: h.role === "assistant" ? "assistant" : "user",
    content: h.content,
  }));
  const baseMessages: MiniMaxMessage[] = [
    { role: "system", content: systemInstruction },
    ...historyMessages,
    { role: "user", content: userMessage },
  ];

  const firstResponse = await chatComplete({
    messages: baseMessages,
    tools: RESQ_TOOLS,
    temperature: 0.7,
    max_tokens: 2048,
  });

  const message = firstResponse.choices[0]?.message;
  const functionCalls = message?.tool_calls ?? [];
  const firstText = sanitizeReply(message?.content ?? "");

  const actions: AgentAction[] = functionCalls.map((call) => {
    let parsedArgs: Record<string, unknown> = {};
    try {
      parsedArgs = call.function.arguments ? JSON.parse(call.function.arguments) : {};
    } catch {
      parsedArgs = {};
    }
    return {
      tool: call.function.name ?? "unknown",
      args: parsedArgs,
      status: "pending",
      callId: call.id,
    };
  });

  return {
    isMock: false,
    text: firstText,
    actions,
    assistantMessage: message
      ? { role: "assistant", content: message.content ?? "", tool_calls: message.tool_calls }
      : null,
  };
}

export interface SynthesizeInput {
  userId: string;
  userName: string;
  userMessage: string;
  history: { role: "user" | "assistant" | "function"; content: string }[];
  context: AgentContext;
  assistantMessage: MiniMaxMessage;
  toolResults: { callId: string; name: string; result: ToolResult }[];
}

export async function synthesizeAgent(input: SynthesizeInput): Promise<string> {
  if (!isMiniMaxConfigured) {
    // Mock mode never reaches here (plan isMock short-circuits in the client).
    return "Done. Anything else?";
  }

  const systemInstruction = buildSystemInstruction(input.context);
  const historyMessages: MiniMaxMessage[] = input.history.map((h) => ({
    role: h.role === "assistant" ? "assistant" : "user",
    content: h.content,
  }));
  const baseMessages: MiniMaxMessage[] = [
    { role: "system", content: systemInstruction },
    ...historyMessages,
    { role: "user", content: input.userMessage },
  ];

  const toolResultMessages: MiniMaxMessage[] = input.toolResults.map((tr) => ({
    role: "tool",
    tool_call_id: tr.callId,
    name: tr.name,
    content: JSON.stringify(tr.result),
  }));

  const finalMessages: MiniMaxMessage[] = [
    ...baseMessages,
    input.assistantMessage,
    ...toolResultMessages,
  ];

  const finalResponse = await chatComplete({
    messages: finalMessages,
    temperature: 0.7,
    max_tokens: 1024,
  });

  const finalText = sanitizeReply(
    finalResponse.choices[0]?.message?.content ?? "Done. Anything else?"
  );
  return finalText || "Done. Anything else you'd like me to take care of?";
}

export { mockAgentResponse };

/**
 * Mock agent response for when MiniMax is not configured.
 * Provides realistic tool calls so the demo UI is fully functional without API key.
 */
function mockAgentResponse(input: OrchestratorInput): OrchestratorResult {
  const msg = input.userMessage.toLowerCase();
  const actions: AgentAction[] = [];

  // Simple keyword-driven mock
  if (msg.includes("project") || msg.includes("deadline") || msg.includes("due") || msg.includes("assignment")) {
    const now = Date.now();
    const deadline = new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString();

    actions.push({
      tool: "createTask",
      args: {
        title: input.userMessage.replace(/^(i have|i've got|add|create|i need to)\s+/i, "").slice(0, 80),
        deadline,
        priority: 2,
        estimatedMinutes: 360,
        tags: ["work"],
      },
      result: {
        success: true,
        summary: 'Created task with deadline',
        data: { id: `task_${now}`, status: "todo", riskScore: 35 },
      },
      status: "success",
    });

    actions.push({
      tool: "blockFocusTime",
      args: {
        title: "Focus block for new task",
        start: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
        end: new Date(now + 24 * 60 * 60 * 1000 + 90 * 60 * 1000).toISOString(),
      },
      result: {
        success: true,
        summary: "Blocked 90-minute focus session tomorrow",
        data: { id: `event_${now}` },
      },
      status: "success",
    });

    actions.push({
      tool: "generateDeliverable",
      args: {
        type: "project_proposal",
        title: "Project outline",
        context: { task: input.userMessage },
      },
      result: {
        success: true,
        summary: "Generated project outline",
        data: { url: "https://docs.google.com/document/d/mock" },
      },
      status: "success",
    });

    return {
      text:
        "I've broken this down for you: created the task with a 6-hour estimate, blocked three 90-minute focus sessions over the next two days during your peak hours, and generated a starter outline in your Drive. First session is tomorrow at 9am. Review the plan and we can adjust.",
      actions,
    };
  }

  if (msg.includes("email") || msg.includes("message") || msg.includes("reply") || msg.includes("draft")) {
    actions.push({
      tool: "draftEmail",
      args: {
        to: "professor@university.edu",
        subject: "Quick update on project status",
        body: "Hi Professor,\n\nI wanted to give you a quick update on the project...",
        context: "Following up on the project",
        tone: "formal",
      },
      result: {
        success: true,
        summary: "Drafted email (awaiting your review in Inbox)",
        data: { id: `draft_${Date.now()}` },
      },
      status: "success",
    });

    return {
      text:
        "Drafted a formal follow-up email and saved it to your Inbox for review. Take a look, edit if needed, then send when you're ready.",
      actions,
    };
  }

  if (msg.includes("schedule") || msg.includes("calendar") || msg.includes("meeting") || msg.includes("block") || msg.includes("focus")) {
    actions.push({
      tool: "blockFocusTime",
      args: {
        title: "Focus block",
        start: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        end: new Date(Date.now() + 3.5 * 60 * 60 * 1000).toISOString(),
      },
      result: {
        success: true,
        summary: "Blocked 90-minute focus session",
        data: { id: `event_${Date.now()}` },
      },
      status: "success",
    });

    return {
      text: "Blocked a 90-minute focus session 2 hours from now. You can adjust or add more in your Calendar.",
      actions,
    };
  }

  if (msg.includes("risk") || msg.includes("at risk") || msg.includes("blow up") || msg.includes("overdue")) {
    actions.push({
      tool: "fetchTasks",
      args: { status: "active", minRiskScore: 40 },
      result: {
        success: true,
        summary: "Found 3 high-risk tasks",
        data: { tasks: [], totalCount: 3 },
      },
      status: "success",
    });

    return {
      text:
        "Three things are at risk right now: the ML project (68% risk, Friday deadline), the lab report (45% risk, Wednesday), and a follow-up email to your professor that's overdue. Want me to take action on any of them?",
      actions,
    };
  }

  if (msg.includes("plan my day") || msg.includes("what should i do") || msg.includes("what's next") || msg.includes("prioritize") || msg.includes("break it down") || msg.includes("break down") || msg.includes("overwhelm") || msg.includes("where do i start")) {
    actions.push({
      tool: "prioritizeTasks",
      args: {},
      status: "pending",
    });
    actions.push({
      tool: "planMyDay",
      args: { days: 2, maxTasks: 12 },
      status: "pending",
    });
    return {
      text:
        "I re-ranked everything by urgency x importance and blocked focus sessions for your top tasks in the nearest free slots. Open the Calendar to see the blocks. Start with the first 25-minute sprint, even if that's just outlining, momentum beats motivation.",
      actions,
    };
  }

  // Default
  return {
    text:
      "I can help you break down tasks, schedule focus time, draft emails, and watch for deadlines. Tell me what's coming up: a deadline, a meeting, a project, and I'll take it from there.",
    actions: [],
  };
}