"use client";

import { useState } from "react";
import { Check, Flame, Plus, RefreshCw, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import type { Goal, GoalMilestone, Habit } from "@/types/task";

function toLocalDateValue(iso?: string): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 14 * 86_400_000);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

/** Local calendar day key (yyyy-mm-dd) — avoids UTC rollover for "done today". */
function localDayKey(d: Date = new Date()): string {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function GoalsPage() {
  const { user } = useAuth();
  const userId = user?.uid ?? "demo-user";
  const {
    data: goals,
    loading: goalsLoading,
    refresh: refreshGoals,
  } = useCollection<Goal>(repo.goals, userId);
  const {
    data: habits,
    loading: habitsLoading,
    refresh: refreshHabits,
  } = useCollection<Habit>(repo.habits, userId);
  const [goalDialog, setGoalDialog] = useState(false);
  const [habitDialog, setHabitDialog] = useState(false);
  const [saving, setSaving] = useState(false);

  // Goal form
  const [gTitle, setGTitle] = useState("");
  const [gDesc, setGDesc] = useState("");
  const [gTarget, setGTarget] = useState(toLocalDateValue());
  const [gMilestones, setGMilestones] = useState("");

  // Habit form
  const [hName, setHName] = useState("");
  const [hFreq, setHFreq] = useState<Habit["frequency"]>("daily");

  const resetGoalForm = () => {
    setGTitle("");
    setGDesc("");
    setGTarget(toLocalDateValue());
    setGMilestones("");
  };

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gTitle.trim()) return toast.error("Title is required");
    setSaving(true);
    try {
      const targetIso = new Date(gTarget).toISOString();
      const milestones: GoalMilestone[] = gMilestones
        .split("\n")
        .map((m) => m.trim())
        .filter(Boolean)
        .map((title, i) => ({
          id: `m_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
          title,
          targetDate: targetIso,
          completed: false,
        }));
      await repo.goals.add(userId, {
        userId,
        title: gTitle.trim(),
        description: gDesc.trim() || undefined,
        targetDate: targetIso,
        linkedTasks: [],
        milestones: milestones as GoalMilestone[],
        status: "active",
        createdAt: new Date().toISOString(),
      });
      toast.success("Goal created");
      resetGoalForm();
      setGoalDialog(false);
      refreshGoals();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create goal");
    } finally {
      setSaving(false);
    }
  };

  const toggleMilestone = async (goal: Goal, milestoneIndex: number) => {
    const milestones = goal.milestones.map((m, i) =>
      i === milestoneIndex
        ? {
            ...m,
            id: m.id ?? `m_${goal.id}_${i}`,
            completed: !m.completed,
            completedAt: !m.completed ? new Date().toISOString() : undefined,
          }
        : m
    );
    try {
      await repo.goals.update(userId, goal.id, { milestones });
      refreshGoals();
    } catch {
      toast.error("Update failed");
    }
  };

  const deleteGoal = async (id: string) => {
    try {
      await repo.goals.remove(userId, id);
      toast.success("Goal deleted");
      refreshGoals();
    } catch {
      refreshGoals();
    }
  };

  const checkInHabit = async (habit: Habit) => {
    const today = localDayKey();
    if (habit.lastCompleted?.slice(0, 10) === today) {
      toast("Already checked in today");
      return;
    }
    const nextStreak = habit.streak + 1;
    try {
      await repo.habits.update(userId, habit.id, {
        streak: nextStreak,
        longestStreak: Math.max(habit.longestStreak, nextStreak),
        lastCompleted: new Date().toISOString(),
      });
      toast.success(`Checked in. ${nextStreak} day streak`);
      refreshHabits();
    } catch {
      toast.error("Check-in failed");
    }
  };

  const resetHabitForm = () => {
    setHName("");
    setHFreq("daily");
  };

  const handleCreateHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hName.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const ts = new Date().toISOString();
      await repo.habits.add(userId, {
        userId,
        name: hName.trim(),
        frequency: hFreq,
        streak: 0,
        longestStreak: 0,
        lastCompleted: undefined,
        createdAt: ts,
        history: [],
      });
      toast.success("Habit added");
      resetHabitForm();
      setHabitDialog(false);
      refreshHabits();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add habit");
    } finally {
      setSaving(false);
    }
  };

  const deleteHabit = async (id: string) => {
    try {
      await repo.habits.remove(userId, id);
      toast.success("Habit deleted");
      refreshHabits();
    } catch {
      refreshHabits();
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Goals &amp; Habits</h1>
            <p className="text-sm text-muted-foreground">Long-term outcomes and the loops that build them</p>
          </div>
          <Button variant="outline" size="icon" onClick={() => { refreshGoals(); refreshHabits(); }} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Goals</h2>
            <Dialog open={goalDialog} onOpenChange={setGoalDialog}>
              <DialogTrigger render={<Button size="sm" variant="outline" />}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> New goal
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>New goal</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateGoal} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="g-title">Title</Label>
                    <Input id="g-title" value={gTitle} onChange={(e) => setGTitle(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="g-desc">Description</Label>
                    <Textarea id="g-desc" value={gDesc} onChange={(e) => setGDesc(e.target.value)} rows={2} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="g-target">Target date</Label>
                    <Input id="g-target" type="date" value={gTarget} onChange={(e) => setGTarget(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="g-ms">Milestones (one per line)</Label>
                    <Textarea
                      id="g-ms"
                      value={gMilestones}
                      onChange={(e) => setGMilestones(e.target.value)}
                      rows={3}
                      placeholder="Literature review&#10;Model training&#10;Final writeup"
                    />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Create goal"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-4">
            {goalsLoading ? (
              <Skeleton className="h-32" />
            ) : goals.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  No goals yet. Create one, or ask ResQ in chat to set a long-term outcome.
                </CardContent>
              </Card>
            ) : (
              goals.map((goal) => {
                const done = goal.milestones.filter((m) => m.completed).length;
                const progress = goal.milestones.length
                  ? Math.round((done / goal.milestones.length) * 100)
                  : 0;
                return (
                  <Card key={goal.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                            <Target className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <CardTitle className="text-base">{goal.title}</CardTitle>
                            <p className="text-xs text-muted-foreground">
                              Target: {new Date(goal.targetDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{progress}%</Badge>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteGoal(goal.id)} aria-label="Delete goal">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Progress value={progress} className="h-2" />
                      <div className="space-y-1.5">
                        {goal.milestones.map((m, idx) => (
                          <button
                            key={m.id ?? `m-${goal.id}-${idx}`}
                            onClick={() => toggleMilestone(goal, idx)}
                            className="flex w-full items-center gap-2 text-sm text-left"
                          >
                            <span
                              className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                                m.completed ? "border-primary bg-primary text-primary-foreground" : "border-border"
                              }`}
                            >
                              {m.completed && <Check className="h-2.5 w-2.5" />}
                            </span>
                            <span className={m.completed ? "text-muted-foreground line-through" : ""}>{m.title}</span>
                          </button>
                        ))}
                        {goal.milestones.length === 0 && (
                          <p className="text-xs text-muted-foreground">No milestones. Toggle progress by editing the goal.</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Habits</h2>
            <Dialog open={habitDialog} onOpenChange={setHabitDialog}>
              <DialogTrigger render={<Button size="sm" variant="outline" />}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> New habit
              </DialogTrigger>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>New habit</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateHabit} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="h-name">Name</Label>
                    <Input id="h-name" value={hName} onChange={(e) => setHName(e.target.value)} placeholder="e.g. Read 20 pages" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="h-freq">Frequency</Label>
                    <select
                      id="h-freq"
                      value={hFreq}
                      onChange={(e) => setHFreq(e.target.value as Habit["frequency"])}
                      className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekdays">Weekdays</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Add habit"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {habitsLoading
              ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20" />)
              : habits.length === 0
              ? (
                  <Card className="sm:col-span-2">
                    <CardContent className="py-10 text-center text-sm text-muted-foreground">
                      No habits yet. Add one to start tracking a streak.
                    </CardContent>
                  </Card>
                )
              : habits.map((habit) => {
                  const today = localDayKey();
                  const checkedToday =
                    !!habit.lastCompleted && localDayKey(new Date(habit.lastCompleted)) === today;
                  return (
                    <Card key={habit.id}>
                      <CardContent className="flex items-center gap-3 p-4">
                        <div
                          className={`flex h-12 w-12 items-center justify-center rounded-full ${
                            habit.streak >= 7 ? "bg-gradient-to-br from-orange-500 to-red-500 text-white" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <Flame className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-tight">{habit.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {habit.streak} day streak · {habit.frequency}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant={checkedToday ? "secondary" : "default"}
                          onClick={() => checkInHabit(habit)}
                          disabled={checkedToday}
                        >
                          {checkedToday ? "Done today" : "Check in"}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteHabit(habit.id)} aria-label="Delete habit">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
          </div>
        </section>
      </div>
    </div>
  );
}
