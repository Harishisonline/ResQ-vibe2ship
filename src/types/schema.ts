/**
 * ResQ data pool — canonical schemas for Firestore / localStorage.
 *
 * Architecture: one shared pool per user. Tasks, habits, goals, calendar events,
 * drafts, and user context all link through IDs. Every mutation goes through
 * `pool` (see lib/data/pool.ts) which runs reconcilePool() so all pages stay in sync.
 *
 * Firestore layout:
 *   users/{uid}/tasks/{taskId}
 *   users/{uid}/events/{eventId}
 *   users/{uid}/goals/{goalId}
 *   users/{uid}/habits/{habitId}
 *   users/{uid}/drafts/{draftId}
 *   users/{uid}/logs/{logId}
 *   users/{uid}/profile/main
 *   users/{uid}/context/main  (localStorage key: resq:local:context:{uid})
 */

export type PoolEntityType = "task" | "subtask" | "habit" | "goal" | "event" | "draft";

/** Base fields every pool document shares. */
export interface PoolDocument {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "archived";
export type TaskPriority = 1 | 2 | 3 | 4 | 5;
export type RiskLevel = "safe" | "watch" | "warning" | "critical";

/**
 * Task — top-level work item or subtask (break-down chunk).
 * Subtasks: set parentId + tags includes "chunk" (legacy: dependencies[0]).
 */
export interface TaskSchema extends PoolDocument {
  entityType: "task" | "subtask";
  title: string;
  description?: string;
  deadline: string;
  priority: TaskPriority;
  status: TaskStatus;
  estimatedMinutes: number;
  actualMinutes?: number;
  tags: string[];
  riskScore: number;
  riskLevel: RiskLevel;
  parentId?: string;
  dependencies: string[];
  attachments: TaskAttachmentSchema[];
  reminders: TaskReminderSchema[];
  source: "user" | "agent" | "calendar" | "email";
  sourceRef?: string;
  completedAt?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
}

export interface TaskAttachmentSchema {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
}

export interface TaskReminderSchema {
  id: string;
  triggerAt: string;
  strategy: "fixed" | "context_aware" | "adaptive";
  sent: boolean;
  sentAt?: string;
  response?: "acknowledged" | "snoozed" | "dismissed";
}

export type CalendarEventKind = "focus" | "meeting" | "class" | "personal" | "deadline";

/** Calendar event — must link to a live task when source is agent. */
export interface CalendarEventSchema extends PoolDocument {
  entityType: "event";
  source: "google" | "manual" | "agent";
  sourceRef?: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  kind: CalendarEventKind;
  linkedTaskId?: string;
  linkedEntityType?: "task" | "habit";
}

export interface GoalSchema extends PoolDocument {
  entityType: "goal";
  title: string;
  description?: string;
  targetDate: string;
  linkedTasks: string[];
  milestones: GoalMilestoneSchema[];
  status: "active" | "achieved" | "abandoned";
}

export interface GoalMilestoneSchema {
  id: string;
  title: string;
  targetDate: string;
  completed: boolean;
  completedAt?: string;
}

export interface HabitSchema extends PoolDocument {
  entityType: "habit";
  name: string;
  frequency: "daily" | "weekdays" | "weekly" | "custom";
  customDays?: number[];
  streak: number;
  longestStreak: number;
  lastCompleted?: string;
  history: { date: string; completed: boolean }[];
  preferredTime?: string;
}

export interface DraftSchema extends PoolDocument {
  entityType: "draft";
  kind: "email" | "doc" | "spreadsheet" | "code" | "outline";
  title: string;
  subject?: string;
  body: string;
  status: "pending" | "approved" | "sent" | "rejected";
  generatedFor: string;
  generatedBy: "resq" | "user";
  approvedAt?: string;
  sentAt?: string;
  context?: string;
  tone?: string;
  metadata?: Record<string, unknown>;
}

/** AI memory: current project, stack, preferences. */
export interface UserContextSchema {
  id: "main";
  userId: string;
  currentProject?: string;
  notes?: string;
  activeGoalIds?: string[];
  activeHabitIds?: string[];
  techStack?: string[];
  updatedAt: string;
}

export const POOL_RULES = {
  agentEventRequiresTask: "Agent calendar events must have linkedTaskId → active task",
  subtasksNoCalendar: "Subtasks store scheduledStart/End on the task, not calendar events",
  deleteCascades: "Deleting a task removes linked events, subtasks, and goal links",
  manualEventsPersist: "Manual/google events are never auto-deleted",
} as const;
