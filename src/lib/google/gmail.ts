/**
 * Gmail API wrapper — uses fetch directly so we don't pull in the
 * `googleapis` package (~hundreds of KB). Safe in both Node 20+ and the browser.
 *
 * Reference: https://developers.google.com/gmail/api/reference/rest/v1/users.drafts/create
 *
 * The userId parameter is accepted for API symmetry with the orchestrator's
 * tool args, but Gmail's REST API uses the literal string "me" to refer to
 * the authenticated user. We always call users/me/...
 */

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface EncodeEmailInput {
  to: string;
  subject: string;
  body: string;
  /** Optional From header. If omitted Gmail fills it in from the OAuth account. */
  from?: string;
}

export interface CreateDraftInput {
  /** Google OAuth access token with gmail.compose scope (or higher). */
  accessToken: string;
  to: string;
  subject: string;
  body: string;
  from?: string;
  /** Accepted for API symmetry — Gmail API uses "me" regardless. */
  userId?: string;
  /** If true, mark the draft as already sent (sends immediately). Off by default. */
  sendImmediately?: boolean;
}

export interface CreatedDraft {
  id: string;
  messageId: string;
  threadId: string;
}

/**
 * Encode plain-text fields into a base64url-encoded RFC 2822 message suitable
 * for Gmail's `users.drafts.create` API.
 *
 * Gmail expects the `raw` field to be a base64url (RFC 4648 §5) string.
 * Headers are CRLF-terminated; the body is preceded by a blank line.
 */
export function encodeEmail(input: EncodeEmailInput): string {
  const subjectHeader = encodeRfc2047Subject(input.subject);

  const headerLines: string[] = [];
  if (input.from) headerLines.push(`From: ${input.from}`);
  headerLines.push(`To: ${input.to}`);
  headerLines.push(`Subject: ${subjectHeader}`);
  headerLines.push("MIME-Version: 1.0");
  headerLines.push('Content-Type: text/plain; charset="UTF-8"');
  headerLines.push("Content-Transfer-Encoding: 7bit");

  // Normalize body line endings to CRLF for RFC 2822 compliance.
  const normalizedBody = (input.body ?? "").replace(/\r?\n/g, "\r\n");

  const message = `${headerLines.join("\r\n")}\r\n\r\n${normalizedBody}`;

  // btoa works on binary-ish latin1 strings; we round-trip through UTF-8 so
  // non-ASCII characters in body / subject survive intact.
  const utf8Bytes = new TextEncoder().encode(message);
  let binary = "";
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  const b64 = typeof btoa === "function"
    ? btoa(binary)
    : Buffer.from(binary, "binary").toString("base64");

  // base64url: replace + → -, / → _, strip padding =
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * RFC 2047 encoded-word for non-ASCII subject lines. Pure ASCII subjects are
 * returned unchanged so we don't add `=?UTF-8?B?...?=` noise to plain
 * subject lines that every email client renders fine.
 */
function encodeRfc2047Subject(subject: string): string {
  // Allow printable ASCII (0x20-0x7E) plus tab (0x09); RFC 5322 §3.2.3
  if (/^[\x09\x20-\x7E]*$/.test(subject)) return subject;
  const utf8Bytes = new TextEncoder().encode(subject);
  let binary = "";
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  const b64 = typeof btoa === "function"
    ? btoa(binary)
    : Buffer.from(binary, "binary").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

interface GmailDraftResponse {
  id: string;
  message: {
    id: string;
    threadId: string;
    labelIds?: string[];
  };
}

interface GmailSentDraftResponse {
  id: string;
  message: {
    id: string;
    threadId: string;
    labelIds?: string[];
  };
}

/**
 * Create a Gmail draft via `users.drafts.create`.
 *
 * Returns the Gmail-assigned `draft.id`, `message.id`, and `threadId`.
 * Throws on any non-2xx response — callers should treat that as a fallback
 * signal (e.g. fall back to an in-memory mock).
 */
export async function createDraft(input: CreateDraftInput): Promise<CreatedDraft> {
  if (!input.accessToken) {
    throw new Error("createDraft: missing access token");
  }
  if (!input.to || !input.subject) {
    throw new Error("createDraft: missing recipient or subject");
  }

  const raw = encodeEmail({
    to: input.to,
    subject: input.subject,
    body: input.body ?? "",
    from: input.from,
  });

  const url = `${GMAIL_API_BASE}/drafts`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ message: { raw } }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Gmail API error ${res.status} ${res.statusText}: ${errText.slice(0, 500)}`
    );
  }

  const json = (await res.json()) as GmailDraftResponse;
  if (!json.id || !json.message?.id) {
    throw new Error("Gmail API returned an unexpected payload");
  }

  return {
    id: json.id,
    messageId: json.message.id,
    threadId: json.message.threadId,
  };
}

/**
 * Send an email immediately via `users.messages.send`.
 *
 * Unlike the draft flow, this actually delivers the message to the recipient's
 * inbox using the user's Gmail account. Requires an access token with the
 * `gmail.send` scope.
 */
export interface SendMessageInput {
  accessToken: string;
  to: string;
  subject: string;
  body: string;
  from?: string;
}

export async function sendMessage(input: SendMessageInput): Promise<CreatedDraft> {
  if (!input.accessToken) throw new Error("sendMessage: missing access token");
  if (!input.to || !input.subject) {
    throw new Error("sendMessage: missing recipient or subject");
  }

  const raw = encodeEmail({
    to: input.to,
    subject: input.subject,
    body: input.body ?? "",
    from: input.from,
  });

  const url = `${GMAIL_API_BASE}/messages/send`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Gmail API error ${res.status} ${res.statusText}: ${errText.slice(0, 500)}`
    );
  }

  const json = (await res.json()) as GmailSentDraftResponse;
  if (!json.id) throw new Error("Gmail API returned an unexpected payload");

  return {
    id: json.id,
    messageId: json.message?.id ?? json.id,
    threadId: json.message?.threadId ?? "",
  };
}

/**
 * Build a Gmail web compose URL that prefills to/subject/body. Used as a
 * fallback when no OAuth token is available (e.g. demo mode) so the user can
 * still actually send the AI-written email from their own Gmail with one click.
 */
export function gmailComposeUrl(input: {
  to: string;
  subject: string;
  body: string;
}): string {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: input.to,
    su: input.subject,
    body: input.body,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

/**
 * Send an existing Gmail draft via `users.drafts.send`.
 * Used by the Inbox UI's "Send" button when the user already approved the draft.
 */
export async function sendDraft(accessToken: string, draftId: string): Promise<CreatedDraft> {
  if (!accessToken || !draftId) {
    throw new Error("sendDraft: missing access token or draft id");
  }

  const url = `${GMAIL_API_BASE}/drafts/send`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ id: draftId }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Gmail API error ${res.status} ${res.statusText}: ${errText.slice(0, 500)}`
    );
  }

  const json = (await res.json()) as GmailSentDraftResponse;
  if (!json.id) {
    throw new Error("Gmail API returned an unexpected payload");
  }

  return {
    id: json.id,
    messageId: json.message.id,
    threadId: json.message.threadId,
  };
}