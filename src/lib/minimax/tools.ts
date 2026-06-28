/**
 * MiniMax tool declarations — same ResQ tools, converted to OpenAI `tools` format.
 * MiniMax uses: { type: "function", function: { name, description, parameters } }
 */

export interface MiniMaxTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

const obj = (
  properties: Record<string, unknown>,
  required?: string[]
): Record<string, unknown> => {
  const schema: Record<string, unknown> = { type: "object", properties };
  if (required && required.length > 0) schema.required = required;
  return schema;
};

export const RESQ_TOOLS: MiniMaxTool[] = [
  {
    type: "function",
    function: {
      name: "createTask",
      description:
        "Create a new task with deadline, priority, and estimated effort. Use when user mentions a new commitment, assignment, or deadline.",
      parameters: obj(
        {
          title: { type: "string", description: "Short task title (max 80 chars)" },
          description: { type: "string", description: "Detailed description of what needs to be done" },
          deadline: { type: "string", description: "ISO 8601 deadline timestamp (e.g. 2026-06-28T17:00:00Z)" },
          priority: { type: "integer", description: "1 = highest, 5 = lowest", minimum: 1, maximum: 5 },
          estimatedMinutes: { type: "integer", description: "Realistic time estimate (account for 2-3x user estimate)", minimum: 5 },
          tags: { type: "array", items: { type: "string" }, description: "Tags like ['work', 'urgent', 'academic']" },
        },
        ["title", "deadline", "priority", "estimatedMinutes"]
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "rescheduleTask",
      description: "Move a task to a different time or deadline. Use when conflicts arise or user requests a change.",
      parameters: obj(
        {
          taskId: { type: "string", description: "ID of the task to reschedule" },
          newDeadline: { type: "string", description: "New ISO 8601 deadline" },
          reason: { type: "string", description: "Why this reschedule" },
        },
        ["taskId", "newDeadline", "reason"]
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "updateTaskStatus",
      description: "Mark a task as in_progress, blocked, done, or archived.",
      parameters: obj(
        {
          taskId: { type: "string" },
          status: { type: "string", enum: ["todo", "in_progress", "blocked", "done", "archived"] },
          actualMinutes: { type: "integer", description: "If completing, how long it actually took" },
          blockerNote: { type: "string", description: "If status is 'blocked', what's blocking it" },
        },
        ["taskId", "status"]
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "draftEmail",
      description:
        "Write and send an email on the user's behalf. Provide the recipient (to), subject, and the full plain-text body. If Gmail is connected it sends immediately; otherwise it saves a draft in the inbox for one-click send. Always include a clear body, not just a subject. If the user hasn't given the recipient's address yet, still draft the full body and ask for the address in your reply.",
      parameters: obj(
        {
          to: { type: "string", description: "Recipient email. Omit only if the user hasn't provided it yet; the draft is still saved for review." },
          subject: { type: "string", description: "Email subject line" },
          body: { type: "string", description: "Full email body in plain text" },
          context: { type: "string", description: "Why this email is needed (for the UI to show the user)" },
          relatedTaskId: { type: "string", description: "Task this email supports, if any" },
          tone: { type: "string", enum: ["formal", "casual", "apology", "follow-up", "request"] },
        },
        ["subject", "body", "context", "tone"]
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "blockFocusTime",
      description:
        "Block a 'Do Not Disturb' focus block in the user's calendar. ALWAYS check calendar first via fetchCalendarEvents.",
      parameters: obj(
        {
          start: { type: "string", description: "ISO 8601 start time" },
          end: { type: "string", description: "ISO 8601 end time" },
          title: { type: "string", description: "Block label (e.g., 'Project X: kickoff')" },
          linkedTaskId: { type: "string", description: "Task this block supports" },
          notifyOthers: { type: "boolean", description: "Whether to auto-decline conflicting meetings" },
        },
        ["start", "end", "title"]
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "escalateRisk",
      description:
        "Increase the risk score for a task and trigger a proactive alert. Use when you detect a task is about to slip.",
      parameters: obj(
        {
          taskId: { type: "string" },
          newRiskScore: { type: "integer", minimum: 0, maximum: 100 },
          reason: { type: "string", description: "Why risk is escalating" },
          autoActions: {
            type: "array",
            items: { type: "string", enum: ["draft_email", "block_focus", "send_alert", "reschedule"] },
            description: "Actions to take immediately",
          },
        },
        ["taskId", "newRiskScore", "reason"]
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "generateDeliverable",
      description:
        "Generate a starter document, spreadsheet, or code file from a template. Creates a Google Doc / Sheet / file in Drive.",
      parameters: obj(
        {
          type: {
            type: "string",
            enum: [
              "project_proposal",
              "study_notes",
              "presentation_outline",
              "interview_prep",
              "expense_report",
              "weekly_review",
              "research_summary",
              "code_starter",
            ],
            description: "Template type",
          },
          title: { type: "string" },
          context: { type: "object", description: "Variables to fill into the template" },
          relatedTaskId: { type: "string" },
        },
        ["type", "title", "context"]
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "createReminder",
      description:
        "Schedule an adaptive reminder. The timing adjusts based on the user's response history.",
      parameters: obj(
        {
          taskId: { type: "string" },
          triggerAt: { type: "string", description: "ISO 8601 when to remind" },
          strategy: { type: "string", enum: ["fixed", "context_aware", "adaptive"] },
          message: { type: "string", description: "Reminder text (will be personalized by ResQ)" },
        },
        ["taskId", "triggerAt", "strategy"]
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "fetchCalendarEvents",
      description:
        "Get the user's calendar events for a date range. ALWAYS call this before scheduling anything.",
      parameters: obj(
        {
          startDate: { type: "string", description: "ISO date or datetime" },
          endDate: { type: "string", description: "ISO date or datetime" },
          includeDeclined: { type: "boolean", description: "Include events the user has declined" },
        },
        ["startDate", "endDate"]
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "fetchTasks",
      description:
        "Get the user's current tasks for context. Filter by status, risk level, or date range.",
      parameters: obj({
        status: { type: "string", enum: ["all", "active", "overdue", "today", "this_week"] },
        minRiskScore: { type: "integer", minimum: 0, maximum: 100 },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      }),
    },
  },
  {
    type: "function",
    function: {
      name: "breakDownTask",
      description:
        "Break a big task into 2-6 finishable chunks, create a child task for each, and block focus time for every chunk in a free calendar slot. Use this proactively whenever a task feels big, vague, or close to its deadline. ALWAYS pass the task title (and description if known) alongside the taskId so the action still works even if the id doesn't resolve.",
      parameters: obj(
        {
          taskId: { type: "string", description: "ID of the task to break down, from the context task list" },
          title: { type: "string", description: "Title of the task to break down (always include this as a fallback)" },
          description: { type: "string", description: "Task description if known" },
          deadline: { type: "string", description: "ISO 8601 deadline if the task must be created fresh" },
          chunkTitles: {
            type: "array",
            items: { type: "string" },
            description: "Optional explicit chunk titles. If omitted, ResQ splits by estimated effort.",
          },
        },
        ["taskId"]
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "planMyDay",
      description:
        "Rank active tasks by urgency x importance and block focus sessions for the top ones in the nearest free calendar slots. Use when the user asks 'what should I do today', 'plan my day', 'schedule my work', or feels overwhelmed. Always call fetchCalendarEvents implicitly via this tool (it reads the calendar).",
      parameters: obj({
        days: { type: "integer", minimum: 1, maximum: 7, description: "How many days ahead to look for free slots (default 2)" },
        maxTasks: { type: "integer", minimum: 1, maximum: 8, description: "Max focus sessions to book (default 4)" },
      }),
    },
  },
  {
    type: "function",
    function: {
      name: "prioritizeTasks",
      description:
        "Re-score every active task by urgency (deadline proximity) x importance (priority) and persist the new risk scores. Use when the list is messy, when asked 'what should I do first', or before planning. Call this before planMyDay for best ordering.",
      parameters: obj({
        taskIds: {
          type: "array",
          items: { type: "string" },
          description: "Optional subset of task IDs to re-score. Omit to re-score all active tasks.",
        },
      }),
    },
  },
  {
    type: "function",
    function: {
      name: "createGoal",
      description:
        "Create a high-level goal with linked tasks and milestones. Use for long-term outcomes (semester, quarter, year).",
      parameters: obj(
        {
          title: { type: "string" },
          description: { type: "string" },
          targetDate: { type: "string" },
          milestones: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                targetDate: { type: "string" },
              },
            },
          },
        },
        ["title", "targetDate"]
      ),
    },
  },
];

export const TOOL_NAMES = RESQ_TOOLS.map((t) => t.function.name);
