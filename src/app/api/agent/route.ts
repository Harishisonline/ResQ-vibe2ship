import { NextRequest } from "next/server";
import {
  runAgent,
  planAgent,
  synthesizeAgent,
  type OrchestratorInput,
} from "@/lib/agent/orchestrator";
import { sanitizeReply } from "@/lib/minimax/sanitize";
import { store, seedDemoData } from "@/lib/store/mock-store";
import type { ToolResult } from "@/types/agent";

export const runtime = "nodejs";
export const maxDuration = 60;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Build a live AgentContext from the real in-memory store so the model is
 * always aware of the user's actual tasks / events / recent activity —
 * including anything they just created, updated, or deleted in the UI.
 */
function buildLiveContext(userId: string, userName: string) {
  seedDemoData(userId);
  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000 - 1);

  const allTasks = store.listTasks({ userId });
  const active = allTasks.filter((t) => t.status !== "done" && t.status !== "archived");
  const overdue = active.filter((t) => new Date(t.deadline) < now);
  const upcomingToday = active.filter((t) => {
    const d = new Date(t.deadline);
    return d >= dayStart && d <= dayEnd;
  });
  const highRisk = active.filter((t) => (t.riskScore ?? 0) > 50);

  const todaysEvents = store
    .listEvents({ userId, startAfter: dayStart.toISOString(), endBefore: dayEnd.toISOString() })
    .filter((e) => e.start.slice(0, 10) === now.toISOString().slice(0, 10));
  const busyMinutes = todaysEvents.reduce(
    (sum, e) => sum + Math.max(0, new Date(e.end).getTime() - new Date(e.start).getTime()),
    0
  );
  const busyHoursToday = Math.round((busyMinutes / 3_600_000) * 10) / 10;
  const profile = store.getProfile(userId);
  const workStartParts = profile.workHours.start.split(":").map(Number);
  const workEndParts = profile.workHours.end.split(":").map(Number);
  const workHoursToday =
    Math.max(
      0,
      workEndParts[0] + workEndParts[1] / 60 - (workStartParts[0] + workStartParts[1] / 60)
    ) || 8;
  const freeHoursToday = Math.max(0, Math.round((workHoursToday - busyHoursToday) * 10) / 10);

  const recentLogs = store.listAgentLogs(5, { userId });
  const recentActivity = recentLogs.map((l) => `${l.action} (${l.tool})`);

  return {
    user: {
      uid: userId,
      name: userName,
      energyPattern: profile.energyPattern,
      workHours: profile.workHours,
    },
    tasks: {
      active: active.length,
      overdue: overdue.length,
      upcomingToday: upcomingToday.length,
      highRisk: highRisk.length,
    },
    calendar: { busyHoursToday, freeHoursToday },
    recentActivity,
    taskList: allTasks,
    eventList: todaysEvents,
  };
}

export async function POST(req: NextRequest) {
  let body: Partial<OrchestratorInput> & {
    userName?: string;
    mode?: "plan" | "synthesize";
    assistantMessage?: unknown;
    toolResults?: { callId: string; name: string; result: ToolResult }[];
  };
  try {
    body = (await req.json()) as Partial<OrchestratorInput> & {
      userName?: string;
      mode?: "plan" | "synthesize";
      assistantMessage?: unknown;
      toolResults?: { callId: string; name: string; result: ToolResult }[];
    };
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body.userMessage || !body.userId) {
    return new Response(
      JSON.stringify({ error: "userId and userMessage are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const ctx = body.context ?? buildLiveContext(body.userId!, body.userName ?? "there");

  // ----- plan mode: return planned tool calls as JSON (no execution) -----
  if (body.mode === "plan") {
    try {
      const plan = await planAgent({
        userId: body.userId!,
        userMessage: body.userMessage!,
        history: body.history ?? [],
        context: ctx,
        executeTools: false,
        toolsOnly: true,
      });
      return Response.json(plan);
    } catch (err) {
      console.error("[api/agent] plan failed:", err);
      return Response.json(
        { error: "I couldn't plan that. Please try again." },
        { status: 500 }
      );
    }
  }

  // ----- synthesize mode: stream the final reply from tool results -----
  if (body.mode === "synthesize") {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const text = await synthesizeAgent({
            userId: body.userId!,
            userName: body.userName ?? "there",
            userMessage: body.userMessage!,
            history: body.history ?? [],
            context: ctx,
            assistantMessage: body.assistantMessage as never,
            toolResults: body.toolResults ?? [],
          });
          const clean = sanitizeReply(text);
          const chunkSize = 12;
          for (let i = 0; i < clean.length; i += chunkSize) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "text", chunk: clean.slice(i, i + chunkSize) })}\n\n`
              )
            );
            await new Promise((r) => setTimeout(r, 16));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", error: err instanceof Error ? err.message : String(err) })}\n\n`
            )
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  // ----- legacy single-shot streaming (default) -----
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const result = await runAgent({
          userId: body.userId!,
          userMessage: body.userMessage!,
          history: body.history ?? [],
          context: ctx,
          executeTools: true,
        });

        // Strip any residual thinking / tool-call tags before they reach the UI.
        const text = sanitizeReply(result.text);
        const chunkSize = 12;
        for (let i = 0; i < text.length; i += chunkSize) {
          const chunk = text.slice(i, i + chunkSize);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "text", chunk })}\n\n`)
          );
          await new Promise((r) => setTimeout(r, 16));
        }

        // Then send the actions
        for (const action of result.actions) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "action", action })}\n\n`)
          );
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", error: err instanceof Error ? err.message : String(err) })}\n\n`
          )
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export async function GET() {
  return new Response(
    JSON.stringify({
      status: "ok",
      agent: "ResQ",
      endpoints: { POST: "/api/agent" },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
