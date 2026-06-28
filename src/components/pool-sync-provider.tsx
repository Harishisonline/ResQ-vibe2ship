"use client";

/**
 * Keeps the shared data pool in sync across tabs/pages.
 * Purges stale calendar blocks and mirrors active tasks into events.
 */

import { useEffect, useRef } from "react";
import { useAuth } from "@/components/auth-provider";
import { useCollection } from "@/hooks/use-collection";
import * as repo from "@/lib/data/repository";
import { isEventVisible, reconcilePool } from "@/lib/data/pool-sync";
import type { CalendarEvent, Task } from "@/types/task";

export function PoolSyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.uid ?? null;
  const { data: tasks } = useCollection<Task>(repo.tasks, userId);
  const { data: events } = useCollection<CalendarEvent>(repo.events, userId);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKeyRef = useRef("");

  useEffect(() => {
    if (!userId) return;

    const activeTop = tasks.filter(
      (t) =>
        t.status !== "done" &&
        t.status !== "archived" &&
        !t.tags.includes("chunk")
    );
    const visibleEvents = events.filter((e) => isEventVisible(e, tasks));
    const staleCount = events.length - visibleEvents.length;
    const missingCalendar = activeTop.some(
      (t) => !events.some((e) => e.linkedTaskId === t.id && isEventVisible(e, tasks))
    );

    const key = `${tasks.length}:${events.length}:${staleCount}:${missingCalendar}`;
    if (!staleCount && !missingCalendar) return;
    if (key === lastKeyRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      lastKeyRef.current = key;
      reconcilePool(userId).catch(() => {
        /* best-effort */
      });
    }, 400);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [userId, tasks, events]);

  return <>{children}</>;
}
