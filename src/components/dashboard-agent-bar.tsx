"use client";

import { useState } from "react";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Markdown } from "@/components/chat/markdown";
import { ToolActionCard } from "@/components/chat/tool-action-card";
import { useAuth } from "@/components/auth-provider";
import { streamAgentResponse } from "@/lib/agent/stream";
import type { AgentAction } from "@/types/agent";

interface Reply {
  text: string;
  actions: AgentAction[];
}

export function DashboardAgentBar() {
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [reply, setReply] = useState<Reply | null>(null);

  const send = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || processing) return;
    setInput("");
    setProcessing(true);
    setReply({ text: "", actions: [] });

    try {
      await streamAgentResponse({
        userId: user?.uid ?? "demo-user",
        userName: user?.displayName ?? user?.email?.split("@")[0] ?? "there",
        message,
        history: [],
        onText: (chunk) =>
          setReply((r) => (r ? { ...r, text: r.text + chunk } : r)),
        onAction: (action) =>
          setReply((r) => (r ? { ...r, actions: [...r.actions, action] } : r)),
        onDone: () => setProcessing(false),
        onError: (err) => {
          setReply((r) => ({
            text: (r?.text ?? "") + `\n\nCouldn't get a reply: ${err}`,
            actions: r?.actions ?? [],
          }));
          setProcessing(false);
        },
      });
    } catch (err) {
      setReply({
        text: `Couldn't get a reply: ${err instanceof Error ? err.message : String(err)}`,
        actions: [],
      });
      setProcessing(false);
    }
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-orange-500/5 p-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-orange-500">
          <Sparkles className="h-4 w-4 text-primary-foreground" />
        </div>
        <div className="flex-1">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask ResQ to plan, break down, schedule, or draft something…"
            className="min-h-[40px] resize-none border-0 bg-transparent px-1 py-1 text-sm shadow-none focus-visible:ring-0"
            rows={1}
            disabled={processing}
          />
        </div>
        <Button
          size="icon"
          className="h-9 w-9 flex-shrink-0 rounded-lg"
          onClick={() => send()}
          disabled={!input.trim() || processing}
          aria-label="Send to ResQ"
        >
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </Button>
      </div>

      {reply && (reply.text || reply.actions.length > 0) && (
        <div className="mt-2 space-y-2 rounded-lg border border-border/60 bg-card/70 p-3">
          {reply.text && <Markdown content={reply.text} />}
          {reply.actions.length > 0 && (
            <div className="space-y-2">
              {reply.actions.map((action, idx) => (
                <ToolActionCard key={`dash-action-${idx}`} action={action} />
              ))}
            </div>
          )}
          {processing && (
            <div className="flex gap-1">
              <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60" />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
