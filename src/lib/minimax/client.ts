/**
 * MiniMax client — replaces @google/genai.
 * MiniMax uses an OpenAI-compatible API: POST BASE_URL/chat/completions
 *
 * Configure via env (see .env.local.example):
 *   MINIMAX_API_KEY        — server-side key (required)
 *   MINIMAX_BASE_URL       — defaults to https://api.minimax.io/v1 (international)
 *   MINIMAX_MODEL          — chat model name, defaults to MiniMax-M2.7
 */

const API_KEY = process.env.MINIMAX_API_KEY ?? process.env.NEXT_PUBLIC_MINIMAX_API_KEY;
const BASE_URL = process.env.MINIMAX_BASE_URL ?? "https://api.minimax.io/v1";
const MODEL = process.env.MINIMAX_MODEL ?? "MiniMax-M2.7";

export const isMiniMaxConfigured = Boolean(API_KEY && BASE_URL && MODEL);

export interface MiniMaxToolCall {
  index: number;
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface MiniMaxMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_calls?: MiniMaxToolCall[];
  tool_call_id?: string;
}

export interface MiniMaxChoice {
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: MiniMaxToolCall[];
  };
  finish_reason: string;
}

export interface MiniMaxResponse {
  id: string;
  choices: MiniMaxChoice[];
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Chat completion — mimics the Gemini generateContent call shape.
 * Sets up tools automatically from the RESQ_TOOLS format.
 */
export async function chatComplete({
  model = MODEL,
  messages,
  tools,
  temperature = 0.7,
  max_tokens = 2048,
  stream = false,
}: {
  model?: string;
  messages: MiniMaxMessage[];
  tools?: unknown[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}): Promise<MiniMaxResponse> {
  if (!isMiniMaxConfigured) {
    throw new Error("MiniMax is not configured. Set MINIMAX_API_KEY env var.");
  }

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens,
    stream,
  };
  if (tools && tools.length > 0) {
    body.tools = tools as never;
  }

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MiniMax API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<MiniMaxResponse>;
}

/**
 * Streaming chat completion — for SSE streaming in the agent route.
 */
export async function* streamChatComplete({
  model = MODEL,
  messages,
  tools,
  temperature = 0.7,
  max_tokens = 2048,
}: {
  model?: string;
  messages: MiniMaxMessage[];
  tools?: unknown[];
  temperature?: number;
  max_tokens?: number;
}): AsyncGenerator<string, void, unknown> {
  if (!isMiniMaxConfigured) {
    throw new Error("MiniMax is not configured.");
  }

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens,
    stream: true,
  };
  if (tools && tools.length > 0) {
    body.tools = tools as never;
  }

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`MiniMax API error ${response.status}`);
  }

  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data);
        const chunk = parsed.choices?.[0]?.delta?.content;
        if (chunk) yield chunk;
      } catch {
        // skip malformed lines
      }
    }
  }
}
