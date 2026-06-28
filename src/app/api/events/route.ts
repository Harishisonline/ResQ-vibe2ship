import { NextRequest } from "next/server";
import { seedDemoData, store } from "@/lib/store/mock-store";
import type { CalendarEvent } from "@/types/task";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? "demo-user";
  seedDemoData(userId);
  const startAfter = url.searchParams.get("startAfter") ?? undefined;
  const endBefore = url.searchParams.get("endBefore") ?? undefined;
  const events = store.listEvents({ userId, startAfter, endBefore });
  return Response.json({ success: true, events, total: events.length });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<CalendarEvent> & { userId: string };
  if (!body.userId) return Response.json({ error: "userId is required" }, { status: 400 });
  if (!body.start || !body.end) {
    return Response.json({ error: "start and end are required" }, { status: 400 });
  }
  const id = body.id ?? `event_${Date.now()}`;
  const event: CalendarEvent = {
    id,
    userId: body.userId,
    source: body.source ?? "manual",
    sourceRef: body.sourceRef,
    title: body.title ?? "Untitled event",
    description: body.description,
    start: body.start,
    end: body.end,
    kind: body.kind ?? "personal",
    linkedTaskId: body.linkedTaskId,
  };
  store.saveEvent(event);
  return Response.json({ success: true, event });
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  const ok = store.deleteEvent(id);
  if (!ok) return Response.json({ error: "Event not found" }, { status: 404 });
  return Response.json({ success: true });
}
