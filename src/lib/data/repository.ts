"use client";

/**
 * Data repository — the single client-side data access layer.
 *
 * - When Firebase is configured, reads/writes go to Firestore via the client
 *   SDK (paths: users/{uid}/{collection}), with realtime `onSnapshot` updates.
 * - When Firebase is NOT configured (demo mode), it falls back to the existing
 *   REST `/api/*` routes backed by the in-memory mock store.
 *
 * Pages and the agent's client-side tool executor both go through this layer so
 * the storage backend is swappable without touching call sites.
 */

import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  type Unsubscribe,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase/client";
import type {
  Task,
  CalendarEvent,
  DraftDocument,
  Goal,
  Habit,
  AgentLog,
} from "@/types/task";
import type { UserProfile, EnergyPattern } from "@/lib/store/mock-store";

export type CollectionName =
  | "tasks"
  | "events"
  | "drafts"
  | "goals"
  | "habits"
  | "logs";

type AnyDoc = { id: string; userId: string };

// ----- mock (REST) helpers -----
const MOCK_POLL_MS = 6000;

function mockSubscribe<T>(
  route: string,
  coll: CollectionName,
  uid: string,
  cb: (items: T[]) => void
): Unsubscribe {
  let active = true;
  let delivered = false;
  const poll = async () => {
    try {
      const r = await fetch(`/api/${route}?userId=${encodeURIComponent(uid)}`);
      const d = await r.json();
      const items = (d[coll] as T[]) ?? [];
      if (active) {
        delivered = true;
        cb(items);
      }
    } catch {
      // First-attempt failure must still clear loading so the UI doesn't hang
      // forever; emit an empty list once, then keep retrying silently.
      if (active && !delivered) {
        delivered = true;
        cb([]);
      }
    }
  };
  poll();
  const id = setInterval(poll, MOCK_POLL_MS);
  return () => {
    active = false;
    clearInterval(id);
  };
}

// ----- local-storage fallback -----
// When Firebase IS configured but the browser blocks Firestore (ad-blockers,
// privacy shields, offline), writes/reads fail with ERR_BLOCKED_BY_CLIENT.
// Instead of hanging or losing data, we transparently fall back to a
// localStorage-backed store so the app keeps working in that browser.
let fsFailed = false;
let fallbackWarned = false;
const localListeners = new Map<string, Set<(items: unknown[]) => void>>();

