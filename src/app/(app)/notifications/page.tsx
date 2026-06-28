"use client";

import { useRouter } from "next/navigation";
import {
  Bell,
  BellRing,
  CheckCircle2,
  Clock,
  ExternalLink,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useReminders } from "@/components/reminder-provider";
import { NUDGE_KIND_LABEL, type NudgeKind } from "@/lib/agent/reminder-engine";

const KIND_STYLES: Record<NudgeKind, string> = {
  overdue: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  due_soon: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  high_risk: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  starting_soon: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  ending_soon: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
};

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const diffMs = d.getTime() - Date.now();
  const absMin = Math.abs(Math.round(diffMs / 60_000));
  if (absMin < 60) return diffMs < 0 ? `${absMin}m ago` : `in ${absMin}m`;
  const absH = Math.round(absMin / 60);
  if (absH < 24) return diffMs < 0 ? `${absH}h ago` : `in ${absH}h`;
  const absD = Math.round(absH / 24);
  return diffMs < 0 ? `${absD}d ago` : `in ${absD}d`;
}

export default function NotificationsPage() {
  const router = useRouter();
  const { nudges, permission, requestPermission, dismiss, snooze, clearAll } = useReminders();
  const needsEnable = permission !== "granted" && permission !== "unsupported";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              {nudges.length > 0 ? (
                <BellRing className="h-5 w-5 text-primary" />
              ) : (
                <Bell className="h-5 w-5 text-muted-foreground" />
              )}
              Notifications
            </h1>
            <p className="text-sm text-muted-foreground">
              {nudges.length > 0
                ? `${nudges.length} active reminder${nudges.length === 1 ? "" : "s"} from ResQ`
                : "No active reminders right now."}
            </p>
          </div>
          {nudges.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearAll}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Clear all
            </Button>
          )}
        </div>

        {needsEnable && (
          <Card className="mb-4 border-primary/30 bg-primary/5">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Turn on proactive reminders</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  ResQ nudges you with the next concrete step before deadlines slip, and when focus
                  sessions start or end.
                </p>
              </div>
              <Button size="sm" onClick={() => requestPermission()}>
                Enable browser notifications
              </Button>
            </CardContent>
          </Card>
        )}

        {nudges.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle2 className="mb-3 h-12 w-12 text-emerald-500" />
              <p className="font-medium">You&apos;re all caught up</p>
              <p className="mt-1 text-sm text-muted-foreground">
                No overdue or at-risk tasks, and no sessions starting right now.
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push("/tasks")}>
                Go to tasks
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {nudges.map((n) => (
              <li key={n.id}>
                <Card className="hover:border-border hover:shadow-md transition-all">
                  <CardContent className="p-4">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <Badge className={cn("h-5 px-2 py-0 text-[10px]", KIND_STYLES[n.kind])}>
                        {NUDGE_KIND_LABEL[n.kind]}
                      </Badge>
                      <span className="truncate text-sm font-semibold">{n.title}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {fmtWhen(n.deadline)}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground/90">{n.message}</p>
                    {n.guide.length > 0 && (
                      <div className="mt-2 flex items-start gap-2 rounded-md bg-primary/5 p-2">
                        <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                        <p className="text-xs leading-relaxed text-foreground/80">{n.guide[0]}</p>
                      </div>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => snooze(n.id, 30)}
                      >
                        <Clock className="mr-1 h-3 w-3" /> Snooze 30m
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() =>
                          router.push(
                            n.kind === "starting_soon" || n.kind === "ending_soon"
                              ? "/calendar"
                              : "/tasks"
                          )
                        }
                      >
                        Open <ExternalLink className="ml-1 h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-7 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => dismiss(n.id)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
