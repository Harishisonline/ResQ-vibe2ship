/**
 * Strip MiniMax M2.7's internal "thinking" and inline tool-call syntax
 * from a model response so the user only sees the clean, final reply.
 *
 * MiniMax emits reasoning inside `...` (and sometimes `...`) blocks,
 * plus tool-call plans as `<minimax:tool_call>...</minimax:tool_call>` /
 * `<invoke>...</invoke>` XML. These are plumbing — never meant for the user.
 */
export function sanitizeReply(text: string | null | undefined): string {
  if (!text) return "";
  let out = text;
  // Reasoning blocks (greedy across newlines): ... and ...
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, "");
  out = out.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  // Inline tool-call XML
  out = out.replace(/<minimax:tool_call>[\s\S]*?<\/minimax:tool_call>/gi, "");
  out = out.replace(/<minimax:[^>]*>[\s\S]*?<\/minimax:[^>]*>/gi, "");
  out = out.replace(/<invoke[\s\S]*?<\/invoke>/gi, "");
  // Any stray self-closed minimax/invoke/parameter tags
  out = out.replace(/<\/?(?:minimax:\w+|invoke|parameter|function_calls)\b[^>]*>/gi, "");
  // Strip em dashes (the model is instructed to avoid them; this is a safety net
  // so they never reach the user as "AI slop"). Use a short hyphen instead.
  out = out.replace(/\s*\u2014\s*/g, " - ");
  out = out.replace(/\u2014/g, "-");
  // Tidy whitespace
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  return out;
}
