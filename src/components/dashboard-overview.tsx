"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckSquare,
  Clock,
  Flame,
  Loader2,
  Scissors,
  Target,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/auth-provider";
import { useCollection } from "@/hooks/use-collection";
import * as repo from "@/lib/data/repository";
import { panicScore, groupTasksByParent } from "@/lib/agent/planner";
import { filterVisibleEvents } from "@/lib/agent/task-sync";
import {
  breakDownTaskAction,
  planMyDayAction,
  prioritizeTasksAction,
  formatDayPlanSummary,
  completeTaskAction,
} from "@/lib/agent/actions";
import { useAgentStore } from "@/stores/agent-store";
import { DailyBriefing } from "@/components/daily-briefing";
import { DashboardAgentBar } from "@/components/dashboard-agent-bar";
import { cn } from "@/lib/utils";
import type { Task, CalendarEvent, Goal, Habit } from "@/types/task";

const KIND_DOT: Record<CalendarEvent["kind"], string> = {
  focus: "bg-indigo-500",
  meeting: "bg-blue-500",
  class: "bg-amber-500",
  deadline: "bg-red-500",
  personal: "bg-emerald-500",
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function dayKey(d: Date): string {
  // Local calendar date (not UTC) so "done today" stays correct in the evening
  // for non-UTC users.
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof CheckSquare;
  label: string;
  value: number | string;
  tone: string;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2.5">
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", tone)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium uppercase text-muted-foreground">
            {label}
          </p>
          <p className="text-lg font-semibold leading-tight">{value}</p>
        </div>
      </div>
    </Card>
  );
}

