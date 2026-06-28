/**
 * Google OAuth helpers — client-side only.
 *
 * Firebase Auth doesn't expose the Google OAuth access token on the User object
 * directly. The token is only available on the OAuthCredential that comes back
 * from `signInWithPopup` (or `reauthenticateWithPopup`).
 *
 * Pattern:
 *   1. After sign-in, we capture `GoogleAuthProvider.credentialFromResult(...)?.accessToken`
 *      and stash it in a module-level cache keyed by user email.
 *   2. When the Gmail API needs a fresh token we call `ensureGoogleAccessToken`,
 *      which transparently re-authenticates with the requested scopes if the
 *      cached token is missing / belongs to another user / might have expired.
 *
 * For server-side contexts (e.g. the Next.js API route) the caller must pass the
 * token in via the request body. The server cannot mint Google OAuth tokens on
 * its own without a separate server-side OAuth client.
 */

import {
  GoogleAuthProvider,
  reauthenticateWithPopup,
  type User,
} from "firebase/auth";

/** Gmail-related scopes we typically want. */
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.send",
] as const;

interface CachedToken {
  token: string;
  email: string;
}

let cached: CachedToken | null = null;

/**
 * Cache the OAuth access token that came back from the initial Google sign-in.
 * Call this from your auth-provider immediately after `signInWithPopup`.
 */
export function setGoogleAccessToken(token: string | null, email: string | null): void {
  if (token && email) {
    cached = { token, email };
  } else if (!token) {
    cached = null;
  }
}

/** Forget the cached token (e.g. on sign-out). */
export function clearGoogleAccessToken(): void {
  cached = null;
}

/**
 * Returns the cached Google OAuth access token for the given user, or null.
 * Does NOT trigger any network call.
 */
export function getGmailAccessToken(user: User | null | undefined): string | null {
  if (!user || !user.email || !cached) return null;
  if (cached.email !== user.email) return null;
  return cached.token;
}

/**
 * Make sure we have a Google OAuth access token with the requested scopes.
 *
 * - If the cached token belongs to the same user, return it immediately.
 * - Otherwise (or if the cached token is missing) trigger a popup re-auth
 *   that re-requests the supplied scopes, cache the fresh token, and return it.
 *
 * Returns null only if re-authentication is cancelled or fails.
 *
 * MUST be called from the browser.
 */
export async function ensureGoogleAccessToken(
  user: User,
  scopes: readonly string[] = GMAIL_SCOPES
): Promise<string | null> {
  if (typeof window === "undefined") {
    throw new Error("ensureGoogleAccessToken must be called in the browser");
  }

  const existing = getGmailAccessToken(user);
  if (existing) return existing;

  const provider = new GoogleAuthProvider();
  for (const scope of scopes) provider.addScope(scope);
  provider.setCustomParameters({ prompt: "consent" });

  try {
    const result = await reauthenticateWithPopup(user, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken ?? null;
    if (accessToken && user.email) {
      setGoogleAccessToken(accessToken, user.email);
    }
    return accessToken;
  } catch (err) {
    // User closed the popup, denied scopes, or some other failure.
    console.warn("[google/oauth] reauthenticateWithPopup failed", err);
    return null;
  }
}

/**
 * Quick check: do we already have a cached token for this user?
 * Useful for showing UI hints ("Gmail connected" vs "Connect Gmail").
 */
export function hasCachedGoogleToken(user: User | null | undefined): boolean {
  return getGmailAccessToken(user) !== null;
}