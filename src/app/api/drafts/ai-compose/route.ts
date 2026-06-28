import { NextRequest } from "next/server";
import { chatComplete, isMiniMaxConfigured } from "@/lib/minimax/client";
import { sanitizeReply } from "@/lib/minimax/sanitize";

export const runtime = "nodejs";
export const maxDuration = 60;

const TONE_GUIDE: Record<string, string> = {
  professional:
    "Professional: clear, courteous, concise. No slang.",
  friendly: "Friendly: warm and conversational, but still polite.",
  concise: "Concise: get to the point in as few sentences as possible.",
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    to?: string;
    subject: string;
    context?: string;
    tone?: "professional" | "friendly" | "concise";
  };

  if (!body.subject?.trim()) {
    return Response.json({ error: "Subject is required" }, { status: 400 });
  }

  // Fallback when MiniMax isn't configured: produce a simple template body so
  // the feature still works end-to-end in demo/offline mode.
  if (!isMiniMaxConfigured) {
    const fallback = `Hi${body.to ? ` ${body.to.split("@")[0]}` : ""},\n\n${
      body.context?.trim() || body.subject.trim()
    }\n\nLet me know if you need anything else.\n\nBest regards`;
    return Response.json({ success: true, body: fallback });
  }

  const tone = body.tone ?? "professional";
  const toneGuide = TONE_GUIDE[tone] ?? TONE_GUIDE.professional;

  const system = [
    "You write emails on behalf of the user. Write ONLY the email body.",
    "Do not include subject, To, From, signature lines, or explanatory prose.",
    "Do not use em dashes. Plain text, ready to send.",
    toneGuide,
  ].join(" ");

  const userMsg = [
    `Subject: ${body.subject.trim()}`,
    body.to ? `Recipient: ${body.to.trim()}` : "",
    body.context?.trim() ? `What this email is about: ${body.context.trim()}` : "",
    "Write the email body now.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await chatComplete({
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      temperature: 0.6,
      max_tokens: 600,
    });
    const raw = res.choices[0]?.message?.content ?? "";
    const text = sanitizeReply(raw).trim();
    if (!text) {
      return Response.json({ error: "AI returned an empty email" }, { status: 502 });
    }
    return Response.json({ success: true, body: text });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "AI compose failed" },
      { status: 500 }
    );
  }
}
