"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import {
  CalendarClock,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Scissors,
  Search,
  TrendingUp,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/auth-provider";
import { useCollection } from "@/hooks/use-collection";
import * as repo from "@/lib/data/repository";
import { pool } from "@/lib/data/pool";
import { panicScore, groupTasksByParent } from "@/lib/agent/planner";
import {
  breakDownTaskAction,
  planMyDayAction,
  prioritizeTasksAction,
  formatDayPlanSummary,
  completeTaskAction,
  deleteTaskAction,
} from "@/lib/agent/actions";
import { useAgentStore } from "@/stores/agent-store";
import type { Task, TaskPriority } from "@/types/task";

const PRIORITY_LABELS = ["", "P1", "P2", "P3", "P4", "P5"];
const PRIORITY_COLORS = [
  "",
  "bg-red-500",
  "bg-orange-500",
  "bg-yellow-500",
  "bg-blue-500",
  "bg-slate-400",
];

type FilterKey = "all" | "active" | "overdue" | "highRisk" | "done";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "overdue", label: "Overdue" },
  { key: "highRisk", label: "High risk" },
  { key: "done", label: "Completed" },
];

function formatDeadline(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = differenceInCalendarDays(d, now);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (diffDays === 0) return `Today · ${time}`;
  if (diffDays === 1) return `Tomorrow · ${time}`;
  if (diffDays === -1) return `Yesterday`;
  if (diffDays > 0 && diffDays < 7) return `In ${diffDays} days`;
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  return d.toLocaleDateString();
}

function formatSlotRange(start?: string, end?: string): string | null {
  if (!start || !end) return null;
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function toLocalInputValue(iso?: string): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 86_400_000);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

