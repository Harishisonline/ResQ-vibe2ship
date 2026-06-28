"use client";

import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Flame,
  Mail,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { useCollection } from "@/hooks/use-collection";
import * as repo from "@/lib/data/repository";
import { filterVisibleEvents } from "@/lib/agent/task-sync";
import type {
  AgentLog,
  Task,
  CalendarEvent,
  Goal,
  Habit,
  DraftDocument,
} from "@/types/task";

const TOOL_ICONS: Record<string, typeof Bot> = {
  createTask: Target,
  draftEmail: Mail,
  blockFocusTime: Calendar,
  generateDeliverable: FileText,
  escalateRisk: AlertTriangle,
  createReminder: Bot,
  panicEngine: Zap,
  createGoal: Target,
  default: Sparkles,
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function InsightsPage() {
  const { user } = useAuth();
  const userId = user?.uid ?? "demo-user";
  const { data: logs, loading: logsLoading, refresh: refreshLogs } =
    useCollection<AgentLog>(repo.logs, userId);
  const { data: tasks, refresh: refreshTasks } = useCollection<Task>(repo.tasks, userId);
  const { data: events } = useCollection<CalendarEvent>(repo.events, userId);
  const { data: goals } = useCollection<Goal>(repo.goals, userId);
  const { data: habits } = useCollection<Habit>(repo.habits, userId);
  const { data: drafts } = useCollection<DraftDocument>(repo.drafts, userId);

  const loading = logsLoading;

  const [rescanning, setRescanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    scannedAt: string;
    totalTasks: number;
    rescored: number;
    actions: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const triggerPanicScan = async () => {
    setRescanning(true);
    setScanResult(null);
    try {
      const r = await fetch("/api/panic-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const d = await r.json();
      if (d.success) {
        setScanResult({
          scannedAt: d.result.scannedAt,
          totalTasks: d.result.totalTasks,
          rescored: d.result.rescored,
          actions: d.result.actions.filter(
            (a: { actionTaken: string | null }) => a.actionTaken
          ).length,
        });
        refreshLogs();
        refreshTasks();
      } else {
        setError(d.error ?? "Panic scan failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRescanning(false);
    }
  };

  // ---- Real stats computed from actual user data ----
  const now = new Date();
  const thirtyDaysAgo = now.getTime() - 30 * 86_400_000;
  const weekStart = startOfDay(now);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000 - 1);

  const doneTasks = tasks.filter((t) => t.status === "done");
  const completed30d = doneTasks.filter(
    (t) => t.completedAt && new Date(t.completedAt).getTime() >= thirtyDaysAgo
  ).length;
  const onTime = doneTasks.filter(
    (t) => t.completedAt && new Date(t.completedAt) <= new Date(t.deadline)
  ).length;
  const onTimeRate = doneTasks.length ? Math.round((onTime / doneTasks.length) * 100) : 0;
  const hoursSaved = Math.round(
    doneTasks
      .filter((t) => t.source === "agent")
      .reduce((sum, t) => sum + (t.estimatedMinutes ?? 0), 0) / 60
  );
  const rescued = doneTasks.filter((t) => (t.riskScore ?? 0) > 50).length;

  // Workspace overview
  const activeTasks = tasks.filter((t) => t.status !== "done" && t.status !== "archived");
  const overdueTasks = activeTasks.filter((t) => new Date(t.deadline) < now);
  const highRiskTasks = activeTasks.filter((t) => (t.riskScore ?? 0) > 50);

  const visibleEvents = filterVisibleEvents(events, tasks);

  const weekEvents = visibleEvents.filter((e) => {
    const s = new Date(e.start);
    return s >= weekStart && s <= weekEnd;
  });
  const bookedMinutes = weekEvents.reduce(
    (sum, e) => sum + Math.max(0, new Date(e.end).getTime() - new Date(e.start).getTime()),
    0
  );
  const bookedHoursWeek = Math.round((bookedMinutes / 3_600_000) * 10) / 10;
  const focusBlocks = visibleEvents.filter((e) => e.kind === "focus").length;

  const activeGoals = goals.filter((g) => g.status === "active");
  const achievedGoals = goals.filter((g) => g.status === "achieved");
  const goalMilestonesDone = goals.reduce(
    (sum, g) => sum + g.milestones.filter((m) => m.completed).length,
    0
  );
  const goalMilestonesTotal = goals.reduce((sum, g) => sum + g.milestones.length, 0);

  const habitsTracked = habits.length;
  const bestStreak = habits.reduce((max, h) => Math.max(max, h.longestStreak ?? h.streak ?? 0), 0);
  const habitsDoneToday = habits.filter((h) => {
    if (!h.lastCompleted) return false;
    return new Date(h.lastCompleted).toDateString() === now.toDateString();
  }).length;

  const pendingDrafts = drafts.filter((d) => d.status === "pending").length;
  const sentDrafts = drafts.filter((d) => d.status === "sent").length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Insights &amp; Agent Activity</h1>
            <p className="text-sm text-muted-foreground">
              Your whole workspace at a glance. Every action ResQ takes.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Button onClick={triggerPanicScan} disabled={rescanning} className="gap-2">
              <RefreshCw className={cn("h-4 w-4", rescanning && "animate-spin")} />
              {rescanning ? "Scanning…" : "Rescan risks (Panic Engine)"}
            </Button>
            {scanResult && (
              <Badge variant="secondary" className="text-[10px]">
                Scanned {scanResult.totalTasks} · Rescored {scanResult.rescored} · Actions taken{" "}
                {scanResult.actions}
              </Badge>
            )}
          </div>
        </div>

        {error && (
          <Card className="mb-4 border-destructive/40 bg-destructive/5">
            <CardContent className="text-sm text-destructive p-3">{error}</CardContent>
          </Card>
        )}

        {/* Top performance stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Tasks completed (30d)"
            value={loading ? "…" : String(completed30d)}
            tone="text-green-600"
            icon={CheckCircle2}
          />
          <StatTile
            label="On-time rate"
            value={loading ? "…" : `${onTimeRate}%`}
            tone="text-blue-600"
            icon={TrendingUp}
          />
          <StatTile
            label="Hours saved by agent"
            value={loading ? "…" : `${hoursSaved}h`}
            tone="text-amber-600"
            icon={Clock}
          />
          <StatTile
            label="Deadlines rescued"
            value={loading ? "…" : String(rescued)}
            tone="text-purple-600"
            icon={Zap}
          />
        </div>

        {/* Workspace overview: tasks, calendar, goals, habits, inbox */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <OverviewCard title="Tasks" icon={Target}>
            <OverviewRow label="Active" value={activeTasks.length} />
            <OverviewRow label="Overdue" value={overdueTasks.length} tone={overdueTasks.length ? "text-red-600" : undefined} />
            <OverviewRow label="High risk" value={highRiskTasks.length} tone={highRiskTasks.length ? "text-amber-600" : undefined} />
            <OverviewRow label="Completed" value={doneTasks.length} tone="text-green-600" />
          </OverviewCard>

          <OverviewCard title="Calendar (this week)" icon={Calendar}>
            <OverviewRow label="Events" value={weekEvents.length} />
            <OverviewRow label="Hours booked" value={`${bookedHoursWeek}h`} />
            <OverviewRow label="Focus blocks" value={focusBlocks} />
          </OverviewCard>

          <OverviewCard title="Goals" icon={Target}>
            <OverviewRow label="Active" value={activeGoals.length} />
            <OverviewRow label="Achieved" value={achievedGoals.length} tone="text-green-600" />
            <OverviewRow
              label="Milestones"
              value={`${goalMilestonesDone}/${goalMilestonesTotal || 0}`}
            />
          </OverviewCard>

          <OverviewCard title="Habits & Inbox" icon={Flame}>
            <OverviewRow label="Habits tracked" value={habitsTracked} />
            <OverviewRow label="Done today" value={`${habitsDoneToday}/${habitsTracked || 0}`} />
            <OverviewRow label="Best streak" value={`${bestStreak}d`} />
            <OverviewRow label="Drafts pending" value={pendingDrafts} />
            <OverviewRow label="Emails sent" value={sentDrafts} tone="text-green-600" />
          </OverviewCard>
        </div>

        {/* Live Agent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" />
              Live Agent Activity
              <Badge variant="secondary" className="ml-auto">
                {logs.length} events
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {logsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : logs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <Sparkles className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-medium">No agent activity yet</p>
                <p className="text-xs text-muted-foreground">
                  Talk to ResQ in the dashboard, or click &ldquo;Rescan risks&rdquo; to trigger the
                  Panic Engine.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => {
                  const Icon = TOOL_ICONS[log.tool] ?? TOOL_ICONS.default;
                  const isPanic = log.tool === "panicEngine";
                  return (
                    <div
                      key={log.id}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                        isPanic
                          ? "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20"
                          : "border-border/60 bg-card"
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg",
                          isPanic
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                            : "bg-primary/10 text-primary"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium leading-tight">{log.action}</p>
                          <span className="flex-shrink-0 text-xs text-muted-foreground">
                            {timeAgo(log.timestamp)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{log.reasoning}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats by tool / activity */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-primary" />
              Activity breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <ToolStat icon={Target} label="Tasks created" count={tasks.length} />
              <ToolStat icon={Calendar} label="Focus blocks" count={focusBlocks} />
              <ToolStat icon={Mail} label="Emails drafted" count={drafts.length} />
              <ToolStat icon={Send} label="Emails sent" count={sentDrafts} />
              <ToolStat icon={Target} label="Goals created" count={goals.length} />
              <ToolStat icon={Flame} label="Habits tracked" count={habitsTracked} />
              <ToolStat icon={AlertTriangle} label="High-risk tasks" count={highRiskTasks.length} />
              <ToolStat
                icon={Zap}
                label="Panic Engine runs"
                count={logs.filter((l) => l.tool === "panicEngine").length}
              />
              <ToolStat
                icon={FileText}
                label="Docs generated"
                count={logs.filter((l) => l.tool === "generateDeliverable").length}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone: string;
  icon: typeof Bot;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{label}</p>
          <Icon className="h-4 w-4 text-muted-foreground/50" />
        </div>
        <p className={cn("mt-1 text-2xl font-bold", tone)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function OverviewCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Bot;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

function OverviewRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/40 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold", tone)}>{value}</span>
    </div>
  );
}

function ToolStat({
  icon: Icon,
  label,
  count,
}: {
  icon: typeof Bot;
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold leading-none">{count}</p>
      </div>
    </div>
  );
}
