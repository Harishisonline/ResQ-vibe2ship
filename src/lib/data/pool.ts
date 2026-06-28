/**
 * Unified data pool — single mutation path for tasks, events, goals, habits, drafts.
 * Every write triggers reconcilePool() so calendar, tasks, agent, and voice stay aligned.
 */

import * as repo from "@/lib/data/repository";
import { reconcilePool } from "@/lib/data/pool-sync";
import { refreshLinkedEvent } from "@/lib/data/calendar-sync";
import {
  completeTaskAction,
  deleteTaskAction,
  rescheduleTaskAction,
} from "@/lib/agent/actions";
import type { Task, CalendarEvent, Goal, Habit, DraftDocument } from "@/types/task";
import type { UserContextSchema } from "@/types/schema";

const CONTEXT_KEY = (uid: string) => `resq:local:context:${uid}`;

function defaultContext(uid: string): UserContextSchema {
  return { id: "main", userId: uid, updatedAt: new Date().toISOString() };
}

export function normalizeTask(
  data: Omit<Task, "id"> & Partial<Pick<Task, "id">>
): Omit<Task, "id"> & Partial<Pick<Task, "id">> {
  const isSubtask = data.tags?.includes("chunk") || data.entityType === "subtask";
  const parentId =
    data.parentId ??
    (isSubtask && data.dependencies?.[0] ? data.dependencies[0] : undefined);
  return {
    ...data,
    entityType: isSubtask ? "subtask" : "task",
    parentId,
    dependencies: parentId
      ? [parentId, ...(data.dependencies ?? []).filter((d) => d !== parentId)]
      : (data.dependencies ?? []),
  };
}

export const pool = {
  context: {
    async get(uid: string): Promise<UserContextSchema> {
      if (typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem(CONTEXT_KEY(uid));
          if (raw) return JSON.parse(raw) as UserContextSchema;
        } catch {
          /* ignore */
        }
      }
      return defaultContext(uid);
    },

    async save(
      uid: string,
      patch: Partial<Omit<UserContextSchema, "id" | "userId">>
    ): Promise<UserContextSchema> {
      const next: UserContextSchema = {
        ...(await this.get(uid)),
        ...patch,
        id: "main",
        userId: uid,
        updatedAt: new Date().toISOString(),
      };
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(CONTEXT_KEY(uid), JSON.stringify(next));
        } catch {
          /* ignore */
        }
      }
      return next;
    },
  },

  tasks: {
    async create(uid: string, data: Omit<Task, "id"> & Partial<Pick<Task, "id">>): Promise<Task> {
      const ts = new Date().toISOString();
      const task = await repo.tasks.add(
        uid,
        normalizeTask({
          ...data,
          createdAt: data.createdAt ?? ts,
          updatedAt: data.updatedAt ?? ts,
        }) as Omit<Task, "id"> & Partial<Pick<Task, "id">>
      );
      await reconcilePool(uid);
      return task;
    },

    async update(uid: string, id: string, patch: Partial<Task>): Promise<void> {
      await repo.tasks.update(uid, id, patch);
      if (patch.deadline) {
        const tasks = await repo.tasks.list(uid);
        const task = tasks.find((t) => t.id === id);
        if (task) await refreshLinkedEvent(uid, { ...task, ...patch });
      }
      await reconcilePool(uid);
    },

    async delete(uid: string, id: string): Promise<void> {
      await deleteTaskAction(uid, id);
    },

    async complete(uid: string, id: string, done: boolean): Promise<void> {
      await completeTaskAction(uid, id, done);
    },

    async reschedule(uid: string, id: string, newDeadline: string): Promise<void> {
      await rescheduleTaskAction(uid, id, newDeadline);
    },
  },

  events: {
    async create(
      uid: string,
      data: Omit<CalendarEvent, "id"> & Partial<Pick<CalendarEvent, "id">>
    ): Promise<CalendarEvent> {
      const event = await repo.events.add(uid, {
        ...data,
        linkedEntityType: data.linkedTaskId ? "task" : data.linkedEntityType,
      } as Omit<CalendarEvent, "id"> & Partial<Pick<CalendarEvent, "id">>);
      await reconcilePool(uid);
      return event;
    },

    async update(uid: string, id: string, patch: Partial<CalendarEvent>): Promise<void> {
      await repo.events.update(uid, id, patch);
      await reconcilePool(uid);
    },

    async delete(uid: string, id: string): Promise<void> {
      await repo.events.remove(uid, id);
      await reconcilePool(uid);
    },
  },

  goals: {
    async create(uid: string, data: Omit<Goal, "id"> & Partial<Pick<Goal, "id">>): Promise<Goal> {
      const ts = new Date().toISOString();
      return repo.goals.add(uid, { ...data, createdAt: data.createdAt ?? ts } as Goal);
    },

    async update(uid: string, id: string, patch: Partial<Goal>): Promise<void> {
      await repo.goals.update(uid, id, patch);
    },

    async delete(uid: string, id: string): Promise<void> {
      await repo.goals.remove(uid, id);
    },
  },

  habits: {
    async create(uid: string, data: Omit<Habit, "id"> & Partial<Pick<Habit, "id">>): Promise<Habit> {
      const ts = new Date().toISOString();
      return repo.habits.add(uid, { ...data, createdAt: data.createdAt ?? ts } as Habit);
    },

    async update(uid: string, id: string, patch: Partial<Habit>): Promise<void> {
      await repo.habits.update(uid, id, patch);
    },

    async delete(uid: string, id: string): Promise<void> {
      await repo.habits.remove(uid, id);
    },
  },

  drafts: {
    async create(
      uid: string,
      data: Omit<DraftDocument, "id"> & Partial<Pick<DraftDocument, "id">>
    ): Promise<DraftDocument> {
      const ts = new Date().toISOString();
      return repo.drafts.add(uid, { ...data, createdAt: data.createdAt ?? ts } as DraftDocument);
    },

    async update(uid: string, id: string, patch: Partial<DraftDocument>): Promise<void> {
      await repo.drafts.update(uid, id, patch);
    },

    async delete(uid: string, id: string): Promise<void> {
      await repo.drafts.remove(uid, id);
    },
  },

  reconcile: reconcilePool,
};