export default function TasksPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { pushAssistantMessage, setPendingBreakDown } = useAgentStore();
  const userId = user?.uid ?? "demo-user";
  const { data: tasks, loading, error, refresh } = useCollection<Task>(repo.tasks, userId);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterKey>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(false);
  const [actingTaskId, setActingTaskId] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  // New task form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState(toLocalInputValue());
  const [priority, setPriority] = useState<TaskPriority>(3);
  const [estimatedMinutes, setEstimatedMinutes] = useState(60);
  const [tags, setTags] = useState("");

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setDeadline(toLocalInputValue());
    setPriority(3);
    setEstimatedMinutes(60);
    setTags("");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      const ts = new Date().toISOString();
      await pool.tasks.create(userId, {
        userId,
        title: title.trim(),
        description: description.trim() || undefined,
        deadline: new Date(deadline).toISOString(),
        priority,
        status: "todo",
        estimatedMinutes,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        riskScore: 30,
        riskLevel: "safe",
        dependencies: [],
        attachments: [],
        reminders: [],
        source: "user",
        createdAt: ts,
        updatedAt: ts,
      });
      toast.success("Task created");
      resetForm();
      setDialogOpen(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setSaving(false);
    }
  };

  const toggleComplete = async (task: Task) => {
    const done = task.status !== "done";
    try {
      await completeTaskAction(userId, task.id, done);
      toast.success(done ? "Marked complete" : "Reopened");
      refresh();
    } catch {
      toast.error("Update failed");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTaskAction(userId, id);
      toast.success("Task deleted");
      refresh();
    } catch {
      toast.error("Delete failed");
    }
  };

  const handlePlanMyDay = async () => {
    setActing(true);
    try {
      const res = await planMyDayAction(userId, { days: 2, maxTasks: 12 });
      pushAssistantMessage(formatDayPlanSummary(res));
      toast.success("Planned your day, opening chat…");
      router.push("/chat");
      refresh();
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
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not re-prioritize");
    } finally {
      setActing(false);
    }
  };

  const handleBreakDown = async (task: Task) => {
    setActingTaskId(task.id);
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
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not break this down");
    } finally {
      setActingTaskId(null);
    }
  };

  const now = new Date();
  const filtered = tasks.filter((t) => {
    const matchesText =
      t.title.toLowerCase().includes(filter.toLowerCase()) ||
      t.description?.toLowerCase().includes(filter.toLowerCase());
    if (!matchesText) return false;
    switch (statusFilter) {
      case "active":
        return t.status !== "done" && t.status !== "archived";
      case "overdue":
        return t.status !== "done" && new Date(t.deadline) < now;
      case "highRisk":
        return (
          t.status !== "done" &&
          t.status !== "archived" &&
          (t.riskScore ?? 0) > 50
        );
      case "done":
        return t.status === "done";
      default:
        return true;
    }
  });

  // Sort by urgency x importance: highest panic first, completed last.
  const sorted = [...filtered].sort((a, b) => {
    const aDone = a.status === "done";
    const bDone = b.status === "done";
    if (aDone !== bDone) return aDone ? 1 : -1;
    return panicScore(b, now).score - panicScore(a, now).score;
  });

  // Nest chunk subtasks under their parent task (like goal milestones).
  const { top, childrenOf } = groupTasksByParent(sorted);

  const activeCount = tasks.filter((t) => t.status !== "done" && t.status !== "archived").length;
  const highRisk = tasks.filter((t) => (t.riskScore ?? 0) > 50).length;
  const dueToday = tasks.filter((t) => {
    if (t.status === "done") return false;
    return differenceInCalendarDays(new Date(t.deadline), now) === 0;
  }).length;

  const renderCard = (task: Task) => {
    const isDone = task.status === "done";
    const panic = panicScore(task, now);
    const children = childrenOf.get(task.id) ?? [];
    const childDone = children.filter((c) => c.status === "done").length;
    return (
      <Card
        className={`hover:border-border hover:shadow-md transition-all ${isDone ? "opacity-60" : ""}`}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <button
              onClick={() => toggleComplete(task)}
              className={`mt-0.5 h-5 w-5 flex-shrink-0 rounded-full border-2 transition-colors flex items-center justify-center ${
                isDone
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:border-primary"
              }`}
              aria-label="Mark complete"
            >
              {isDone && <CheckSquare className="h-3 w-3" />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${PRIORITY_COLORS[task.priority]}`} />
                <span className="text-xs font-medium text-muted-foreground">
                  {PRIORITY_LABELS[task.priority]}
                </span>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">
                  {formatDeadline(task.deadline)}
                </span>
                {(task.riskScore ?? 0) > 75 && (
                  <Badge variant="destructive" className="h-4 px-1.5 py-0 text-[10px]">
                    {task.riskScore}% risk
                  </Badge>
                )}
                {(task.riskScore ?? 0) > 50 && (task.riskScore ?? 0) <= 75 && (
                  <Badge className="h-4 px-1.5 py-0 text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                    {task.riskScore}% risk
                  </Badge>
                )}
                {(task.riskScore ?? 0) > 25 && (task.riskScore ?? 0) <= 50 && (
                  <Badge variant="secondary" className="h-4 px-1.5 py-0 text-[10px]">
                    {task.riskScore}% risk
                  </Badge>
                )}
                {!isDone && panic.score > 0 && (
                  <Badge
                    className={
                      "h-4 px-1.5 py-0 text-[10px] " +
                      (panic.level === "critical"
                        ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                        : panic.level === "warning"
                        ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                        : panic.level === "watch"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300")
                    }
                  >
                    {panic.score} panic
                  </Badge>
                )}
                {task.source === "agent" && (
                  <Badge variant="outline" className="h-4 px-1.5 py-0 text-[10px]">
                    AI
                  </Badge>
                )}
                {children.length > 0 && (
                  <Badge variant="outline" className="h-4 px-1.5 py-0 text-[10px]">
                    {childDone}/{children.length} subtasks
                  </Badge>
                )}
              </div>
              <div className="flex items-start gap-1">
                {children.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedTaskId((id) => (id === task.id ? null : task.id))
                    }
                    className="mt-0.5 flex-shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={expandedTaskId === task.id ? "Collapse schedule" : "Expand schedule"}
                  >
                    {expandedTaskId === task.id ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                )}
                <h3
                  className={`flex-1 font-medium leading-tight cursor-pointer ${isDone ? "line-through text-muted-foreground" : ""}`}
                  onClick={() =>
                    children.length > 0 &&
                    setExpandedTaskId((id) => (id === task.id ? null : task.id))
                  }
                >
                  {task.title}
                </h3>
              </div>
              {task.description && (
                <p className="mt-0.5 text-sm text-muted-foreground">{task.description}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-1">
                {task.tags
                  .filter((tag) => tag !== "chunk")
                  .map((tag) => (
                    <Badge key={tag} variant="outline" className="h-5 px-1.5 py-0 text-[10px]">
                      {tag}
                    </Badge>
                  ))}
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center gap-0.5">
              {!isDone && !task.tags.includes("chunk") && children.length === 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-primary"
                  onClick={() => handleBreakDown(task)}
                  disabled={actingTaskId !== null}
                  aria-label="Break down with AI"
                >
                  {actingTaskId === task.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Scissors className="h-3.5 w-3.5" />
                  )}
                  <span className="ml-1 hidden sm:inline">Break down</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(task.id)}
                aria-label="Delete task"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Subtask schedule — expand to see breakdown / plan-my-day times */}
          {children.length > 0 && expandedTaskId === task.id && (
            <div className="mt-3 space-y-2 border-t border-border/40 pt-3">
              <p className="text-xs font-medium text-muted-foreground">
                Subtask schedule · due {formatDeadline(task.deadline)}
              </p>
              <div className="overflow-x-auto rounded-md border border-border/50">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30 text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Time</th>
                      <th className="px-3 py-2 font-medium">Subtask</th>
                      <th className="px-3 py-2 font-medium w-16">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {children.map((child) => {
                      const cDone = child.status === "done";
                      const slot = formatSlotRange(child.scheduledStart, child.scheduledEnd);
                      return (
                        <tr key={child.id} className="border-b border-border/30 last:border-0 group">
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                            {slot ?? "Not scheduled"}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => toggleComplete(child)}
                                className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                                  cDone
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border hover:border-primary"
                                }`}
                                aria-label="Mark subtask complete"
                              >
                                {cDone && <Check className="h-2.5 w-2.5" />}
                              </button>
                              <span
                                className={`flex-1 text-sm ${cDone ? "text-muted-foreground line-through" : ""}`}
                              >
                                {child.title}
                              </span>
                              <button
                                onClick={() => handleDelete(child.id)}
                                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                                aria-label="Delete subtask"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {cDone ? "Done" : "Todo"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {children.length > 0 && expandedTaskId !== task.id && (
            <div className="mt-2 text-xs text-muted-foreground">
              {childDone}/{children.length} subtasks · click to view schedule
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
            <p className="text-sm text-muted-foreground">
              {activeCount} active · {highRisk} high risk · {dueToday} due today
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={refresh} aria-label="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrioritize} disabled={acting}>
              {acting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="mr-1.5 h-3.5 w-3.5" />}
              Re-prioritize
            </Button>
            <Button variant="outline" size="sm" onClick={handlePlanMyDay} disabled={acting}>
              {acting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="mr-1.5 h-3.5 w-3.5" />}
              Plan my day
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger render={<Button />}>
                <Plus className="mr-1.5 h-4 w-4" /> New task
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>New task</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="task-title">Title</Label>
                    <Input
                      id="task-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Submit ML project"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="task-desc">Description</Label>
                    <Textarea
                      id="task-desc"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Optional details"
                      rows={2}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="task-deadline">Deadline</Label>
                      <Input
                        id="task-deadline"
                        type="datetime-local"
                        value={deadline}
                        onChange={(e) => setDeadline(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="task-priority">Priority</Label>
                      <select
                        id="task-priority"
                        value={priority}
                        onChange={(e) => setPriority(Number(e.target.value) as TaskPriority)}
                        className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring"
                      >
                        {[1, 2, 3, 4, 5].map((p) => (
                          <option key={p} value={p}>
                            {PRIORITY_LABELS[p]} ({p === 1 ? "highest" : p === 5 ? "lowest" : "medium"})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="task-est">Est. minutes</Label>
                      <Input
                        id="task-est"
                        type="number"
                        min={5}
                        value={estimatedMinutes}
                        onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="task-tags">Tags (comma separated)</Label>
                      <Input
                        id="task-tags"
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                        placeholder="work, urgent"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={saving}>
                      {saving ? "Saving…" : "Create task"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="mb-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search tasks…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="relative">
            <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as FilterKey)}
              className="h-9 rounded-lg border border-input bg-transparent py-0 pl-8 pr-7 text-sm outline-none focus-visible:border-ring"
            >
              {FILTERS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <Card className="mb-3 border-amber-500/40 bg-amber-500/5">
            <CardContent className="text-sm text-amber-700 dark:text-amber-300 p-3">
              Couldn&apos;t reach the cloud task store. If an ad-blocker is on, disable it for this
              site, or your tasks are being saved locally in this browser.
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
            : sorted.length === 0
            ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <CheckSquare className="mb-3 h-12 w-12 text-muted-foreground/50" />
                    <p className="font-medium">No tasks here</p>
                    <p className="text-sm text-muted-foreground">
                      Add one with &ldquo;New task&rdquo; or tell ResQ in chat what&apos;s coming up.
                    </p>
                  </CardContent>
                </Card>
              )
            : top.map((parent) => (
                <Fragment key={parent.id}>{renderCard(parent)}</Fragment>
              ))}
        </div>
      </div>
    </div>
  );
}