export function DashboardOverview() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.uid ?? "demo-user";
  const { pushAssistantMessage, setPendingBreakDown } = useAgentStore();

  const { data: tasks, refresh: refreshTasks } = useCollection<Task>(repo.tasks, userId);
  const { data: events, refresh: refreshEvents } = useCollection<CalendarEvent>(repo.events, userId);
  const { data: goals } = useCollection<Goal>(repo.goals, userId);
  const { data: habits, refresh: refreshHabits } = useCollection<Habit>(repo.habits, userId);

  const [name, setName] = useState("");
  const [acting, setActing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await repo.profile.get(userId);
        if (!cancelled) setName(p.name?.trim() || user?.displayName || "");
      } catch {
        if (!cancelled) setName(user?.displayName ?? "");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, user?.displayName]);

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = new Date(todayStart.getTime() + 86_400_000 - 1);

  const active = useMemo(
    () => tasks.filter((t) => t.status !== "done" && t.status !== "archived"),
    [tasks]
  );
  // Hide blocks for done, deleted, or chunk-linked tasks (see task-sync).
  const visibleEvents = useMemo(
    () => filterVisibleEvents(events, tasks),
    [events, tasks]
  );
  const ranked = useMemo(() => {
    const { top, childrenOf } = groupTasksByParent(active);
    return top
      .map((t) => ({
        t,
        s: panicScore(t, now).score,
        hasChildren: (childrenOf.get(t.id)?.length ?? 0) > 0,
      }))
      .sort((a, b) => b.s - a.s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  const overdue = active.filter((t) => new Date(t.deadline) < now).length;
  const dueToday = active.filter((t) => {
    const d = new Date(t.deadline);
    return d >= todayStart && d <= todayEnd;
  }).length;
  const highRisk = active.filter((t) => (t.riskScore ?? 0) > 50).length;

  const todaysEvents = useMemo(
    () =>
      visibleEvents
        .filter((e) => {
          const s = new Date(e.start);
          return s >= todayStart && s <= todayEnd;
        })
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [visibleEvents, todayStart, todayEnd]
  );

  const upcomingEvents = useMemo(
    () =>
      visibleEvents
        .filter((e) => new Date(e.start) > now)
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
        .slice(0, 4),
    [visibleEvents, now]
  );

  const activeGoals = useMemo(
    () => goals.filter((g) => g.status === "active").slice(0, 4),
    [goals]
  );

  const todayKey = dayKey(now);
  const habitsDue = habits.filter((h) => {
    if (!h.lastCompleted) return true;
    return dayKey(new Date(h.lastCompleted)) !== todayKey;
  });

  const toggleTask = async (task: Task) => {
    const done = task.status !== "done";
    try {
      await completeTaskAction(userId, task.id, done);
      refreshTasks();
      refreshEvents();
    } catch {
      toast.error("Update failed");
    }
  };

  const handleBreakDown = async (task: Task) => {
    setActing(true);
    try {
      const res = await breakDownTaskAction(userId, task.id, {
        title: task.title,
        description: task.description,
        deadline: task.deadline,
      });
      if (res.needsClarification) {
        setPendingBreakDown({
          taskId: task.id,
          title: task.title,
          deadline: task.deadline,
        });
        pushAssistantMessage(
          `I want to break down "${task.title}" for you, but I need a little more detail first. ${res.question}`
        );
        toast.info("ResQ needs more detail, opening chat…");
        router.push("/chat");
        return;
      }
      toast.success(res.summary);
      refreshTasks();
      refreshEvents();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not break this down");
    } finally {
      setActing(false);
    }
  };

  const handlePlanMyDay = async () => {
    setActing(true);
    try {
      const res = await planMyDayAction(userId, { days: 2, maxTasks: 12 });
      refreshEvents();
      refreshTasks();
      pushAssistantMessage(formatDayPlanSummary(res));
      toast.success("Planned your day, opening chat…");
      router.push("/chat");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not plan your day");
    } finally {
      setActing(false);
    }
  };

  const handlePrioritize = async () => {
    setActing(true);
    try {
      const res = await prioritizeTasksAction(userId);
      toast.success(res.summary);
      refreshTasks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not re-prioritize");
    } finally {
      setActing(false);
    }
  };

  const markHabitDone = async (habit: Habit) => {
    const already = habit.lastCompleted && dayKey(new Date(habit.lastCompleted)) === todayKey;
    if (already) return;
    try {
      const nextStreak = (habit.streak ?? 0) + 1;
      await repo.habits.update(userId, habit.id, {
        lastCompleted: now.toISOString(),
        streak: nextStreak,
        longestStreak: Math.max(habit.longestStreak ?? 0, nextStreak),
        history: [...(habit.history ?? []), { date: todayKey, completed: true }],
      } as Partial<Habit>);
      toast.success(`"${habit.name}" done. Streak ${nextStreak}.`);
      refreshHabits();
    } catch {
      toast.error("Could not update habit");
    }
  };

  const fmtTime = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const fmtDeadline = (iso: string) => {
    const d = new Date(iso);
    const diff = Math.round((d.getTime() - now.getTime()) / 86_400_000);
    if (d < now) return `${Math.abs(diff) || "<1"}d overdue`;
    if (diff === 0) return `Today ${fmtTime(d)}`;
    if (diff === 1) return `Tomorrow ${fmtTime(d)}`;
    if (diff < 7) return `In ${diff}d`;
    return d.toLocaleDateString();
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Hi{name ? `, ${name}` : ""}.
            </h1>
            <p className="text-sm text-muted-foreground">
              {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              {" · "}
              {active.length} active task{active.length === 1 ? "" : "s"}, {todaysEvents.length} event{todaysEvents.length === 1 ? "" : "s"} today.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handlePrioritize} disabled={acting}>
              {acting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="mr-1.5 h-3.5 w-3.5" />}
              Re-prioritize
            </Button>
            <Button size="sm" onClick={handlePlanMyDay} disabled={acting}>
              {acting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="mr-1.5 h-3.5 w-3.5" />}
              Plan my day
            </Button>
          </div>
        </div>

        {/* Focus + AI bar */}
        <div className="mb-4 space-y-3">
          <DailyBriefing />
          <DashboardAgentBar />
        </div>

        {/* Stats */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile icon={CheckSquare} label="Active" value={active.length} tone="bg-primary/10 text-primary" />
          <StatTile icon={Clock} label="Due today" value={dueToday} tone="bg-orange-500/10 text-orange-600 dark:text-orange-400" />
          <StatTile icon={AlertTriangle} label="Overdue" value={overdue} tone="bg-red-500/10 text-red-600 dark:text-red-400" />
          <StatTile icon={CalendarClock} label="Events today" value={todaysEvents.length} tone="bg-blue-500/10 text-blue-600 dark:text-blue-400" />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Pending tasks */}
          <Card className="lg:col-span-2">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <CheckSquare className="h-4 w-4" /> Pending tasks
                </h2>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => router.push("/tasks")}>
                  View all
                </Button>
              </div>
              {active.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No pending tasks. Tell ResQ what&apos;s coming up.
                </p>
              ) : (
                <ul className="space-y-2">
                  {ranked.slice(0, 6).map(({ t, s, hasChildren }) => {
                    const isDone = t.status === "done";
                    const panic = panicScore(t, now);
                    return (
                      <li
                        key={t.id}
                        className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/60 p-2.5"
                      >
                        <button
                          onClick={() => toggleTask(t)}
                          className={cn(
                            "mt-0.5 h-5 w-5 flex-shrink-0 rounded-full border-2 transition-colors flex items-center justify-center",
                            isDone
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border hover:border-primary"
                          )}
                          aria-label="Mark complete"
                        >
                          {isDone && <Check className="h-3 w-3" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn("truncate text-sm font-medium", isDone && "line-through text-muted-foreground")}>
                              {t.title}
                            </span>
                            <Badge
                              className={cn(
                                "h-4 px-1.5 py-0 text-[10px]",
                                panic.level === "critical"
                                  ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                                  : panic.level === "warning"
                                  ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                                  : panic.level === "watch"
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                              )}
                            >
                              {s} panic
                            </Badge>
                            {t.tags.includes("chunk") && (
                              <Badge variant="outline" className="h-4 px-1.5 py-0 text-[10px]">subtask</Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {fmtDeadline(t.deadline)} · P{t.priority}
                          </p>
                        </div>
                        {!isDone && !t.tags.includes("chunk") && !hasChildren && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 flex-shrink-0 px-2 text-xs text-muted-foreground hover:text-primary"
                            onClick={() => handleBreakDown(t)}
                            disabled={acting}
                          >
                            {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scissors className="h-3.5 w-3.5" />}
                            <span className="ml-1 hidden sm:inline">Break down</span>
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Right column: events, goals, habits */}
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <CalendarClock className="h-4 w-4" /> Today &amp; upcoming
                  </h2>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => router.push("/calendar")}>
                    Calendar
                  </Button>
                </div>
                {todaysEvents.length === 0 && upcomingEvents.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">Nothing scheduled.</p>
                ) : (
                  <ul className="space-y-2">
                    {todaysEvents.slice(0, 3).map((e) => (
                      <li key={e.id} className="flex items-center gap-2 text-sm">
                        <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", KIND_DOT[e.kind])} />
                        <span className="text-xs text-muted-foreground">{fmtTime(new Date(e.start))}</span>
                        <span className="truncate">{e.title}</span>
                      </li>
                    ))}
                    {todaysEvents.length === 0 &&
                      upcomingEvents.map((e) => (
                        <li key={e.id} className="flex items-center gap-2 text-sm">
                          <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", KIND_DOT[e.kind])} />
                          <span className="text-xs text-muted-foreground">
                            {new Date(e.start).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                          <span className="truncate">{e.title}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <Target className="h-4 w-4" /> Goals
                  </h2>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => router.push("/goals")}>
                    View all
                  </Button>
                </div>
                {activeGoals.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No active goals yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {activeGoals.map((g) => {
                      const done = g.milestones.filter((m) => m.completed).length;
                      const total = g.milestones.length;
                      const pct = total ? Math.round((done / total) * 100) : 0;
                      return (
                        <li key={g.id}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium">{g.title}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {total ? `${done}/${total}` : "no milestones"}
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <Flame className="h-4 w-4" /> Habits
                  </h2>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => router.push("/goals")}>
                    Manage
                  </Button>
                </div>
                {habits.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No habits tracked.</p>
                ) : (
                  <ul className="space-y-2">
                    {habits.slice(0, 5).map((h) => {
                      const doneToday = h.lastCompleted && dayKey(new Date(h.lastCompleted)) === todayKey;
                      return (
                        <li key={h.id} className="flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{h.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              streak {h.streak ?? 0} · {h.frequency}
                            </p>
                          </div>
                          <Button
                            variant={doneToday ? "secondary" : "outline"}
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={!!doneToday}
                            onClick={() => markHabitDone(h)}
                          >
                            {doneToday ? (
                              <>
                                <Check className="mr-1 h-3 w-3" /> Done
                              </>
                            ) : (
                              "Mark done"
                            )}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
