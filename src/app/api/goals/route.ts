import { NextRequest } from "next/server";
import { seedDemoData, store } from "@/lib/store/mock-store";
import type { Goal, GoalMilestone } from "@/types/task";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? "demo-user";
  seedDemoData(userId);
  const goals = store.listGoals({ userId });
  return Response.json({ success: true, goals, total: goals.length });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<Goal> & { userId: string };
  if (!body.userId) return Response.json({ error: "userId is required" }, { status: 400 });
  if (!body.title || !body.targetDate) {
    return Response.json({ error: "title and targetDate are required" }, { status: 400 });
  }
  const id = body.id ?? `goal_${Date.now()}`;
  const milestones: GoalMilestone[] = (body.milestones ?? []).map((m, i) => ({
    id: m.id ?? `${id}_m${i}`,
    title: m.title,
    targetDate: m.targetDate ?? body.targetDate!,
    completed: m.completed ?? false,
    completedAt: m.completedAt,
  }));
  const goal: Goal = {
    id,
    userId: body.userId,
    title: body.title,
    description: body.description,
    targetDate: body.targetDate,
    linkedTasks: body.linkedTasks ?? [],
    milestones,
    status: body.status ?? "active",
    createdAt: new Date().toISOString(),
  };
  store.saveGoal(goal);
  return Response.json({ success: true, goal });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as {
    id: string;
    userId: string;
    patch: Partial<Goal>;
    toggleMilestone?: string; // milestone id to flip
  };
  const existing = store.getGoal(body.id);
  if (!existing) return Response.json({ error: "Goal not found" }, { status: 404 });

  let next = existing;
  if (body.toggleMilestone) {
    next = {
      ...existing,
      milestones: existing.milestones.map((m) =>
        m.id === body.toggleMilestone
          ? {
              ...m,
              completed: !m.completed,
              completedAt: !m.completed ? new Date().toISOString() : undefined,
            }
          : m
      ),
    };
  }
  if (body.patch) next = { ...next, ...body.patch };
  const updated = store.updateGoal(body.id, next);
  return Response.json({ success: true, goal: updated });
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  const ok = store.deleteGoal(id);
  if (!ok) return Response.json({ error: "Goal not found" }, { status: 404 });
  return Response.json({ success: true });
}
