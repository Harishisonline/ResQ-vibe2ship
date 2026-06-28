"use client";

import { create } from "zustand";
import type { AgentAction } from "@/types/agent";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: AgentAction[];
  timestamp: number;
  isStreaming?: boolean;
}

interface AgentStore {
  messages: ChatMessage[];
  isProcessing: boolean;
  /** A prompt queued from elsewhere (e.g. a dashboard "break down" that needs
   *  clarification) that the chat should auto-send on mount. */
  pendingPrompt: string | null;
  /** When a UI "Break down" needs more detail, the next chat message should
   *  update THIS task and run breakDownTask — not create a new task via the LLM. */
  pendingBreakDown: {
    taskId: string;
    title: string;
    deadline?: string;
  } | null;
  addUserMessage: (content: string) => void;
  pushAssistantMessage: (content: string) => void;
  setPendingPrompt: (prompt: string | null) => void;
  setPendingBreakDown: (
    ctx: { taskId: string; title: string; deadline?: string } | null
  ) => void;
  startAssistantMessage: () => string;
  appendToMessage: (id: string, chunk: string) => void;
  addActionToMessage: (id: string, action: AgentAction) => void;
  finishMessage: (id: string) => void;
  setProcessing: (v: boolean) => void;
  clear: () => void;
  resetForUser: () => void;
}

export const useAgentStore = create<AgentStore>((set) => ({
  messages: [
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi! I'm ResQ, your autonomous productivity companion. Tell me what's coming up. A deadline? A project? A meeting? I'll handle the planning and you'll see every action I take.",
      timestamp: Date.now(),
    },
  ],
  isProcessing: false,
  pendingPrompt: null,
  pendingBreakDown: null,

  addUserMessage: (content) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: `user_${Date.now()}`,
          role: "user",
          content,
          timestamp: Date.now(),
        },
      ],
    })),

  pushAssistantMessage: (content) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: `assistant_${Date.now()}`,
          role: "assistant",
          content,
          timestamp: Date.now(),
        },
      ],
    })),

  setPendingPrompt: (prompt) => set({ pendingPrompt: prompt }),

  setPendingBreakDown: (ctx) => set({ pendingBreakDown: ctx }),

  startAssistantMessage: () => {
    const id = `assistant_${Date.now()}`;
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id,
          role: "assistant",
          content: "",
          timestamp: Date.now(),
          isStreaming: true,
        },
      ],
    }));
    return id;
  },

  appendToMessage: (id, chunk) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + chunk } : m
      ),
    })),

  addActionToMessage: (id, action) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id
          ? { ...m, actions: [...(m.actions ?? []), action] }
          : m
      ),
    })),

  finishMessage: (id) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, isStreaming: false } : m
      ),
    })),

  setProcessing: (v) => set({ isProcessing: v }),

  clear: () =>
    set({
      messages: [
        {
          id: "welcome",
          role: "assistant",
          content: "Chat cleared. What's next?",
          timestamp: Date.now(),
        },
      ],
      pendingPrompt: null,
      pendingBreakDown: null,
    }),

  // Used on account switch / sign-out so one user's chat never leaks into
  // another session. Resets to the standard welcome message.
  resetForUser: () =>
    set({
      messages: [
        {
          id: "welcome",
          role: "assistant",
          content:
            "Hi! I'm ResQ, your autonomous productivity companion. Tell me what's coming up. A deadline? A project? A meeting? I'll handle the planning and you'll see every action I take.",
          timestamp: Date.now(),
        },
      ],
      isProcessing: false,
      pendingPrompt: null,
      pendingBreakDown: null,
    }),
}));