function storageAvailable(): boolean {
  try {
    const k = "__resq_test__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function localKey(coll: CollectionName, uid: string): string {
  return `resq:local:${coll}:${uid}`;
}

function localRead<T extends AnyDoc>(coll: CollectionName, uid: string): T[] {
  if (!storageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(localKey(coll, uid));
    if (!raw) return [];
    const arr = JSON.parse(raw) as T[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function localWrite<T extends AnyDoc>(coll: CollectionName, uid: string, items: T[]): void {
  if (!storageAvailable()) return;
  try {
    window.localStorage.setItem(localKey(coll, uid), JSON.stringify(items));
  } catch {
    /* quota / private mode — ignore */
  }
  const key = localKey(coll, uid);
  const set = localListeners.get(key);
  if (set) set.forEach((cb) => cb(items as unknown[]));
}

// Cross-tab real-time sync: when another tab writes to localStorage, the
// `storage` event fires here with the new value, so every subscribed component
// in this tab updates live — mirroring Firestore onSnapshot across tabs.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (!e.key || !e.key.startsWith("resq:local:")) return;
    const set = localListeners.get(e.key);
    if (!set) return;
    let items: unknown[] = [];
    try {
      items = e.newValue ? (JSON.parse(e.newValue) as unknown[]) : [];
    } catch {
      return;
    }
    set.forEach((cb) => cb(items));
  });
}

function localSubscribe<T extends AnyDoc>(
  coll: CollectionName,
  uid: string,
  cb: (items: T[]) => void
): Unsubscribe {
  const key = localKey(coll, uid);
  const set = localListeners.get(key) ?? new Set();
  set.add(cb as (items: unknown[]) => void);
  localListeners.set(key, set);
  cb(localRead<T>(coll, uid));
  return () => {
    set.delete(cb as (items: unknown[]) => void);
    if (set.size === 0) localListeners.delete(key);
  };
}

/**
 * Register a "silent" local listener that does NOT emit immediately — only on
 * future local writes. Attached alongside the Firestore subscription so that if
 * Firestore later becomes blocked and writes start going to localStorage, this
 * component still updates live (instead of going stale until a manual refresh).
 *
 * The callback is gated on `fsFailed`: while THIS tab is still using Firestore
 * (fsFailed=false), local writes from a fallback tab must NOT overwrite the
 * healthy Firestore-backed UI with stale local data. Only once this tab has
 * also fallen back does it honor local notifications.
 */
function localListenOnly<T extends AnyDoc>(
  coll: CollectionName,
  uid: string,
  cb: (items: T[]) => void
): Unsubscribe {
  const key = localKey(coll, uid);
  const set = localListeners.get(key) ?? new Set();
  const wrapped = () => {
    if (!fsFailed) return; // healthy Firestore tab: local data is not authoritative
    cb(localRead<T>(coll, uid));
  };
  set.add(wrapped);
  localListeners.set(key, set);
  return () => {
    set.delete(wrapped);
    if (set.size === 0) localListeners.delete(key);
  };
}

function markFsFailed(): void {
  if (fsFailed) return;
  fsFailed = true;
  if (!fallbackWarned) {
    fallbackWarned = true;
    // Lazy import to avoid pulling the toast lib into SSR paths.
    import("sonner")
      .then(({ toast }) =>
        toast.warning(
          "Cloud sync is blocked (ad-blocker or network). Changes are saved locally in this browser for now.",
          { duration: 6000 }
        )
      )
      .catch(() => {});
  }
}

export function isLocalFallback(): boolean {
  return fsFailed;
}

/** Race a Firestore promise against a timeout so a blocked network can't hang the UI. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

// ----- Firestore helpers -----
function fsPath(coll: CollectionName, uid: string): string {
  return `users/${uid}/${coll}`;
}

/**
 * Recursively strip `undefined` values. Firestore rejects undefined field
 * values (unlike JSON, which drops them), so any optional field left blank
 * (description, context, linkedTaskId, etc.) must be removed before writing.
 */
function cleanUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => cleanUndefined(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = cleanUndefined(v);
    }
    return out as unknown as T;
  }
  return value;
}

function fsSubscribe<T extends AnyDoc>(
  coll: CollectionName,
  uid: string,
  cb: (items: T[]) => void
): Unsubscribe {
  if (!db) return () => {};
  const q =
    coll === "events"
      ? query(collection(db, fsPath(coll, uid)), orderBy("start", "asc"))
      : coll === "tasks"
      ? query(collection(db, fsPath(coll, uid)), orderBy("deadline", "asc"))
      : coll === "drafts"
      ? query(collection(db, fsPath(coll, uid)), orderBy("createdAt", "desc"))
      : coll === "logs"
      ? query(collection(db, fsPath(coll, uid)), orderBy("timestamp", "desc"))
      : coll === "goals"
      ? query(collection(db, fsPath(coll, uid)), orderBy("targetDate", "asc"))
      : collection(db, fsPath(coll, uid));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as T);
      cb(items);
    },
    (err) => {
      console.error(`[repo] ${coll} subscribe error:`, err);
      markFsFailed();
      cb([]);
    }
  );
}

// ----- Collection API -----
export interface CollectionApi<T extends AnyDoc> {
  list(uid: string): Promise<T[]>;
  subscribe(uid: string, cb: (items: T[]) => void): Unsubscribe;
  add(uid: string, data: Omit<T, "id"> & Partial<Pick<T, "id">>): Promise<T>;
  update(uid: string, id: string, patch: Partial<T>): Promise<void>;
  remove(uid: string, id: string): Promise<void>;
}

