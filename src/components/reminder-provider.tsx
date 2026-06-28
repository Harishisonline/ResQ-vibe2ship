"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as repo from "@/lib/data/repository";
import { useAuth } from "@/components/auth-provider";
import { useCollection } from "@/hooks/use-collection";
import { computeNudges, computeEventNudges, type Nudge } from "@/lib/agent/reminder-engine";
import type { Task, CalendarEvent } from "@/types/task";

type Permission = "default" | "granted" | "denied" | "unsupported";

interface ReminderContextValue {
  nudges: Nudge[];
  permission: Permission;
  enabled: boolean;
  requestPermission: () => Promise<void>;
  dismiss: (id: string) => void;
  snooze: (id: string, minutes?: number) => void;
  clearAll: () => void;
}

const ReminderContext = createContext<ReminderContextValue | null>(null);

const SNOOZE_DEFAULT_MIN = 30;

export function ReminderProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.uid ?? null;
  const { data: tasks } = useCollection<Task>(repo.tasks, userId);
  const { data: events } = useCollection<CalendarEvent>(repo.events, userId);

  const [permission, setPermission] = useState<Permission>("default");
  const [enabled, setEnabled] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [snoozed, setSnoozed] = useState<Record<string, number>>({});
  const notifiedRef = useRef<Set<string>>(new Set());

  // Initialise permission + enabled flags on the client only.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as Permission);
    try {
      setEnabled(localStorage.getItem("resq.reminders.enabled") !== "0");
    } catch {
      /* ignore */
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result as Permission);
      if (result === "granted") {
        setEnabled(true);
        try {
          localStorage.setItem("resq.reminders.enabled", "1");
        } catch {
          /* ignore */
        }
        new Notification("Reminders on", {
          body: "ResQ will nudge you with the next concrete step before deadlines slip.",
        });
      }
    } catch {
      setPermission("denied");
    }
  }, []);

  // Recompute nudges on every data change and on a 30s tick so event-start
  // and deadline notifications fire close to the moment they apply.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const allNudges = useMemo(
    () => [
      ...computeNudges(tasks, new Date()),
      ...computeEventNudges(events, new Date(), 15, 15, tasks),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, events, tick]
  );

  const visibleNudges = useMemo(() => {
    const now = Date.now();
    return allNudges.filter((n) => {
      if (dismissed.has(n.id)) return false;
      const s = snoozed[n.id];
      if (s && s > now) return false;
      return true;
    });
  }, [allNudges, dismissed, snoozed]);

  const dismiss = useCallback((id: string) => {
    notifiedRef.current.delete(id);
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const snooze = useCallback((id: string, minutes: number = SNOOZE_DEFAULT_MIN) => {
    // Drop the "already notified" marker so a snoozed nudge re-fires when it
    // reappears after the snooze window.
    notifiedRef.current.delete(id);
    setSnoozed((prev) => ({
      ...prev,
      [id]: Date.now() + minutes * 60_000,
    }));
  }, []);

  const clearAll = useCallback(() => {
    setDismissed((prev) => {
      const next = new Set(prev);
      for (const n of visibleNudges) next.add(n.id);
      return next;
    });
  }, [visibleNudges]);

  // Fire browser notifications for nudges we haven't alerted yet this session.
  useEffect(() => {
    if (!enabled || permission !== "granted") return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    for (const n of visibleNudges) {
      if (notifiedRef.current.has(n.id)) continue;
      notifiedRef.current.add(n.id);
      try {
        new Notification(`ResQ: ${n.title}`, { body: n.message, tag: n.id });
      } catch {
        /* ignore */
      }
    }
  }, [visibleNudges, enabled, permission]);

  const value = useMemo<ReminderContextValue>(
    () => ({
      nudges: visibleNudges,
      permission,
      enabled,
      requestPermission,
      dismiss,
      snooze,
      clearAll,
    }),
    [visibleNudges, permission, enabled, requestPermission, dismiss, snooze, clearAll]
  );

  return <ReminderContext.Provider value={value}>{children}</ReminderContext.Provider>;
}

export function useReminders(): ReminderContextValue {
  const ctx = useContext(ReminderContext);
  if (!ctx) {
    throw new Error("useReminders must be used within a ReminderProvider");
  }
  return ctx;
}
