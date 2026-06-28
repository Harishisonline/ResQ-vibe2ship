import { NextResponse } from "next/server";
import { chatComplete, isMiniMaxConfigured } from "@/lib/minimax/client";
import { sanitizeReply } from "@/lib/minimax/sanitize";

export const runtime = "nodejs";

interface Chunk {
  title: string;
  minutes: number;
}

interface BreakDownResponse {
  chunks?: Chunk[];
  needsClarification?: boolean;
  question?: string;
}

/**
 * Pull a JSON object out of a model reply that may wrap it in prose or fences.
 */
function extractJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  try {
    return JSON.parse(candidate.trim());
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        /* ignore */
      }
    }
    return null;
  }
}

/**
 * Heuristic fallback used when MiniMax is not configured: if the task has no
 * description and a very short/generic title, ask for clarification. Otherwise
 * split by estimated effort with sequential step titles.
 */
function heuristicBreakDown(input: {
  title: string;
  description?: string;
  estimatedMinutes?: number;
}): BreakDownResponse {
  const title = input.title.trim();
  const description = (input.description ?? "").trim();
  const words = title.split(/\s+/).filter(Boolean);
  const vague = !description && words.length <= 2;
  const detailed = description.length >= 80 || description.split(/[.!?]/).filter(Boolean).length >= 2;
  if (vague && !detailed) {
    return {
      needsClarification: true,
      question: `What does "${title}" actually involve? Tell me the concrete steps or the outcome you need, and I'll break it into a plan.`,
    };
  }
  const total = Math.max(45, input.estimatedMinutes || 60);
  const chunkCount = Math.min(6, Math.max(2, Math.ceil(total / 45)));
  const per = Math.ceil(total / chunkCount);
  const chunks: Chunk[] = Array.from({ length: chunkCount }, (_, i) => ({
    title: description
      ? `Step ${i + 1}: ${words.slice(0, 4).join(" ")}${words.length > 4 ? "…" : ""}`
      : `${title} - step ${i + 1} of ${chunkCount}`,
    minutes: per,
  }));
  return { chunks };
}

export async function POST(req: Request) {
  let body: {
    title?: string;
    description?: string;
    estimatedMinutes?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  if (!isMiniMaxConfigured) {
    return NextResponse.json(
      heuristicBreakDown({ title, description: body.description, estimatedMinutes: body.estimatedMinutes })
    );
  }

  const system = `You are ResQ, a productivity planner. Given a task title and optional description, break it into 2 to 6 concrete, actionable subtasks that each take 20-60 minutes. Each subtask title must describe a specific physical next action, not a repeat of the parent.

If the description field contains substantive detail (more than one sentence or 80+ characters), ALWAYS break it into chunks — never ask for clarification.

If the task is too vague to break down meaningfully (for example a one-word title like "monitor" with no description), do NOT invent generic parts. Instead ask the user a short clarifying question.

Respond with ONLY one JSON object, no prose:
- To break it down: {"chunks":[{"title":"...","minutes":30}, ...]}
- To ask for clarification: {"needsClarification":true,"question":"..."}`;

  try {
    const res = await chatComplete({
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Title: ${title}\nDescription: ${body.description ?? "(none)"}\nEstimated minutes: ${body.estimatedMinutes ?? 60}`,
        },
      ],
      temperature: 0.4,
      max_tokens: 700,
    });

    const raw = res.choices[0]?.message?.content ?? "";
    const parsed = extractJson(raw);

    if (parsed && parsed.needsClarification === true) {
      const question = sanitizeReply(String(parsed.question ?? "")).trim();
      return NextResponse.json({
        needsClarification: true,
        question: question || `What does "${title}" actually involve? Give me 1-2 lines on the deliverable and I'll break it into steps.`,
      } as BreakDownResponse);
    }

    if (parsed && Array.isArray(parsed.chunks) && parsed.chunks.length > 0) {
      const chunks: Chunk[] = (parsed.chunks as unknown[])
        .map((c) => c as { title?: unknown; minutes?: unknown })
        .filter((c) => typeof c.title === "string" && c.title.trim())
        .map((c) => ({
          title: sanitizeReply(String(c.title)).slice(0, 120),
          minutes: typeof c.minutes === "number" && c.minutes > 0 ? c.minutes : 30,
        }))
        .slice(0, 6);
      if (chunks.length > 0) return NextResponse.json({ chunks });
    }

    // Fallback to heuristic if the model didn't return usable JSON.
    return NextResponse.json(
      heuristicBreakDown({ title, description: body.description, estimatedMinutes: body.estimatedMinutes })
    );
  } catch (err) {
    console.error("[break-down] model error:", err);
    return NextResponse.json(
      heuristicBreakDown({ title, description: body.description, estimatedMinutes: body.estimatedMinutes })
    );
  }
}
