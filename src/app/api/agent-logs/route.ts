import { NextRequest } from "next/server";
import { seedDemoData, store } from "@/lib/store/mock-store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? "demo-user";
  const rawLimit = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(200, Math.floor(rawLimit))
    : 50;
  seedDemoData(userId);
  const logs = store.listAgentLogs(limit, { userId });
  return Response.json({ success: true, logs, total: logs.length });
}