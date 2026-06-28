import { NextRequest } from "next/server";
import { store, type EnergyPattern } from "@/lib/store/mock-store";

export const runtime = "nodejs";

const VALID: EnergyPattern[] = ["morning", "afternoon", "evening", "night"];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? "demo-user";
  return Response.json({ success: true, profile: store.getProfile(userId) });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as {
    userId: string;
    name?: string;
    energyPattern?: EnergyPattern;
    workHours?: { start: string; end: string };
  };
  if (!body.userId) return Response.json({ error: "userId is required" }, { status: 400 });
  if (body.energyPattern && !VALID.includes(body.energyPattern)) {
    return Response.json({ error: "Invalid energyPattern" }, { status: 400 });
  }
  const profile = store.saveProfile(body.userId, {
    name: body.name?.trim() || undefined,
    energyPattern: body.energyPattern,
    workHours: body.workHours,
  });
  return Response.json({ success: true, profile });
}
