/**
 * In-memory mock store that mimics Firestore's real-time semantics.
 *
 * The orchestrator writes here today; once Firebase env vars are configured,
 * the same interface can be backed by Firestore without changing call sites.
 *
 * Exposes:
 *   - saveTask / listTasks / getTask / updateTask
 *   - saveEvent / listEvents
 *   - saveDraft / listDrafts / updateDraft
 *   - saveAgentLog / listAgentLogs
 *   - subscribe(cb) — broadcast on any write
 */

import type { Task, CalendarEvent, DraftDocument, AgentLog, Goal, Habit } from "@/types/task";

export type EnergyPattern = "morning" | "afternoon" | "evening" | "night";

export interface UserProfile {
  userId: string;
  /** What the user wants ResQ to call them. Falls back to display name / email. */
  name?: string;
  energyPattern: EnergyPattern;
  workHours: { start: string; end: string };
  updatedAt: string;
}

type Subscriber = () => void;

const DEFAULT_PROFILE: Omit<UserProfile, "userId"> = {
  name: undefined,
  energyPattern: "morning",
  workHours: { start: "09:00", end: "17:00" },
  updatedAt: new Date(0).toISOString(),
};

class MockStore {
  private tasks = new Map<string, Task>();
  private events = new Map<string, CalendarEvent>();
  private drafts = new Map<string, DraftDocument>();
  private logs = new Map<string, AgentLog>();
  private goals = new Map<string, Goal>();
  private habits = new Map<string, Habit>();
  private profiles = new Map<string, UserProfile>();
  private subscribers = new Set<Subscriber>();

  // ----- Subscribe (real-time semantics) -----
  subscribe(cb: Subscriber): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }
  private notify() {
    for (const s of this.subscribers) s();
  }

  // ----- Tasks -----
  saveTask(task: Task) {
    this.tasks.set(task.id, task);
    this.notify();
    return task;
  }
  listTasks(filter?: { userId?: string; status?: Task["status"] }): Task[] {
    let result = Array.from(this.tasks.values());
    if (filter?.userId) result = result.filter((t) => t.userId === filter.userId);
    if (filter?.status) result = result.filter((t) => t.status === filter.status);
    return result.sort((a, b) => a.deadline.localeCompare(b.deadline));
  }
  getTask(id: string) {
    return this.tasks.get(id);
  }
  updateTask(id: string, patch: Partial<Task>) {
    const existing = this.tasks.get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.tasks.set(id, next);
    this.notify();
    return next;
  }
  deleteTask(id: string) {
    const ok = this.tasks.delete(id);
    if (ok) this.notify();
    return ok;
  }

  // ----- Events (calendar blocks) -----
  saveEvent(event: CalendarEvent) {
    this.events.set(event.id, event);
    this.notify();
    return event;
  }
  listEvents(filter?: { userId?: string; startAfter?: string; endBefore?: string }): CalendarEvent[] {
    let result = Array.from(this.events.values());
    if (filter?.userId) result = result.filter((e) => e.userId === filter.userId);
    if (filter?.startAfter) result = result.filter((e) => e.end >= filter.startAfter!);
    if (filter?.endBefore) result = result.filter((e) => e.start <= filter.endBefore!);
    return result.sort((a, b) => a.start.localeCompare(b.start));
  }
  deleteEvent(id: string) {
    const ok = this.events.delete(id);
    if (ok) this.notify();
    return ok;
  }

  // ----- Drafts -----
  saveDraft(draft: DraftDocument) {
    this.drafts.set(draft.id, draft);
    this.notify();
    return draft;
  }
  listDrafts(filter?: { userId?: string; status?: DraftDocument["status"] }): DraftDocument[] {
    let result = Array.from(this.drafts.values());
    if (filter?.userId) result = result.filter((d) => d.userId === filter.userId);
    if (filter?.status) result = result.filter((d) => d.status === filter.status);
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  updateDraft(id: string, patch: Partial<DraftDocument>) {
    const existing = this.drafts.get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch };
    this.drafts.set(id, next);
    this.notify();
    return next;
  }
  deleteDraft(id: string) {
    const ok = this.drafts.delete(id);
    if (ok) this.notify();
    return ok;
  }

  // ----- Agent logs (audit trail) -----
  saveAgentLog(log: AgentLog) {
    this.logs.set(log.id, log);
    this.notify();
    return log;
  }
  listAgentLogs(limit = 50, filter?: { userId?: string }): AgentLog[] {
    let result = Array.from(this.logs.values());
    if (filter?.userId) result = result.filter((l) => l.userId === filter.userId);
    return result
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  }

  // ----- Goals -----
  saveGoal(goal: Goal) {
    this.goals.set(goal.id, goal);
    this.notify();
    return goal;
  }
  listGoals(filter?: { userId?: string }): Goal[] {
    let result = Array.from(this.goals.values());
    if (filter?.userId) result = result.filter((g) => g.userId === filter.userId);
    return result.sort((a, b) => a.targetDate.localeCompare(b.targetDate));
  }
  getGoal(id: string) {
    return this.goals.get(id);
  }
  updateGoal(id: string, patch: Partial<Goal>) {
    const existing = this.goals.get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch };
    this.goals.set(id, next);
    this.notify();
    return next;
  }
  deleteGoal(id: string) {
    const ok = this.goals.delete(id);
    if (ok) this.notify();
    return ok;
  }

  // ----- Habits -----
  saveHabit(habit: Habit) {
    this.habits.set(habit.id, habit);
    this.notify();
    return habit;
  }
  listHabits(filter?: { userId?: string }): Habit[] {
    let result = Array.from(this.habits.values());
    if (filter?.userId) result = result.filter((h) => h.userId === filter.userId);
    return Array.from(result);
  }
  updateHabit(id: string, patch: Partial<Habit>) {
    const existing = this.habits.get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch };
    this.habits.set(id, next);
    this.notify();
    return next;
  }
  deleteHabit(id: string) {
    const ok = this.habits.delete(id);
    if (ok) this.notify();
    return ok;
  }

  // ----- Profile (personalization) -----
  getProfile(userId: string): UserProfile {
    return (
      this.profiles.get(userId) ?? {
        userId,
        ...DEFAULT_PROFILE,
        updatedAt: new Date().toISOString(),
      }
    );
  }
  saveProfile(userId: string, patch: Partial<Omit<UserProfile, "userId">>) {
    const existing = this.getProfile(userId);
    const next: UserProfile = {
      ...existing,
      ...patch,
      userId,
      updatedAt: new Date().toISOString(),
    };
    this.profiles.set(userId, next);
    this.notify();
    return next;
  }
}