function makeCollection<T extends AnyDoc>(
  coll: CollectionName,
  mockPost: (uid: string, data: Omit<T, "id"> & Partial<Pick<T, "id">>) => Promise<T>,
  mockPatch: (uid: string, id: string, patch: Partial<T>) => Promise<void>,
  mockRoute?: string
): CollectionApi<T> {
  const route = mockRoute ?? coll;
  const useFs = () => isFirebaseConfigured && !!db && !fsFailed;
  return {
    async list(uid) {
      if (useFs()) {
        try {
          return await new Promise<T[]>((resolve) => {
            let settled = false;
            const off = fsSubscribe<T>(coll, uid, (items) => {
              if (settled) return;
              settled = true;
              off();
              // On a Firestore error, fsSubscribe calls back with [] *after*
              // marking the layer failed — deliver local data instead of empty.
              resolve(fsFailed ? localRead<T>(coll, uid) : items);
            });
            setTimeout(() => {
              if (settled) return;
              settled = true;
              off();
              markFsFailed();
              resolve(localRead<T>(coll, uid));
            }, 8000);
          });
        } catch {
          markFsFailed();
          return localRead<T>(coll, uid);
        }
      }
      if (fsFailed && storageAvailable()) return localRead<T>(coll, uid);
      const r = await fetch(`/api/${route}?userId=${encodeURIComponent(uid)}`);
      const d = await r.json();
      return (d[coll] as T[]) ?? [];
    },
    subscribe(uid, cb) {
      if (useFs()) {
        // Wrap so a later subscribe error flips the whole layer to local.
        const offFs = fsSubscribe<T>(coll, uid, (items) => {
          if (fsFailed) cb(localRead<T>(coll, uid));
          else cb(items);
        });
        // Also keep this component live if Firestore later fails and writes move
        // to localStorage — without this, an fs-era subscriber goes stale until
        // a manual refresh (the "draft vanished until I refreshed" bug).
        const offLocal = localListenOnly<T>(coll, uid, cb);
        return () => {
          offFs();
          offLocal();
        };
      }
      if (fsFailed && storageAvailable()) return localSubscribe<T>(coll, uid, cb);
      return mockSubscribe<T>(route, coll, uid, cb);
    },
    async add(uid, data) {
      if (useFs()) {
        try {
          const colRef = collection(db!, fsPath(coll, uid));
          const payload = cleanUndefined({ ...data, userId: uid });
          if (data.id) {
            await withTimeout(
              setDoc(doc(db!, fsPath(coll, uid), data.id), payload),
              6000
            );
            return { ...payload, id: data.id } as T;
          }
          const ref = await withTimeout(addDoc(colRef, payload), 6000);
          return { ...payload, id: ref.id } as T;
        } catch (e) {
          markFsFailed();
          return localAdd(coll, uid, data);
        }
      }
      if (fsFailed && storageAvailable()) return localAdd(coll, uid, data);
      return mockPost(uid, data);
    },
    async update(uid, id, patch) {
      if (useFs()) {
        try {
          await withTimeout(
            updateDoc(doc(db!, fsPath(coll, uid), id), cleanUndefined(patch as Record<string, unknown>)),
            6000
          );
          return;
        } catch {
          markFsFailed();
          localPatch(coll, uid, id, patch);
          return;
        }
      }
      if (fsFailed && storageAvailable()) {
        localPatch(coll, uid, id, patch);
        return;
      }
      return mockPatch(uid, id, patch);
    },
    async remove(uid, id) {
      if (useFs()) {
        try {
          await withTimeout(deleteDoc(doc(db!, fsPath(coll, uid), id)), 6000);
          return;
        } catch {
          markFsFailed();
          localRemove(coll, uid, id);
          return;
        }
      }
      if (fsFailed && storageAvailable()) {
        localRemove(coll, uid, id);
        return;
      }
      const r = await fetch(`/api/${route}?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error(`DELETE /api/${route} failed: ${r.status}`);
    },
  };
}

// ----- local CRUD helpers -----
function localAdd<T extends AnyDoc>(
  coll: CollectionName,
  uid: string,
  data: Omit<T, "id"> & Partial<Pick<T, "id">>
): T {
  const items = localRead<T>(coll, uid);
  const id = data.id ?? `local-${coll}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const doc = { ...(data as object), id, userId: uid } as T;
  const next = [doc, ...items];
  localWrite(coll, uid, next);
  return doc;
}

function localPatch<T extends AnyDoc>(
  coll: CollectionName,
  uid: string,
  id: string,
  patch: Partial<T>
): void {
  const items = localRead<T>(coll, uid);
  const next = items.map((it) =>
    it.id === id ? ({ ...it, ...cleanUndefined(patch as Record<string, unknown>) } as T) : it
  );
  localWrite(coll, uid, next);
}

function localRemove<T extends AnyDoc>(coll: CollectionName, uid: string, id: string): void {
  const items = localRead<T>(coll, uid);
  localWrite(
    coll,
    uid,
    items.filter((it) => it.id !== id)
  );
}

// ----- Mock POST/PATCH adapters (match existing /api route shapes) -----
async function postJson(url: string, body: unknown) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${url} failed (${r.status})`);
  return r.json();
}

async function patchJson(url: string, body: unknown) {
  const r = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${url} failed (${r.status})`);
}

async function patchReturn<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${url} failed (${r.status})`);
  return (await r.json()) as T;
}

export const tasks = makeCollection<Task>(
  "tasks",
  async (uid, data) => (await postJson("/api/tasks", { ...data, userId: uid, source: data.source ?? "user" })).task,
  async (uid, id, patch) => patchJson("/api/tasks", { id, userId: uid, patch })
);

export const events = makeCollection<CalendarEvent>(
  "events",
  async (uid, data) => (await postJson("/api/events", { ...data, userId: uid, source: data.source ?? "manual" })).event,
  async (uid, id, patch) => patchJson("/api/events", { id, userId: uid, patch })
);

export const drafts = makeCollection<DraftDocument>(
  "drafts",
  async (uid, data) =>
    (
      await postJson("/api/drafts", {
        userId: uid,
        subject: data.subject ?? data.title ?? "Draft",
        to: (data.metadata as { to?: string } | undefined)?.to,
        bodyText: data.body ?? "",
        tone: data.tone,
        context: data.context,
      })
    ).draft,
  async (uid, id, patch) => patchJson("/api/drafts", { id, userId: uid, patch })
);

export const goals = makeCollection<Goal>(
  "goals",
  async (uid, data) => (await postJson("/api/goals", { ...data, userId: uid })).goal,
  async (uid, id, patch) => patchJson("/api/goals", { id, userId: uid, patch })
);

export const habits = makeCollection<Habit>(
  "habits",
  async (uid, data) => (await postJson("/api/habits", { ...data, userId: uid })).habit,
  async (uid, id, patch) => patchJson("/api/habits", { id, userId: uid, patch })
);

export const logs = makeCollection<AgentLog>(
  "logs",
  // No public POST for logs; agent logs are written by the client executor.
  async (uid, data) => ({ ...data, userId: uid } as AgentLog),
  async (_uid, _id, _patch) => {
    /* no-op */
  },
  "agent-logs"
);

// ----- Profile (single doc per user) -----
const PROFILE_KEY = (uid: string) => `resq:local:profile:${uid}`;

function localProfileGet(uid: string): UserProfile {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY(uid));
    if (raw) return JSON.parse(raw) as UserProfile;
  } catch {
    /* ignore */
  }
  return {
    userId: uid,
    name: undefined,
    energyPattern: "morning",
    workHours: { start: "09:00", end: "17:00" },
    updatedAt: new Date().toISOString(),
  };
}

function localProfileSave(uid: string, patch: Partial<Omit<UserProfile, "userId">>): UserProfile {
  const next = {
    ...localProfileGet(uid),
    ...patch,
    userId: uid,
    updatedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(PROFILE_KEY(uid), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export const profile = {
  async get(uid: string): Promise<UserProfile> {
    if (isFirebaseConfigured && db && !fsFailed) {
      try {
        const { getDoc } = await import("firebase/firestore");
        const snap = await withTimeout(getDoc(doc(db, `users/${uid}/profile/main`)), 6000);
        if (snap.exists()) return snap.data() as UserProfile;
        return {
          userId: uid,
          name: undefined,
          energyPattern: "morning",
          workHours: { start: "09:00", end: "17:00" },
          updatedAt: new Date().toISOString(),
        };
      } catch {
        markFsFailed();
        return localProfileGet(uid);
      }
    }
    if (fsFailed && storageAvailable()) return localProfileGet(uid);
    const r = await fetch(`/api/profile?userId=${encodeURIComponent(uid)}`);
    const d = await r.json();
    return d.profile as UserProfile;
  },
  async save(
    uid: string,
    patch: Partial<Omit<UserProfile, "userId">>
  ): Promise<UserProfile> {
    if (isFirebaseConfigured && db && !fsFailed) {
      try {
        const next = cleanUndefined({
          ...patch,
          userId: uid,
          updatedAt: new Date().toISOString(),
        }) as UserProfile;
        await withTimeout(
          setDoc(doc(db, `users/${uid}/profile/main`), next, { merge: true }),
          6000
        );
        return (await this.get(uid)) as UserProfile;
      } catch {
        markFsFailed();
        return localProfileSave(uid, patch);
      }
    }
    if (fsFailed && storageAvailable()) return localProfileSave(uid, patch);
    const r = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: uid, ...patch }),
    });
    const d = await r.json();
    return d.profile as UserProfile;
  },
};

export type { EnergyPattern };
