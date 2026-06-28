import { NextRequest } from "next/server";
import { seedDemoData, store } from "@/lib/store/mock-store";
import type { Task } from "@/types/task";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? "demo-user";
  seedDemoData(userId);
  const tasks = store.listTasks({ userId });
  return Response.json({ success: true, tasks, total: tasks.length });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<Task> & { userId: string };
  if (!body.userId) {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }
  const id = body.id ?? `task_${Date.now()}`;
  const task: Task = {
    id,
    userId: body.userId,
    title: body.title ?? "Untitled task",
    description: body.description,
    deadline: body.deadline ?? new Date(Date.now() + 86_400_000).toISOString(),
    priority: body.priority ?? 3,
    status: body.status ?? "todo",
    estimatedMinutes: body.estimatedMinutes ?? 60,
    actualMinutes: body.actualMinutes,
    tags: body.tags ?? [],
    riskScore: body.riskScore ?? 20,
    riskLevel: body.riskLevel ?? "safe",
    dependencies: body.dependencies ?? [],
    attachments: body.attachments ?? [],
    reminders: body.reminders ?? [],
    source: body.source ?? "user",
    createdAt: body.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: body.completedAt,
  };
  store.saveTask(task);
  return Response.json({ success: true, task });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as { id: string; userId: string; patch: Partial<Task> };
  const updated = store.updateTask(body.id, body.patch);
  if (!updated) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }
  return Response.json({ success: true, task: updated });
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  const ok = store.deleteTask(id);
  if (!ok) return Response.json({ error: "Task not found" }, { status: 404 });
  return Response.json({ success: true });
}