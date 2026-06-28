/**
 * Firestore helpers — client-side only.
 *
 * ResQ stores per-user sub-collections under `users/{uid}/...` so the security
 * rules can scope reads/writes to the requesting user.
 *
 * Drafts path:  `users/{uid}/drafts/{draftId}`
 */

"use client";

import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type QueryConstraint,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./client";
import type { DraftDocument } from "@/types/task";

/** Shape we accept when writing a new draft. `id` and `createdAt` are filled in. */
export type DraftInput = Omit<DraftDocument, "id" | "userId" | "createdAt"> & {
  /** Optional pre-generated id (e.g. the Gmail draft id). Otherwise Firestore auto-ids. */
  id?: string;
  /** Optional Gmail metadata to keep alongside the ResQ-side fields. */
  metadata?: Record<string, unknown>;
};

/** Throw a uniform error if Firestore isn't available — saves the caller a null-check. */
function assertDb(): NonNullable<typeof db> {
  if (!isFirebaseConfigured || !db) {
    throw new Error("Firestore is not configured (missing NEXT_PUBLIC_FIREBASE_* env vars)");
  }
  return db;
}

/** The drafts collection reference for a given user. */
function draftsCollection(userId: string) {
  return collection(assertDb(), "users", userId, "drafts");
}

/**
 * Save a draft to Firestore. Returns the document id.
 *
 * If `input.id` is supplied (e.g. you want the Firestore doc id to match the
 * Gmail draft id) we use `setDoc`; otherwise Firestore generates an id via
 * `addDoc` (we emulate that via a fresh ref + `setDoc`).
 */
export async function saveDraft(userId: string, input: DraftInput): Promise<string> {
  if (!userId) throw new Error("saveDraft: userId is required");

  const now = new Date().toISOString();
  const payload: DocumentData = {
    ...input,
    userId,
    createdAt: input.metadata?.createdAt ?? now,
    updatedAt: now,
    status: input.status ?? "pending",
    kind: input.kind ?? "email",
    generatedBy: input.generatedBy ?? "resq",
  };

  if (input.id) {
    const ref = doc(draftsCollection(userId), input.id);
    await setDoc(ref, payload, { merge: true });
    return input.id;
  }

  const ref = doc(draftsCollection(userId));
  await setDoc(ref, payload);
  return ref.id;
}

/**
 * List drafts for a user, newest first.
 *
 * If Firestore isn't configured, returns an empty array (graceful degradation
 * so the Inbox UI can render without crashing when Firebase env vars are missing).
 */
export async function listDrafts(
  userId: string,
  options: { status?: DraftDocument["status"]; limit?: number } = {}
): Promise<DraftDocument[]> {
  if (!userId) return [];
  if (!isFirebaseConfigured || !db) return [];

  const constraints: QueryConstraint[] = [orderBy("createdAt", "desc")];
  if (options.status) constraints.push(where("status", "==", options.status));
  if (typeof options.limit === "number") {
    const { limit } = await import("firebase/firestore");
    constraints.push(limit(options.limit));
  }

  const snap = await getDocs(query(draftsCollection(userId), ...constraints));

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      userId,
      ...data,
    } as DraftDocument;
  });
}

/**
 * Update the lifecycle status of a draft (pending → approved → sent, etc).
 * No-op if Firestore isn't configured.
 */
export async function updateDraftStatus(
  userId: string,
  draftId: string,
  status: DraftDocument["status"]
): Promise<void> {
  if (!userId || !draftId) return;
  if (!isFirebaseConfigured || !db) return;

  const ref = doc(draftsCollection(userId), draftId);
  const now = new Date().toISOString();
  const patch: DocumentData = { status, updatedAt: now };
  if (status === "approved") patch.approvedAt = now;
  if (status === "sent") patch.sentAt = now;
  await updateDoc(ref, patch);
}