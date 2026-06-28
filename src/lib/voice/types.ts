/**
 * Shared voice-session types — provider-agnostic.
 *
 * These were originally defined alongside the Gemini Live implementation; they
 * now live here so the demo mode and any voice provider (e.g. MiniMax TTS) can
 * share the same event contract without depending on a specific SDK.
 */

export type VoiceStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "listening"
  | "speaking"
  | "thinking"
  | "error"
  | "closed";

export interface TranscriptTurn {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  /** True while the model/user is still streaming this turn. */
  partial: boolean;
  /** Unix ms — useful for sorting and the recent-commands log. */
  ts: number;
}

export interface ToolCallEvent {
  id: string;
  name: string;
  args: Record<string, unknown>;
  ts: number;
  /** We never actually run tools in voice mode. */
  status: "queued" | "visualized" | "skipped";
}

export interface VoiceSessionCallbacks {
  onStatus: (status: VoiceStatus) => void;
  onTranscript: (turn: TranscriptTurn) => void;
  /** Live updates to an in-flight transcript turn (same id, growing text). */
  onTranscriptUpdate: (id: string, text: string, partial: boolean) => void;
  onToolCall: (call: ToolCallEvent) => void;
  onError: (err: Error) => void;
}

export interface VoiceSession {
  stop: () => Promise<void>;
  /** Send a text message to the model — useful for demo mode prefill. */
  sendText: (text: string) => void;
  status: () => VoiceStatus;
}
