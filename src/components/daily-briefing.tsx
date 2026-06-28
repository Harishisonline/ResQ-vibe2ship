"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, Loader2, Scissors, Sparkles, Sunrise, Sun, Sunset, Moon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/components/auth-provider";
import { useCollection } from "@/hooks/use-collection";
import * as repo from "@/lib/data/repository";
import { panicScore, guideFor, groupTasksByParent } from "@/lib/agent/planner";
import { breakDownTaskAction, planMyDayAction, formatDayPlanSummary } from "@/lib/agent/actions";
import { useAgentStore } from "@/stores/agent-store";
import type { Task } from "@/types/task";

function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

function greetingIcon(d: Date) {
  const h = d.getHours();
  if (h < 12) return Sunrise;
  if (h < 17) return Sun;
  if (h < 21) return Sunset;
  return Moon;
}

function countdown(iso: string, now: Date): string {
  const d = new Date(iso);
  const mins = (d.getTime() - now.getTime()) / 60_000;
  if (mins < 0) {
    const late = Math.round(-mins / 60);
    return late > 0 ? `${late}h overdue` : "overdue";
  }
  if (mins < 60) return `in ${Math.round(mins)}m`;
  if (mins < 60 * 24) return `in ${Math.round(mins / 60)}h`;
  return `in ${Math.round(mins / 60 / 24)}d`;
}

export function DailyBriefing() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.uid ?? "demo-user";
  const { data: tasks, refresh } = useCollection<Task>(repo.tasks, userId);
  const { pushAssistantMessage, setPendingBreakDown } = useAgentStore();
  const [name, setName] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await repo.profile.get(userId);
        if (cancelled) return;
        setName(p.name?.trim() || user?.displayName || "");
      } catch {
        if (!cancelled) setName(user?.displayName ?? "");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, user?.displayName]);

  const now = new Date();
  const GreetIcon = greetingIcon(now);

  const active = useMemo(
    () => tasks.filter((t) => t.status !== "done" && t.status !== "archived"),
    [tasks]
  );

  const ranked = useMemo(() => {
    // Only top-level tasks qualify as "do this one first" — a chunk subtask
    // shouldn't be surfaced ahead of its parent.
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

  const top = ranked[0]?.t;
  const topHasChildren = ranked[0]?.hasChildren ?? false;
  const guide = top ? guideFor(top) : [];

  const handlePlanMyDay = async () => {
    setBusy(true);
    try {
      const res = await planMyDayAction(userId, { days: 2, maxTasks: 12 });
      pushAssistantMessage(formatDayPlanSummary(res));
      toast.success("Planned your day, opening chat…");
      router.push("/chat");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not plan your day");
    } finally {
      setBusy(false);
    }
  };

  const handleBreakDown = async () => {
    if (!top) return;
    setBusy(true);
    try {
      const res = await breakDownTaskAction(userId, top.id, {
        title: top.title,
        description: top.description,
        deadline: top.deadline,
      });
      if (res.needsClarification) {
        setPendingBreakDown({
          taskId: top.id,
          title: top.title,
          deadline: top.deadline,
        });
        pushAssistantMessage(
          `I want to break down "${top.title}" for you, but I need a little more detail first. ${res.question}`
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
      setBusy(false);
    }
  };

  if (active.length === 0) {
    return (
      <Card className="mb-4 border-primary/20 bg-gradient-to-br from-primary/5 to-orange-500/5 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {greeting(now)}{name ? `, ${name}` : ""}. You&apos;re all caught up.
            </p>
            <p className="text-xs text-muted-foreground">
              Tell ResQ what&apos;s coming up below and it&apos;ll break it into chunks and schedule it for you.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mb-4 border-primary/20 bg-gradient-to-br from-primary/5 to-orange-500/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <GreetIcon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {greeting(now)}{name ? `, ${name}` : ""}. Here&apos;s your focus.
            </p>
            <p className="text-xs text-muted-foreground">
              {active.length} active task{active.length === 1 ? "" : "s"}. Do this one first:
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="default" onClick={handlePlanMyDay} disabled={busy}>
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="mr-1.5 h-3.5 w-3.5" />}
            Plan my day
          </Button>
          {top && !top.tags.includes("chunk") && !topHasChildren && (
            <Button size="sm" variant="outline" onClick={handleBreakDown} disabled={busy}>
              <Scissors className="mr-1.5 h-3.5 w-3.5" />
              Break it down
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => router.push("/calendar")}>
            View calendar
          </Button>
        </div>
      </div>

      {top && (
        <div className="mt-3 rounded-lg border border-border/60 bg-card/70 p-3">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${top.riskLevel === "critical" ? "bg-red-500" : top.riskLevel === "warning" ? "bg-orange-500" : top.riskLevel === "watch" ? "bg-yellow-500" : "bg-emerald-500"}`} />
            <span className="truncate text-sm font-medium">{top.title}</span>
            <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
              {new Date(top.deadline) < now ? (
                <AlertTriangle className="h-3 w-3 text-red-500" />
              ) : (
                <CalendarClock className="h-3 w-3" />
              )}
              {countdown(top.deadline, now)}
            </span>
          </div>
          <div className="mt-2 flex items-start gap-1.5 rounded-md bg-primary/5 p-2">
            <Sparkles className="mt-0.5 h-3 w-3 flex-shrink-0 text-primary" />
            <p className="text-[11px] leading-relaxed text-foreground/80">
              <span className="font-medium">First step (5 min): </span>
              {guide[0]}
            </p>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Then: {guide.slice(1).join(" ")}
          </p>
        </div>
      )}
    </Card>
  );
}
