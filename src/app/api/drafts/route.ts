import { NextRequest } from "next/server";
import { seedDemoData, store } from "@/lib/store/mock-store";
import type { DraftDocument } from "@/types/task";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? "demo-user";
  seedDemoData(userId);
  const drafts = store.listDrafts({ userId });
  return Response.json({ success: true, drafts, total: drafts.length });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    userId: string;
    subject: string;
    to?: string;
    bodyText: string;
    tone?: string;
    context?: string;
  };
  const id = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const draft: DraftDocument = {
    id,
    userId: body.userId,
    kind: "email",
    title: body.subject || "Draft",
    subject: body.subject,
    body: body.bodyText,
    status: "pending",
    generatedFor: "manual",
    generatedBy: "user",
    createdAt: now,
    tone: body.tone,
    context: body.context,
    metadata: { to: body.to, tone: body.tone, context: body.context },
  };
  store.saveDraft(draft);
  return Response.json({ success: true, draft });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as { id: string; userId: string; patch: Partial<DraftDocument> };
  const updated = store.updateDraft(body.id, body.patch);
  if (!updated) {
    return Response.json({ error: "Draft not found" }, { status: 404 });
  }
  return Response.json({ success: true, draft: updated });
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  const ok = store.deleteDraft(id);
  if (!ok) return Response.json({ error: "Draft not found" }, { status: 404 });
  return Response.json({ success: true });
}