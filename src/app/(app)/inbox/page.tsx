"use client";

import { useEffect, useState } from "react";
import { Inbox, Mail, PenSquare, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/auth-provider";
import { useCollection } from "@/hooks/use-collection";
import * as repo from "@/lib/data/repository";
import { ensureGoogleAccessToken } from "@/lib/google/oauth";
import { sendMessage, gmailComposeUrl } from "@/lib/google/gmail";
import type { DraftDocument } from "@/types/task";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function InboxPage() {
  const { user, isDemoMode } = useAuth();
  const userId = user?.uid ?? "demo-user";
  const { data: drafts, loading, error, refresh } = useCollection<DraftDocument>(
    repo.drafts,
    userId
  );

  // Compose dialog state
  const [composeOpen, setComposeOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cSubject, setCSubject] = useState("");
  const [cTo, setCTo] = useState("");
  const [cTone, setCTone] = useState<"professional" | "friendly" | "concise">("professional");
  const [cContext, setCContext] = useState("");

  const resetCompose = () => {
    setCSubject("");
    setCTo("");
    setCTone("professional");
    setCContext("");
  };

  const saveDraftRecord = async (params: {
    body: string;
    status: DraftDocument["status"];
    sentAt?: string;
  }) => {
    await repo.drafts.add(userId, {
      userId,
      kind: "email",
      title: cSubject.trim(),
      subject: cSubject.trim(),
      body: params.body,
      status: params.status,
      generatedFor: "manual",
      generatedBy: "resq",
      createdAt: new Date().toISOString(),
      sentAt: params.sentAt,
      tone: cTone,
      context: cContext.trim() || undefined,
      metadata: {
        to: cTo.trim() || undefined,
        tone: cTone,
        context: cContext.trim() || undefined,
      },
    });
  };

  const handleCompose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cSubject.trim()) {
      toast.error("Subject is required");
      return;
    }
    if (!cTo.trim()) {
      toast.error("Recipient (To) is required to send the email");
      return;
    }
    setSaving(true);
    try {
      // 1. AI writes the email body from subject + context + tone. Timeout so
      //    the button never hangs forever if the network/provider stalls.
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 30000);
      let compRes: Response;
      try {
        compRes = await fetch("/api/drafts/ai-compose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: cTo.trim(),
            subject: cSubject.trim(),
            context: cContext.trim() || undefined,
            tone: cTone,
          }),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      const comp = await compRes.json();
      if (!compRes.ok) throw new Error(comp.error ?? "AI compose failed");
      const body: string = comp.body;

      // 2. Try to actually send via Gmail. Demo mode and unconnected accounts
      //    fall back to a prefilled Gmail compose tab.
      let token: string | null = null;
      if (!isDemoMode && user) {
        token = await ensureGoogleAccessToken(user);
      }

      if (token) {
        await sendMessage({
          accessToken: token,
          to: cTo.trim(),
          subject: cSubject.trim(),
          body,
        });
        const sentAt = new Date().toISOString();
        await saveDraftRecord({ body, status: "sent", sentAt });
        toast.success(`Email sent to ${cTo.trim()}`);
      } else {
        await saveDraftRecord({ body, status: "pending" });
        const url = gmailComposeUrl({
          to: cTo.trim(),
          subject: cSubject.trim(),
          body,
        });
        window.open(url, "_blank", "noopener,noreferrer");
        toast.success("AI wrote your email. Gmail opened in a new tab to send.");
      }
      resetCompose();
      setComposeOpen(false);
      refresh();
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "AbortError"
          ? "AI took too long to respond. Please try again."
          : err instanceof Error
          ? err.message
          : "Failed to send email";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async (
    id: string,
    overrides?: { to?: string; subject?: string; body?: string }
  ) => {
    const draft = drafts.find((d) => d.id === id);
    if (!draft) return;
    const meta = (draft.metadata ?? {}) as { to?: string };
    const to = (overrides?.to ?? meta.to ?? "").trim();
    const subject = (overrides?.subject ?? draft.subject ?? "(no subject)").trim();
    const body = overrides?.body ?? draft.body ?? "";
    if (!to) {
      toast.error("No recipient on this draft. Add a recipient before sending.");
      return;
    }
    setSaving(true);
    try {
      // Persist any inline edits so the saved draft matches what was sent.
      await repo.drafts.update(userId, id, {
        subject,
        body,
        metadata: { ...draft.metadata, to },
      });
      let token: string | null = null;
      if (!isDemoMode && user) token = await ensureGoogleAccessToken(user);
      if (token) {
        await sendMessage({ accessToken: token, to, subject, body });
        await repo.drafts.update(userId, id, {
          status: "sent",
          sentAt: new Date().toISOString(),
        });
        toast.success(`Email sent to ${to}`);
      } else {
        window.open(
          gmailComposeUrl({ to, subject, body }),
          "_blank",
          "noopener,noreferrer"
        );
        await repo.drafts.update(userId, id, { status: "approved" });
        toast.success("Gmail opened. Send from there to deliver.");
      }
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async (
    id: string,
    patch: { subject?: string; body?: string; to?: string }
  ) => {
    const draft = drafts.find((d) => d.id === id);
    if (!draft) return;
    try {
      await repo.drafts.update(userId, id, {
        subject: patch.subject,
        body: patch.body,
        metadata: { ...draft.metadata, to: patch.to },
      });
      toast.success("Draft updated");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  const handleReject = async (id: string) => {
    try {
      await repo.drafts.update(userId, id, { status: "rejected" });
      refresh();
    } catch {
      toast.error("Update failed");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await repo.drafts.remove(userId, id);
      toast.success("Draft deleted");
      refresh();
    } catch {
      toast.error("Delete failed");
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Agent Inbox</h1>
            <p className="text-sm text-muted-foreground">
              Drafts created by ResQ · Review and send when ready
            </p>
          </div>
          <div className="flex items-center gap-2">
            {drafts.filter((d) => d.status === "pending").length > 0 && (
              <Badge variant="secondary">
                {drafts.filter((d) => d.status === "pending").length} pending
              </Badge>
            )}
            <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
              <DialogTrigger render={<Button size="sm" />}>
                <PenSquare className="mr-1.5 h-4 w-4" /> AI compose &amp; send
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>AI compose &amp; send</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCompose} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="d-subject">Subject</Label>
                    <Input
                      id="d-subject"
                      value={cSubject}
                      onChange={(e) => setCSubject(e.target.value)}
                      placeholder="Subject line"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="d-to">To</Label>
                      <Input
                        id="d-to"
                        type="email"
                        value={cTo}
                        onChange={(e) => setCTo(e.target.value)}
                        placeholder="recipient@email.com"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="d-tone">Tone</Label>
                      <select
                        id="d-tone"
                        value={cTone}
                        onChange={(e) =>
                          setCTone(e.target.value as "professional" | "friendly" | "concise")
                        }
                        className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring"
                      >
                        <option value="professional">Professional</option>
                        <option value="friendly">Friendly</option>
                        <option value="concise">Concise</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="d-context">What is this email about?</Label>
                    <Textarea
                      id="d-context"
                      value={cContext}
                      onChange={(e) => setCContext(e.target.value)}
                      placeholder="e.g. Ask Prof. Sharma for a 1-day extension on the ML project"
                      rows={3}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      ResQ writes the full email from this and sends it. If Gmail
                      isn&apos;t connected, it opens a prefilled compose tab for you to send.
                    </p>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={saving}>
                      {saving ? "Writing & sending…" : "AI write & send"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {error && (
          <Card className="mb-3 border-destructive/40 bg-destructive/5">
            <CardContent className="text-sm text-destructive p-3">
              Couldn&apos;t load drafts: {error}
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {loading
            ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-48" />)
            : drafts.length === 0
            ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <Inbox className="mb-3 h-12 w-12 text-muted-foreground/50" />
                    <p className="font-medium">No drafts yet</p>
                    <p className="text-sm text-muted-foreground">
                      When ResQ drafts an email for you, it appears here.
                    </p>
                  </CardContent>
                </Card>
              )
            : drafts.map((draft) => (
                <DraftCard
                  key={draft.id}
                  draft={draft}
                  disabled={saving}
                  onSave={handleSaveDraft}
                  onSend={handleSend}
                  onReject={handleReject}
                  onDelete={handleDelete}
                />
              ))}
        </div>
      </div>
    </div>
  );
}

function DraftCard({
  draft,
  disabled,
  onSave,
  onSend,
  onReject,
  onDelete,
}: {
  draft: DraftDocument;
  disabled: boolean;
  onSave: (id: string, patch: { subject?: string; body?: string; to?: string }) => Promise<void> | void;
  onSend: (id: string, overrides?: { to?: string; subject?: string; body?: string }) => Promise<void> | void;
  onReject: (id: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}) {
  const meta = (draft.metadata ?? {}) as { context?: string; tone?: string; to?: string };
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [to, setTo] = useState(meta.to ?? "");
  const [body, setBody] = useState(draft.body ?? "");
  const [savingDraft, setSavingDraft] = useState(false);

  // Sync local edit state when the underlying draft changes (e.g. the agent
  // re-drafts, or a server/local subscription pushes a new version). Without
  // this the card shows stale fields until it remounts.
  useEffect(() => {
    const m = (draft.metadata ?? {}) as { to?: string };
    setSubject(draft.subject ?? "");
    setTo(m.to ?? "");
    setBody(draft.body ?? "");
  }, [draft.id, draft.subject, draft.body, draft.metadata]);

  const dirty =
    subject !== (draft.subject ?? "") ||
    to !== (meta.to ?? "") ||
    body !== (draft.body ?? "");

  const isPending = draft.status === "pending";

  const save = async () => {
    setSavingDraft(true);
    try {
      await onSave(draft.id, { subject, to, body });
    } finally {
      setSavingDraft(false);
    }
  };

  const sendNow = () => {
    if (!to.trim()) {
      toast.error("Add a recipient before sending.");
      return;
    }
    onSend(draft.id, { to: to.trim(), subject: subject.trim(), body });
  };

  return (
    <Card
      className={`overflow-hidden transition-opacity ${
        draft.status === "rejected" ? "opacity-50" : ""
      }`}
    >
      <CardHeader className="border-b border-border/60 bg-muted/30 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-950/50">
              <Mail className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className="h-8 px-2 text-base font-semibold"
              />
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">To:</span>
                <Input
                  type="email"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="recipient@email.com"
                  className="h-7 px-2 text-sm"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {meta.tone && (
              <Badge variant="secondary" className="capitalize">
                {meta.tone}
              </Badge>
            )}
            {draft.status !== "pending" && (
              <Badge
                variant={
                  draft.status === "sent" || draft.status === "approved"
                    ? "default"
                    : "destructive"
                }
                className="capitalize"
              >
                {draft.status === "sent" && draft.sentAt
                  ? `sent · ${timeAgo(draft.sentAt)}`
                  : draft.status}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {meta.context && (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Why ResQ drafted this
            </p>
            <p className="text-sm text-foreground/90">{meta.context}</p>
          </div>
        )}

        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          className="resize-y leading-relaxed"
          placeholder="Email body"
        />

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted-foreground">
            Drafted {timeAgo(draft.createdAt)}
          </span>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(draft.id)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!dirty || savingDraft}
              onClick={save}
            >
              {savingDraft ? "Saving…" : "Save changes"}
            </Button>
            {isPending ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => onReject(draft.id)}>
                  Reject
                </Button>
                <Button size="sm" disabled={disabled} onClick={sendNow}>
                  <Send className="mr-1.5 h-3.5 w-3.5" /> Send
                </Button>
              </>
            ) : (
              <Button size="sm" disabled={disabled || !to.trim()} onClick={sendNow}>
                <Send className="mr-1.5 h-3.5 w-3.5" /> Resend
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}