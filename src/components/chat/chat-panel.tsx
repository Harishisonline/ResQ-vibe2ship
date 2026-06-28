"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUp,
  FileText,
  Loader2,
  Paperclip,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/stores/agent-store";
import { useAuth } from "@/components/auth-provider";
import { streamAgentResponse } from "@/lib/agent/stream";
import { breakDownTaskAction } from "@/lib/agent/actions";
import { ToolActionCard } from "./tool-action-card";
import { Markdown } from "./markdown";

const SUGGESTIONS = [
  "I have a project due Friday at 5pm",
  "Schedule a 2-hour focus block tomorrow morning",
  "Draft a follow-up email to my professor",
  "What's at risk right now?",
];

export function ChatPanel() {
  const { user } = useAuth();
  const {
    messages,
    isProcessing,
    pendingPrompt,
    setPendingPrompt,
    setPendingBreakDown,
    addUserMessage,
    startAssistantMessage,
    appendToMessage,
    addActionToMessage,
    finishMessage,
    setProcessing,
    clear,
  } = useAgentStore();

  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<{ filename: string; text: string } | null>(null);
  const [extracting, setExtracting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const streamingMsgIdRef = useRef<string | null>(null);

  const handleStop = () => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    const msgId = streamingMsgIdRef.current;
    if (msgId) {
      appendToMessage(msgId, "\n\n_(Stopped)_");
      finishMessage(msgId);
      streamingMsgIdRef.current = null;
    }
    setProcessing(false);
    setError(null);
  };

  const handleAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setExtracting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/extract-doc", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Extraction failed");
      setAttachment({ filename: data.filename, text: data.text });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  };

  const buildDocMessage = (doc: { filename: string; text: string }, instruction: string) => {
    const prompt = instruction.trim()
      ? instruction.trim()
      : "Extract every task and deadline from this document and add each to my task list using createTask. Then summarize what you added.";
    return `Here is a document from ${doc.filename}. ${prompt}\n\nDOCUMENT:\n${doc.text}`;
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // If another page queued a prompt (e.g. a "break down" that needs
  // clarification), auto-send it once when the chat opens.
  useEffect(() => {
    if (!pendingPrompt) return;
    const prompt = pendingPrompt;
    setPendingPrompt(null);
    handleSend(prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const handleSend = async (text?: string) => {
    const instruction = (text ?? input).trim();
    const hasAttachment = !!attachment;
    if ((!instruction && !hasAttachment) || isProcessing) return;

    // A UI "Break down" sent the user here for clarification. Run breakdown
    // directly on the existing task — do NOT route through the LLM (which was
    // creating a duplicate task instead of chunking the original).
    const pendingBD = useAgentStore.getState().pendingBreakDown;
    if (pendingBD && instruction && !hasAttachment) {
      setPendingBreakDown(null);
      setInput("");
      setError(null);
      addUserMessage(instruction);
      const assistantId = startAssistantMessage();
      setProcessing(true);
      const userId = user?.uid ?? "demo-user";
      try {
        const res = await breakDownTaskAction(userId, pendingBD.taskId, {
          title: pendingBD.title,
          description: instruction,
          deadline: pendingBD.deadline,
        });
        if (res.needsClarification) {
          setPendingBreakDown(pendingBD);
          appendToMessage(
            assistantId,
            `Thanks — I still need one more detail to break down **"${pendingBD.title}"**: ${res.question ?? "What are the concrete deliverables?"}`
          );
        } else if (res.created > 0) {
          const lines = res.chunks.map((c, i) => `${i + 1}. **${c.title}**`).join("\n");
          appendToMessage(
            assistantId,
            `${res.summary}\n\n**Subtasks under "${pendingBD.title}":**\n${lines}\n\nOpen **Tasks** to see them nested under the main task.`
          );
        } else {
          appendToMessage(assistantId, res.summary);
        }
        finishMessage(assistantId);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        appendToMessage(
          assistantId,
          "Sorry, I couldn't break that down. Try the **Break down** button on the Tasks page again."
        );
        finishMessage(assistantId);
      } finally {
        setProcessing(false);
      }
      return;
    }

    const doc = attachment;
    const messageText = doc ? buildDocMessage(doc, instruction) : instruction;

    setInput("");
    setAttachment(null);
    setError(null);
    addUserMessage(
      hasAttachment
        ? instruction.trim()
          ? `${instruction.trim()}\n📎 ${doc!.filename}`
          : `📎 ${doc!.filename}`
        : messageText
    );

    const assistantId = startAssistantMessage();
    setProcessing(true);
    streamingMsgIdRef.current = assistantId;

    const history = useAgentStore
      .getState()
      .messages.filter((m) => m.id !== "welcome")
      .slice(-10)
      .map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      }));

    streamAbortRef.current?.abort();
    const abort = new AbortController();
    streamAbortRef.current = abort;

    try {
      await streamAgentResponse({
        userId: user?.uid ?? "demo-user",
        userName: user?.displayName ?? user?.email?.split("@")[0] ?? "there",
        message: messageText,
        history,
        signal: abort.signal,
        onText: (chunk) => appendToMessage(assistantId, chunk),
        onAction: (action) => addActionToMessage(assistantId, action),
        onDone: () => {
          if (abort.signal.aborted) return;
          finishMessage(assistantId);
          setProcessing(false);
          streamAbortRef.current = null;
          streamingMsgIdRef.current = null;
        },
        onError: (err) => {
          if (abort.signal.aborted) return;
          setError(err);
          appendToMessage(assistantId, "\n\nSorry, something went wrong.");
          finishMessage(assistantId);
          setProcessing(false);
          streamAbortRef.current = null;
          streamingMsgIdRef.current = null;
        },
      });
    } catch (err) {
      if (abort.signal.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
      finishMessage(assistantId);
      setProcessing(false);
      streamAbortRef.current = null;
      streamingMsgIdRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 bg-background/80 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-orange-500 shadow-md shadow-primary/20">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">ResQ Agent</h2>
            <p className="text-xs text-muted-foreground">
              {isProcessing ? "Working on it… (tap Stop to cancel)" : "Ready to take action"}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={clear}
          aria-label="Clear chat"
          className="h-8 w-8"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "animate-fade-in flex gap-3",
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium shadow-sm",
                  msg.role === "user"
                    ? "bg-foreground text-background"
                    : "bg-gradient-to-br from-primary to-orange-500 text-primary-foreground"
                )}
              >
                {msg.role === "user" ? (
                  user?.displayName?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "U"
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </div>

              <div
                className={cn(
                  "flex min-w-0 max-w-[85%] flex-col gap-2",
                  msg.role === "user" ? "items-end" : "items-start"
                )}
              >
                {msg.content && (
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border border-border/60 text-foreground"
                    )}
                  >
                    {msg.role === "user" ? (
                      msg.content
                    ) : (
                      <Markdown content={msg.content} />
                    )}
                    {msg.isStreaming && (
                      <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-current align-middle" />
                    )}
                  </div>
                )}

                {msg.actions && msg.actions.length > 0 && (
                  <div className="w-full max-w-md space-y-2">
                    {msg.actions.map((action, idx) => (
                      <ToolActionCard key={`${msg.id}-action-${idx}`} action={action} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isProcessing && messages[messages.length - 1]?.content === "" && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-orange-500 text-primary-foreground shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
              <div className="rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-sm">
                <div className="flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && (
        <div className="px-4 pb-2">
          <div className="mx-auto flex max-w-3xl flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleSend(s)}
                className="rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs text-muted-foreground transition-all hover:border-primary/50 hover:bg-accent hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border/60 bg-background/80 p-4 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          <div className="group relative flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-lg transition-shadow focus-within:border-primary/50 focus-within:shadow-xl">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.markdown,.csv,.json,.html,.pdf,text/plain,text/markdown,text/csv,application/json,text/html,application/pdf"
              onChange={handleAttach}
              className="hidden"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-shrink-0 rounded-lg"
              aria-label="Attach file"
              onClick={() => fileInputRef.current?.click()}
              disabled={extracting || isProcessing}
            >
              {extracting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
            </Button>
            <div className="flex-1">
              {attachment && (
                <div className="mb-2 inline-flex max-w-full items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-2 py-1 text-xs">
                  <FileText className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                  <span className="truncate">{attachment.filename}</span>
                  <button
                    onClick={() => setAttachment(null)}
                    className="ml-1 rounded-full p-0.5 hover:bg-foreground/10"
                    aria-label="Remove attachment"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={attachment ? "Optional: add instructions, or just press send" : "Tell ResQ what's coming up…"}
                className="min-h-[40px] flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm shadow-none focus-visible:ring-0"
                rows={1}
                disabled={isProcessing}
              />
            </div>
            <Button
              onClick={() => (isProcessing ? handleStop() : handleSend())}
              disabled={isProcessing ? false : (!input.trim() && !attachment) || extracting}
              size="icon"
              className={cn(
                "h-9 w-9 flex-shrink-0 rounded-lg",
                isProcessing && "bg-destructive hover:bg-destructive/90"
              )}
              aria-label={isProcessing ? "Stop response" : "Send message"}
            >
              {isProcessing ? (
                <Square className="h-3.5 w-3.5 fill-current" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            ResQ can take actions on your behalf. You can always undo.
          </p>
        </div>
      </div>
    </div>
  );
}
