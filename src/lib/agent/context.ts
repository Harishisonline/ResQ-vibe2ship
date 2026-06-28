"use client";

/**
 * Build the live AgentContext on the client from the data repository.
 *
 * The server cannot reach Firestore (no Admin SDK configured), so the client —
 * which already has the user's data via the repository — assembles the context
 * and sends it with the plan/synthesize requests. This keeps the agent aware of
 * real-time data in both Firestore and demo (mock) mode.
 */

import * as repo from "@/lib/data/repository";
import { filterVisibleEvents } from "@/lib/data/pool-sync";
import { pool } from "@/lib/data/pool";
import type { AgentContext } from "@/types/agent";
import type {
  Task,
  CalendarEvent,
  AgentLog,
  Goal,
  Habit,
  DraftDocument,
} from "@/types/task";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function buildClientContext(
  uid: string,
  userName: string
): Promise<AgentContext> {
  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000 - 1);

  // Keep pool in sync before the agent reads calendar/tasks.
  const { reconcilePool } = await import("@/lib/data/pool-sync");
  await reconcilePool(uid).catch(() => {});

  const [
    allTasks,
    allEvents,
    profile,
    userContext,
    recentLogs,
    goals,
    habits,
    drafts,
  ] = await Promise.all([
    repo.tasks.list(uid).catch(() => [] as Task[]),
    repo.events.list(uid).catch(() => [] as CalendarEvent[]),
    repo.profile.get(uid).catch(() => ({
      userId: uid,
      name: undefined as string | undefined,
      energyPattern: "morning" as const,
      workHours: { start: "09:00", end: "17:00" },
      updatedAt: now.toISOString(),
    })),
    pool.context.get(uid).catch(() => null),
    repo.logs.list(uid).catch(() => [] as AgentLog[]),
    repo.goals.list(uid).catch(() => [] as Goal[]),
    repo.habits.list(uid).catch(() => [] as Habit[]),
    repo.drafts.list(uid).catch(() => [] as DraftDocument[]),
  ]);

  const active = allTasks.filter((t) => t.status !== "done" && t.status !== "archived");
  const overdue = active.filter((t) => new Date(t.deadline) < now);
  const upcomingToday = active.filter((t) => {
    const d = new Date(t.deadline);
    return d >= dayStart && d <= dayEnd;
  });
  const highRisk = active.filter((t) => (t.riskScore ?? 0) > 50);

  const visibleEvents = filterVisibleEvents(allEvents, allTasks);

  const weekEnd = new Date(dayStart.getTime() + 7 * 86_400_000);
  const upcomingEvents = visibleEvents
    .filter((e) => {
      const s = new Date(e.start);
      return s >= dayStart && s < weekEnd;
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const todaysEvents = upcomingEvents.filter((e) => {
    const s = new Date(e.start);
    return s >= dayStart && s <= dayEnd;
  });
  const busyMinutes = todaysEvents.reduce(
    (sum, e) => sum + Math.max(0, new Date(e.end).getTime() - new Date(e.start).getTime()),
    0
  );
  const busyHoursToday = Math.round((busyMinutes / 3_600_000) * 10) / 10;
  const ws = profile.workHours.start.split(":").map(Number);
  const we = profile.workHours.end.split(":").map(Number);
  const workHoursToday =
    Math.max(0, we[0] + we[1] / 60 - (ws[0] + ws[1] / 60)) || 8;
  const freeHoursToday = Math.max(0, Math.round((workHoursToday - busyHoursToday) * 10) / 10);

  const recentActivity = recentLogs.slice(0, 5).map((l) => `${l.action} (${l.tool})`);

  return {
    user: {
      uid,
      // Prefer the name the user explicitly set in Settings; fall back to the
      // Firebase display name / email handle passed in from the chat client.
      name: profile.name?.trim() || userName,
      energyPattern: profile.energyPattern,
      workHours: profile.workHours,
    },
    tasks: {
      active: active.length,
      overdue: overdue.length,
      upcomingToday: upcomingToday.length,
      highRisk: highRisk.length,
    },
    calendar: {
      busyHoursToday,
      freeHoursToday,
      eventsToday: todaysEvents.length,
      eventsTotal: visibleEvents.length,
    },
    recentActivity,
    taskList: allTasks,
    eventList: upcomingEvents,
    goalList: goals,
    habitList: habits,
    draftList: drafts,
    userContext: userContext ?? undefined,
  };
}