// Module-level singleton (Next.js dev hot-reloads kill this — that's fine for demo)
const globalForStore = globalThis as unknown as { __resqMockStore?: MockStore };
export const store: MockStore =
  globalForStore.__resqMockStore ?? (globalForStore.__resqMockStore = new MockStore());

/**
 * Seed the store with realistic demo data on first access.
 *
 * Only seeds the demo account (`demo-user`) so real signed-in users start with
 * a clean slate and their own data. Idempotent — only seeds if empty.
 */
export function seedDemoData(userId: string): void {
  if (userId !== "demo-user") return;
  if (store.listTasks({ userId }).length > 0) return;

  const now = new Date();
  const inDays = (d: number) => new Date(now.getTime() + d * 86400000).toISOString();

  const tasks: Task[] = [
    {
      id: "task_seed_1",
      userId,
      title: "Submit ML project",
      description: "Final writeup + trained model to course portal",
      deadline: inDays(2),
      priority: 1,
      status: "in_progress",
      estimatedMinutes: 360,
      actualMinutes: 90,
      tags: ["academic", "urgent"],
      riskScore: 68,
      riskLevel: "warning",
      dependencies: [],
      attachments: [],
      reminders: [],
      source: "user",
      createdAt: new Date(now.getTime() - 86400000 * 3).toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "task_seed_2",
      userId,
      title: "Reply to Prof. Sharma re: extension",
      description: "Ask for 1-day grace on the project",
      deadline: inDays(0),
      priority: 2,
      status: "todo",
      estimatedMinutes: 15,
      tags: ["communication"],
      riskScore: 45,
      riskLevel: "watch",
      dependencies: [],
      attachments: [],
      reminders: [],
      source: "agent",
      createdAt: new Date(now.getTime() - 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "task_seed_3",
      userId,
      title: "Read chapter 7: Distributed Systems",
      description: "For Wednesday's quiz",
      deadline: inDays(3),
      priority: 3,
      status: "todo",
      estimatedMinutes: 90,
      tags: ["study"],
      riskScore: 22,
      riskLevel: "safe",
      dependencies: [],
      attachments: [],
      reminders: [],
      source: "user",
      createdAt: new Date(now.getTime() - 86400000 * 2).toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "task_seed_4",
      userId,
      title: "Pay electricity bill",
      description: "₹2,400 due, autopay failed last month",
      deadline: inDays(1),
      priority: 4,
      status: "todo",
      estimatedMinutes: 5,
      tags: ["finance"],
      riskScore: 30,
      riskLevel: "safe",
      dependencies: [],
      attachments: [],
      reminders: [],
      source: "user",
      createdAt: new Date(now.getTime() - 86400000 * 5).toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  for (const t of tasks) store.saveTask(t);

  const events: CalendarEvent[] = [
    {
      id: "event_seed_1",
      userId,
      source: "agent",
      title: "Focus block: ML project kickoff",
      start: inDays(1),
      end: new Date(new Date(inDays(1)).getTime() + 90 * 60000).toISOString(),
      kind: "focus",
      linkedTaskId: "task_seed_1",
    },
    {
      id: "event_seed_2",
      userId,
      source: "manual",
      title: "Distributed Systems class",
      start: new Date(now.getTime() + 5 * 3600000).toISOString(),
      end: new Date(now.getTime() + 7 * 3600000).toISOString(),
      kind: "class",
    },
  ];
  for (const e of events) store.saveEvent(e);

  const drafts: DraftDocument[] = [
    {
      id: "draft_seed_1",
      userId,
      kind: "email",
      title: "Extension request",
      subject: "Quick request: 1-day extension on ML project",
      body:
        "Hi Professor Sharma,\n\nI wanted to ask for a 1-day extension on the ML project due Friday. I've hit a roadblock with the transformer comparison that needs another evening of work, and I'd rather submit something polished than rush.\n\nI have the literature review done, the model architecture comparison in progress, and a clean outline for the writeup. I'll have everything in your inbox by Saturday noon if you can grant the extension.\n\nLet me know either way, and thanks for considering.\n\nBest,\n[Your name]",
      status: "pending",
      generatedFor: "task_seed_2",
      generatedBy: "resq",
      createdAt: new Date(now.getTime() - 600000).toISOString(),
      context: "Asked by ResQ after detecting task risk",
      tone: "formal",
    },
  ];
  for (const d of drafts) store.saveDraft(d);

  const logs: AgentLog[] = [
    {
      id: "log_seed_1",
      userId,
      timestamp: new Date(now.getTime() - 1800000).toISOString(),
      action: "Generated project outline in Drive",
      tool: "generateDeliverable",
      reasoning: "Detected high-risk task 'Submit ML project', generating starter materials",
      userNotified: true,
      relatedTaskId: "task_seed_1",
    },
    {
      id: "log_seed_2",
      userId,
      timestamp: new Date(now.getTime() - 3600000).toISOString(),
      action: "Blocked 90-min focus block for ML project",
      tool: "blockFocusTime",
      reasoning: "Reverse-engineered schedule from Friday deadline",
      userNotified: true,
      relatedTaskId: "task_seed_1",
    },
    {
      id: "log_seed_3",
      userId,
      timestamp: new Date(now.getTime() - 7200000).toISOString(),
      action: "Drafted extension email to Prof. Sharma",
      tool: "draftEmail",
      reasoning: "Asked by user after task risk hit 68%",
      userNotified: true,
      relatedTaskId: "task_seed_2",
    },
  ];
  for (const l of logs) store.saveAgentLog(l);

  const goals: Goal[] = [
    {
      id: "goal_seed_1",
      userId,
      title: "Ship ML project by semester end",
      description: "Final writeup + trained model, submitted to course portal.",
      targetDate: inDays(6),
      linkedTasks: ["task_seed_1"],
      milestones: [
        { id: "m1", title: "Literature review", targetDate: inDays(-3), completed: true, completedAt: new Date(now.getTime() - 3 * 86400000).toISOString() },
        { id: "m2", title: "Comparative study", targetDate: inDays(-1), completed: true, completedAt: new Date(now.getTime() - 1 * 86400000).toISOString() },
        { id: "m3", title: "Model training", targetDate: inDays(2), completed: false },
        { id: "m4", title: "Final writeup", targetDate: inDays(5), completed: false },
      ],
      status: "active",
      createdAt: new Date(now.getTime() - 86400000 * 7).toISOString(),
    },
    {
      id: "goal_seed_2",
      userId,
      title: "Get internship at a YC startup",
      description: "Portfolio, applications, mock interviews.",
      targetDate: inDays(60),
      linkedTasks: [],
      milestones: [
        { id: "m1", title: "Portfolio site", targetDate: inDays(-5), completed: true, completedAt: new Date(now.getTime() - 5 * 86400000).toISOString() },
        { id: "m2", title: "Apply to 30 companies", targetDate: inDays(30), completed: false },
        { id: "m3", title: "Mock interviews", targetDate: inDays(45), completed: false },
      ],
      status: "active",
      createdAt: new Date(now.getTime() - 86400000 * 14).toISOString(),
    },
  ];
  for (const g of goals) store.saveGoal(g);

  const habits: Habit[] = [
    { id: "habit_seed_1", userId, name: "Deep work session (2hr)", frequency: "daily", streak: 12, longestStreak: 12, history: [], createdAt: new Date(now.getTime() - 86400000 * 20).toISOString() },
    { id: "habit_seed_2", userId, name: "Read research paper", frequency: "daily", streak: 7, longestStreak: 9, history: [], createdAt: new Date(now.getTime() - 86400000 * 15).toISOString() },
    { id: "habit_seed_3", userId, name: "Exercise", frequency: "weekly", streak: 4, longestStreak: 6, history: [], createdAt: new Date(now.getTime() - 86400000 * 30).toISOString() },
    { id: "habit_seed_4", userId, name: "Journal", frequency: "daily", streak: 23, longestStreak: 23, history: [], createdAt: new Date(now.getTime() - 86400000 * 25).toISOString() },
  ];
  for (const h of habits) store.saveHabit(h);
}