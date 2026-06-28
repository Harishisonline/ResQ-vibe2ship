/**
 * Demo Mode — a scripted, offline walkthrough of the voice page.
 *
 * Used when no live voice provider (e.g. MiniMax) is configured — the common
 * case during the hackathon demo when judges hit the page before a key has
 * been wired up. Plays back a realistic ResQ conversation with timed
 * transcript chunks, a tool call, and a spoken acknowledgement — no network
 * required.
 */

import type {
  ToolCallEvent,
  TranscriptTurn,
  VoiceSession,
  VoiceStatus,
} from "@/lib/voice/types";

export interface DemoHandle {
  stop: () => void;
  /** Expose a no-op sendText for shape parity with VoiceSession. */
  sendText: (text: string) => void;
  status: () => VoiceStatus;
}

interface DemoCallbacks {
  onStatus: (s: VoiceStatus) => void;
  onTranscript: (turn: TranscriptTurn) => void;
  onTranscriptUpdate: (id: string, text: string, partial: boolean) => void;
  onToolCall: (call: ToolCallEvent) => void;
  onError: (err: Error) => void;
}

// The script is intentionally light — enough to demo the UX in <90 seconds.
const SCRIPT: Array<{
  delayMs: number;
  role: "user" | "assistant" | "system";
  // Either a fixed string or an array of progressively-richer partial chunks.
  text: string | string[];
  tool?: { name: string; args: Record<string, unknown> };
}> = [
  { delayMs: 200, role: "system", text: "Voice session ready · demo mode" },
  { delayMs: 900, role: "user", text: ["Hey ResQ, ", "what's about to blow up?"] },
  {
    delayMs: 1700,
    role: "assistant",
    text: [
      "Looking at your week. ",
      "Looking at your week. The project proposal is at 68% risk. ",
      "Looking at your week. The project proposal is at 68% risk. You've got three tasks stacked against Friday's deadline and only 4 hours of free time today.",
    ],
  },
  {
    delayMs: 600,
    role: "assistant",
    text: "Want me to block two 90-minute focus sessions and draft a heads-up to your advisor?",
  },
  {
    delayMs: 900,
    role: "user",
    text: ["Yeah, block them", " tomorrow morning and let my advisor know I'll need an extension."],
  },
  {
    delayMs: 1100,
    role: "assistant",
    text: "On it. Pulling up your calendar.",
    tool: {
      name: "fetchCalendarEvents",
      args: { startDate: "2026-06-24", endDate: "2026-06-26" },
    },
  },
  {
    delayMs: 900,
    role: "assistant",
    text: "Blocking tomorrow 9 to 10:30 and 10:45 to 12:15. Drafting the advisor email now. Review in Inbox.",
    tool: {
      name: "blockFocusTime",
      args: {
        start: "2026-06-24T09:00:00Z",
        end: "2026-06-24T10:30:00Z",
        title: "Project proposal: deep work",
      },
    },
  },
  {
    delayMs: 800,
    role: "assistant",
    text: "Done. You're on the clock. See you in chat for the email review.",
  },
];

/**
 * Start the scripted demo. Resolves immediately and runs asynchronously.
 * Returns a `VoiceSession`-compatible handle.
 */
export function startDemoSession(callbacks: DemoCallbacks): DemoHandle {
  const id = (prefix: string) =>
    `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  let stopped = false;
  let currentStatus: VoiceStatus = "idle";
  const timers: ReturnType<typeof setTimeout>[] = [];

  const setStatus = (s: VoiceStatus) => {
    currentStatus = s;
    callbacks.onStatus(s);
  };

  setStatus("connecting");

  const finalize = (turnId: string, finalText: string, role: "user" | "assistant") => {
    callbacks.onTranscriptUpdate(turnId, finalText, false);
  };

  const runScript = () => {
    let elapsed = 0;
    for (let i = 0; i < SCRIPT.length; i++) {
      const step = SCRIPT[i]!;
      const stepIndex = i;
      // Cumulative delay so steps fire in narrative order even if individual
      // delayMs values overlap when treated as absolute from the same origin.
      elapsed += step.delayMs;
      const delay = elapsed;

      const timer = setTimeout(() => {
        if (stopped) return;

        // Status transitions feel like the real thing:
        //   - user message → listening
        //   - assistant message → thinking → speaking
        if (step.role === "user") {
          if (currentStatus !== "listening") setStatus("listening");
        } else if (step.role === "assistant") {
          if (step.tool) setStatus("thinking");
          else setStatus("speaking");
        }

        if (step.role === "system") {
          callbacks.onTranscript({
            id: id("sys"),
            role: "system",
            text: step.text as string,
            partial: false,
            ts: Date.now(),
          });
          return;
        }

        const turnId = id(step.role === "user" ? "u" : "a");
        const isUser = step.role === "user";

        if (typeof step.text === "string") {
          callbacks.onTranscript({
            id: turnId,
            role: step.role,
            text: step.text,
            partial: false,
            ts: Date.now(),
          });
        } else {
          // Stream the partial chunks with small gaps so the UI shows
          // progressive transcription.
          const chunks = step.text;
          const chunkInterval = 320;
          chunks.forEach((chunk, ci) => {
            const t = setTimeout(() => {
              if (stopped) return;
              if (ci === 0) {
                callbacks.onTranscript({
                  id: turnId,
                  role: step.role,
                  text: chunk,
                  partial: true,
                  ts: Date.now(),
                });
              } else if (ci === chunks.length - 1) {
                finalize(turnId, chunk, isUser ? "user" : "assistant");
              } else {
                callbacks.onTranscriptUpdate(turnId, chunk, true);
              }
            }, ci * chunkInterval);
            timers.push(t);
          });
        }

        if (step.tool) {
          const toolTimer = setTimeout(() => {
            if (stopped) return;
            callbacks.onToolCall({
              id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              name: step.tool!.name,
              args: step.tool!.args,
              ts: Date.now(),
              status: "visualized",
            });
          }, 700);
          timers.push(toolTimer);
        }

        // When the very last assistant turn finishes, mark the session as
        // "ready" so the mic button can be tapped again.
        if (stepIndex === SCRIPT.length - 1 && step.role === "assistant") {
          const endTimer = setTimeout(() => {
            if (stopped) return;
            setStatus("ready");
          }, 900);
          timers.push(endTimer);
        }
      }, delay);

      timers.push(timer);
    }
  };

  // Tiny initial delay to mimic the websocket handshake.
  const openTimer = setTimeout(() => {
    if (stopped) return;
    setStatus("ready");
    const startTimer = setTimeout(() => {
      if (stopped) return;
      setStatus("listening");
      runScript();
    }, 400);
    timers.push(startTimer);
  }, 350);
  timers.push(openTimer);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const t of timers) clearTimeout(t);
    timers.length = 0;
    setStatus("closed");
  };

  const handle: VoiceSession = {
    stop: async () => stop(),
    sendText: () => undefined,
    status: () => currentStatus,
  };

  return handle;
}