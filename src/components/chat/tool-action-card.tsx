"use client";

import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  FileText,
  Loader2,
  Mail,
  Mic,
  Pencil,
  Plus,
  Send,
  Target,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgentAction } from "@/types/agent";

const TOOL_META: Record<
  string,
  { icon: typeof Plus; label: string; tone: string; bg: string; emoji: string }
> = {
  createTask: {
    icon: Plus,
    label: "Created task",
    tone: "text-blue-700 dark:text-blue-300",
    bg: "border-blue-200 bg-blue-50/80 dark:border-blue-900 dark:bg-blue-950/30",
    emoji: "📝",
  },
  rescheduleTask: {
    icon: Calendar,
    label: "Rescheduled task",
    tone: "text-amber-700 dark:text-amber-300",
    bg: "border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/30",
    emoji: "🔁",
  },
  updateTaskStatus: {
    icon: CheckCircle2,
    label: "Updated status",
    tone: "text-green-700 dark:text-green-300",
    bg: "border-green-200 bg-green-50/80 dark:border-green-900 dark:bg-green-950/30",
    emoji: "✓",
  },
  draftEmail: {
    icon: Mail,
    label: "Drafted email",
    tone: "text-purple-700 dark:text-purple-300",
    bg: "border-purple-200 bg-purple-50/80 dark:border-purple-900 dark:bg-purple-950/30",
    emoji: "✉️",
  },
  blockFocusTime: {
    icon: Calendar,
    label: "Blocked focus time",
    tone: "text-indigo-700 dark:text-indigo-300",
    bg: "border-indigo-200 bg-indigo-50/80 dark:border-indigo-900 dark:bg-indigo-950/30",
    emoji: "🎯",
  },
  escalateRisk: {
    icon: AlertTriangle,
    label: "Escalated risk",
    tone: "text-orange-700 dark:text-orange-300",
    bg: "border-orange-200 bg-orange-50/80 dark:border-orange-900 dark:bg-orange-950/30",
    emoji: "⚠️",
  },
  generateDeliverable: {
    icon: FileText,
    label: "Generated document",
    tone: "text-teal-700 dark:text-teal-300",
    bg: "border-teal-200 bg-teal-50/80 dark:border-teal-900 dark:bg-teal-950/30",
    emoji: "📄",
  },
  createReminder: {
    icon: Mic,
    label: "Set reminder",
    tone: "text-pink-700 dark:text-pink-300",
    bg: "border-pink-200 bg-pink-50/80 dark:border-pink-900 dark:bg-pink-950/30",
    emoji: "⏰",
  },
  fetchCalendarEvents: {
    icon: Calendar,
    label: "Checked calendar",
    tone: "text-slate-700 dark:text-slate-300",
    bg: "border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/30",
    emoji: "🗓️",
  },
  fetchTasks: {
    icon: Target,
    label: "Loaded tasks",
    tone: "text-slate-700 dark:text-slate-300",
    bg: "border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/30",
    emoji: "📋",
  },
  createGoal: {
    icon: Target,
    label: "Created goal",
    tone: "text-cyan-700 dark:text-cyan-300",
    bg: "border-cyan-200 bg-cyan-50/80 dark:border-cyan-900 dark:bg-cyan-950/30",
    emoji: "🎯",
  },
};

function summarizeToolAction(action: AgentAction): string {
  const args = action.args;
  const result = action.result?.summary;
  if (result) return result;

  switch (action.tool) {
    case "createTask":
      return `"${args.title}" due ${formatRelativeDate(args.deadline as string)}, est. ${args.estimatedMinutes} min`;
    case "draftEmail":
      return `To: ${args.to}: "${args.subject}"`;
    case "blockFocusTime":
      return `"${args.title}" ${formatDateTime(args.start as string)} to ${formatDateTime(args.end as string)}`;
    case "generateDeliverable":
      return `${args.type}: ${args.title}`;
    case "escalateRisk":
      return `Risk raised to ${args.newRiskScore}/100: ${args.reason}`;
    case "createReminder":
      return `Set for ${formatDateTime(args.triggerAt as string)} (${args.strategy})`;
    default:
      return `${action.tool} executed`;
  }
}

function formatDateTime(iso: string | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatRelativeDate(iso: string | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "tomorrow";
    if (diffDays === -1) return "yesterday";
    if (diffDays > 0 && diffDays < 7) return `in ${diffDays} days`;
    if (diffDays < 0 && diffDays > -7) return `${Math.abs(diffDays)} days ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

export function ToolActionCard({ action }: { action: AgentAction }) {
  const router = useRouter();
  const meta = TOOL_META[action.tool] ?? {
    icon: Pencil,
    label: action.tool,
    tone: "text-slate-700",
    bg: "border-slate-200 bg-slate-50",
    emoji: "•",
  };
  const Icon = meta.icon;

  return (
    <Card
      className={cn(
        "animate-fade-in overflow-hidden border-l-4 border-l-primary/40",
        meta.bg
      )}
    >
      <div className="flex items-start gap-3 p-3">
        <div
          className={cn(
            "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white shadow-sm dark:bg-black/20",
            meta.tone
          )}
        >
          {action.status === "running" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : action.status === "failed" ? (
            <X className="h-4 w-4" />
          ) : (
            <Icon className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-2">
            <span className="text-sm">{meta.emoji}</span>
            <span className={cn("text-xs font-medium uppercase tracking-wide", meta.tone)}>
              {meta.label}
            </span>
            {action.status === "running" && (
              <Badge variant="secondary" className="h-4 px-1.5 py-0 text-[10px]">
                running
              </Badge>
            )}
            {action.status === "failed" && (
              <Badge variant="destructive" className="h-4 px-1.5 py-0 text-[10px]">
                failed
              </Badge>
            )}
          </div>
          <p className="text-sm leading-snug text-foreground/90">
            {summarizeToolAction(action)}
          </p>
          {action.error && (
            <p className="mt-1 text-xs text-destructive">{action.error}</p>
          )}
        </div>
        {action.status === "success" && action.tool === "draftEmail" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => router.push("/inbox")}
          >
            <Send className="mr-1 h-3 w-3" />
            Review
          </Button>
        )}
        {action.status === "success" && action.tool === "blockFocusTime" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => router.push("/calendar")}
          >
            View
          </Button>
        )}
      </div>
    </Card>
  );
}
