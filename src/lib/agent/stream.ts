"use client";

/**
 * Stream agent responses from /api/agent.
 *
 * Phase 2 flow:
 *   1. POST /api/agent?mode=plan -> planned tool calls (no execution).
 *   2. Execute each tool client-side against the data repository.
 *   3. POST /api/agent?mode=synthesize -> stream the final reply.
 *
 * Mock mode (no MiniMax) short-circuits: the plan is already a complete reply
 * with pre-baked actions, so we just render text + actions and skip execution.
 */

import type { AgentAction } from "@/types/agent";
import { executeActions } from "@/lib/agent/client-executor";
import { buildClientContext } from "@/lib/agent/context";

interface StreamOptions {
  userId: string;
  userName: string;
  message: string;
  history: { role: "user" | "assistant" | "function"; content: string }[];
  onText: (chunk: string) => void;
  onAction: (action: AgentAction) => void;
  onDone: () => void;
  onError: (error: string) => void;
  /** Pass AbortSignal to allow the user to cancel mid-stream. */
  signal?: AbortSignal;
}

interface PlanResponse {
  isMock: boolean;
  text: string;
  actions: AgentAction[];
  assistantMessage: unknown;
}

function aborted(signal?: AbortSignal): boolean {
  return !!signal?.aborted;
}

export async function streamAgentResponse(opts: StreamOptions): Promise<void> {
  const { userId, userName, message, history, onText, onAction, onDone, onError, signal } =
    opts;

  try {
    if (aborted(signal)) return;

    const context = await buildClientContext(userId, userName);
    if (aborted(signal)) return;

    const planRes = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        userName,
        userMessage: message,
        history,
        context,
        mode: "plan",
      }),
      signal,
    });

    if (aborted(signal)) return;

    if (!planRes.ok) {
      onError(`Agent returned ${planRes.status}`);
      return;
    }

    const plan = (await planRes.json()) as PlanResponse & { error?: string };
    if (aborted(signal)) return;

    if (plan.error) {
      onError(plan.error);
      return;
    }

    // Mock mode: execute the planned actions client-side (so they actually
    // persist to the repository, same as real mode), then stream the reply.
    if (plan.isMock) {
      if (aborted(signal)) return;
      const executed = await executeActions(userId, plan.actions);
      if (aborted(signal)) return;
      for (const { action } of executed) onAction(action);
      await streamText(plan.text, onText, signal);
      if (!aborted(signal)) onDone();
      return;
    }

    // Real mode: execute planned actions client-side, then synthesize.
    const executed = await executeActions(userId, plan.actions);
    if (aborted(signal)) return;

    const toolResults = executed.map((e) => ({
      callId: e.action.callId ?? "",
      name: e.action.tool,
      result: e.result,
    }));
    for (const { action } of executed) onAction(action);

    if (aborted(signal)) return;

    const refreshedContext = await buildClientContext(userId, userName);

    const synthRes = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        userName,
        userMessage: message,
        history,
        context: refreshedContext,
        mode: "synthesize",
        assistantMessage: plan.assistantMessage,
        toolResults,
      }),
      signal,
    });

    if (aborted(signal)) return;

    if (!synthRes.ok) {
      onError(`Synthesize returned ${synthRes.status}`);
      return;
    }

    await readSse(synthRes, onText, onError, signal);
    if (!aborted(signal)) onDone();
  } catch (err) {
    if (aborted(signal)) return;
    onError(err instanceof Error ? err.message : String(err));
  }
}

async function streamText(
  text: string,
  onText: (c: string) => void,
  signal?: AbortSignal
) {
  const chunkSize = 12;
  for (let i = 0; i < text.length; i += chunkSize) {
    if (aborted(signal)) return;
    onText(text.slice(i, i + chunkSize));
    await new Promise((r) => setTimeout(r, 16));
  }
}

async function readSse(
  res: Response,
  onText: (c: string) => void,
  onError: (e: string) => void,
  signal?: AbortSignal
) {
  const reader = res.body?.getReader();
  if (!reader) {
    onError("No response body");
    return;
  }
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    if (aborted(signal)) {
      try {
        await reader.cancel();
      } catch {
        /* noop */
      }
      return;
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") return;
      try {
        const event = JSON.parse(payload);
        if (event.type === "text" && event.chunk) onText(event.chunk);
        else if (event.type === "error") onError(event.error ?? "Unknown error");
      } catch (err) {
        console.error("Failed to parse SSE event", err, payload);
      }
    }
  }
}
