"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Calendar,
  CheckSquare,
  Home,
  Inbox,
  LogOut,
  Menu,
  MessageSquare,
  Mic,
  Bell,
  Settings,
  Sparkles,
  Target,
} from "lucide-react";
import { useState } from "react";
import { ResQLogo } from "@/components/resq-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { ReminderBell } from "@/components/reminder-bell";
import { useReminders } from "@/components/reminder-provider";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { useCollection } from "@/hooks/use-collection";
import * as repo from "@/lib/data/repository";
import type { Task, DraftDocument } from "@/types/task";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/inbox", label: "Agent Inbox", icon: Inbox },
  { href: "/goals", label: "Goals & Habits", icon: Target },
  { href: "/voice", label: "Voice Mode", icon: Mic },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

function useSidebarCounts() {
  const { user } = useAuth();
  const userId = user?.uid ?? "demo-user";
  const { data: tasks } = useCollection<Task>(repo.tasks, userId);
  const { data: drafts } = useCollection<DraftDocument>(repo.drafts, userId);

  const activeTasks = tasks.filter(
    (t) =>
      t.status !== "done" &&
      t.status !== "archived" &&
      !t.tags.includes("chunk")
  ).length;
  const pendingDrafts = drafts.filter((d) => d.status === "pending").length;

  return { activeTasks, pendingDrafts };
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, isDemoMode, signOut } = useAuth();
  const { activeTasks, pendingDrafts } = useSidebarCounts();
  const { nudges } = useReminders();
  const reminderCount = nudges.length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-6">
        <Link href="/dashboard" onClick={onNavigate}>
          <ResQLogo size="md" />
        </Link>
      </div>

      <Separator />

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const isInbox = item.href === "/inbox";
          const isNotifications = item.href === "/notifications";
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                active
                  ? "bg-primary/10 text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <item.icon
                className={cn(
                  "h-4 w-4 transition-transform group-hover:scale-110",
                  active && "text-primary"
                )}
              />
              <span className="flex-1">{item.label}</span>
              {isInbox && pendingDrafts > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                  {pendingDrafts}
                </span>
              )}
              {isNotifications && reminderCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                  {reminderCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <Separator />

      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2 rounded-lg bg-gradient-to-br from-primary/10 to-orange-500/10 p-3">
          <Sparkles className="h-4 w-4 flex-shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium">Agent active</p>
            <p className="text-[11px] text-muted-foreground">
              {activeTasks > 0 ? `Watching ${activeTasks} task${activeTasks === 1 ? "" : "s"}` : "No active tasks"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg p-2">
          <Link
            href="/settings"
            onClick={onNavigate}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 transition-colors hover:bg-muted/60"
            aria-label="Open settings"
          >
            <Avatar className="h-8 w-8">
              <AvatarImage src={user?.photoURL ?? undefined} />
              <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                {user?.displayName?.[0]?.toUpperCase() ??
                  user?.email?.[0]?.toUpperCase() ??
                  "D"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">
                {user?.displayName ?? user?.email ?? "Demo User"}
                {isDemoMode && (
                  <span className="ml-1 rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
                    DEMO
                  </span>
                )}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {user?.email ?? "demo@resq.app"}
              </p>
            </div>
          </Link>
          <ReminderBell />
          <ThemeToggle />
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut()}
          className="w-full justify-start gap-2 text-xs text-muted-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </Button>
      </div>
    </div>
  );
}

export function AppSidebar() {
  return (
    <aside className="hidden w-64 flex-shrink-0 border-r border-border/60 bg-card/40 backdrop-blur md:flex md:flex-col">
      <SidebarContent />
    </aside>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <div className="flex h-14 items-center justify-between border-b border-border/60 bg-card/60 px-4 backdrop-blur">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Open navigation" />
            }
          >
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SidebarContent onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <Link href="/dashboard">
          <ResQLogo size="sm" />
        </Link>
        <ReminderBell />
      </div>
    </div>
  );
}
