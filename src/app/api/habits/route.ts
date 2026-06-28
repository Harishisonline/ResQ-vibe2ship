import { NextRequest } from "next/server";
import { seedDemoData, store } from "@/lib/store/mock-store";
import type { Habit } from "@/types/task";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? "demo-user";
  seedDemoData(userId);
  const habits = store.listHabits({ userId });
  return Response.json({ success: true, habits, total: habits.length });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<Habit> & { userId: string };
  if (!body.userId) return Response.json({ error: "userId is required" }, { status: 400 });
  if (!body.name) return Response.json({ error: "name is required" }, { status: 400 });
  const id = body.id ?? `habit_${Date.now()}`;
  const habit: Habit = {
    id,
    userId: body.userId,
    name: body.name,
    frequency: body.frequency ?? "daily",
    customDays: body.customDays,
    streak: body.streak ?? 0,
    longestStreak: body.longestStreak ?? 0,
    history: body.history ?? [],
    createdAt: new Date().toISOString(),
  };
  store.saveHabit(habit);
  return Response.json({ success: true, habit });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as {
    id: string;
    userId: string;
    patch?: Partial<Habit>;
    checkIn?: boolean; // increment streak + record today
  };
  const existing = store.listHabits({ userId: body.userId }).find((h) => h.id === body.id);
  if (!existing) return Response.json({ error: "Habit not found" }, { status: 404 });

  let next = existing;
  if (body.checkIn) {
    const today = new Date().toISOString().slice(0, 10);
    const alreadyToday = existing.lastCompleted?.slice(0, 10) === today;
    if (!alreadyToday) {
      const newStreak = existing.streak + 1;
      next = {
        ...existing,
        streak: newStreak,
        longestStreak: Math.max(existing.longestStreak, newStreak),
        lastCompleted: new Date().toISOString(),
        history: [...existing.history, { date: today, completed: true }],
      };
    }
  }
  if (body.patch) next = { ...next, ...body.patch };
  const updated = store.updateHabit(body.id, next);
  return Response.json({ success: true, habit: updated });
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  const ok = store.deleteHabit(id);
  if (!ok) return Response.json({ error: "Habit not found" }, { status: 404 });
  return Response.json({ success: true });
}
