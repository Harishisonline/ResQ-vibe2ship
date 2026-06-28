/**
 * Task types — the core domain entity
 */

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "archived";
export type TaskPriority = 1 | 2 | 3 | 4 | 5; // 1 = highest
export type RiskLevel = "safe" | "watch" | "warning" | "critical";

export interface Task {
  id: string;
  userId: string;
  /** Pool entity discriminator — task or subtask (chunk). */
  entityType?: "task" | "subtask";
  title: string;
  description?: string;
  deadline: string; // ISO timestamp
  priority: TaskPriority;
  status: TaskStatus;
  estimatedMinutes: number;
  actualMinutes?: number;
  tags: string[];
  riskScore: number; // 0-100
  riskLevel: RiskLevel;
  /** Parent task id when entityType is subtask. */
  parentId?: string;
  dependencies: string[]; // task IDs
  attachments: TaskAttachment[];
  reminders: TaskReminder[];
  source: "user" | "agent" | "calendar" | "email";
  sourceRef?: string; // e.g., calendar event ID or email message ID
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  /** Internal focus slot from plan-my-day or break-down (not a calendar event). */
  scheduledStart?: string;
  scheduledEnd?: string;
}

export interface TaskAttachment {
  id: string;
  name: string;
  url: string; // Firebase Storage URL
  mimeType: string;
  size: number;
}

export interface TaskReminder {
  id: string;
  triggerAt: string; // ISO timestamp
  strategy: "fixed" | "context_aware" | "adaptive";
  sent: boolean;
  sentAt?: string;
  response?: "acknowledged" | "snoozed" | "dismissed";
}

export interface DraftDocument {
  id: string;
  userId: string;
  kind: "email" | "doc" | "spreadsheet" | "code" | "outline";
  title: string;
  subject?: string; // for emails
  body: string;
  status: "pending" | "approved" | "sent" | "rejected";
  generatedFor: string; // task ID
  generatedBy: "resq" | "user";
  createdAt: string;
  approvedAt?: string;
  sentAt?: string;
  context?: string;
  tone?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentLog {
  id: string;
  userId: string;
  timestamp: string;
  action: string;
  tool: string;
  reasoning: string;
  userNotified: boolean;
  userAction?: "approved" | "rejected" | "edited";
  relatedTaskId?: string;
}

export interface CalendarEvent {
  id: string;
  userId: string;
  source: "google" | "manual" | "agent";
  sourceRef?: string; // Google Calendar event ID
  title: string;
  description?: string;
  start: string;
  end: string;
  kind: "focus" | "meeting" | "class" | "personal" | "deadline";
  linkedTaskId?: string;
  linkedEntityType?: "task" | "habit";
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  timezone: string;
  workHours: { start: string; end: string }; // "09:00", "17:00"
  energyPattern: "morning" | "afternoon" | "evening" | "night";
  preferences: {
    nudgesEnabled: boolean;
    voiceEnabled: boolean;
    autoSchedule: boolean;
    reminderStyle: "subtle" | "firm" | "aggressive";
  };
  onboardedAt?: string;
  createdAt: string;
}

export interface Goal {
  id: string;
  userId: string;
  title: string;
  description?: string;
  targetDate: string;
  linkedTasks: string[];
  milestones: GoalMilestone[];
  status: "active" | "achieved" | "abandoned";
  createdAt: string;
}

export interface GoalMilestone {
  id: string;
  title: string;
  targetDate: string;
  completed: boolean;
  completedAt?: string;
}

export interface Habit {
  id: string;
  userId: string;
  name: string;
  frequency: "daily" | "weekdays" | "weekly" | "custom";
  customDays?: number[]; // 0-6 (Sun-Sat)
  streak: number;
  longestStreak: number;
  lastCompleted?: string;
  history: { date: string; completed: boolean }[];
  /** Preferred time for scheduling (HH:mm or ISO). */
  preferredTime?: string;
  createdAt: string;
}
