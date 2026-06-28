/**
 * POST /api/panic-engine
 *
 * Triggers the Panic Engine for a given user. In production this would be
 * called by Cloud Scheduler every 15 minutes. Here we expose it as an API
 * so the UI can also trigger it manually (the "Rescan risks" button).
 */

import { NextRequest } from "next/server";
import { runPanicEngine } from "@/lib/agent/panic-engine";
import { seedDemoData } from "@/lib/store/mock-store";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    userId?: string;
    executeActions?: boolean;
    useAgent?: boolean;
  };

  const userId = body.userId ?? "demo-user";
  // Ensure demo data exists for hackathon judges
  seedDemoData(userId);

  try {
    const result = await runPanicEngine(userId, {
      executeActions: body.executeActions ?? true,
      useAgent: body.useAgent ?? false,
    });
    return Response.json({ success: true, result });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return Response.json({
    status: "ok",
    description: "POST { userId } to trigger the Panic Engine for a user.",
  });
}