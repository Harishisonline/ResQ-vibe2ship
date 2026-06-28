/**
 * Firestore type helpers — utility types for collections and docs
 */

import type {
  Task,
  DraftDocument,
  AgentLog,
  CalendarEvent,
  UserProfile,
  Goal,
  Habit,
} from "./task";
import type { UserContextSchema } from "./schema";

export interface FirestoreCollections {
  users: { [uid: string]: UserProfile };
  tasks: { [taskId: string]: Task };
  drafts: { [draftId: string]: DraftDocument };
  events: { [eventId: string]: CalendarEvent };
  goals: { [goalId: string]: Goal };
  habits: { [habitId: string]: Habit };
  agentLogs: { [logId: string]: AgentLog };
  context: { main: UserContextSchema };
}
