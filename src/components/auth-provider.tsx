"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { auth, googleProvider, isFirebaseConfigured } from "@/lib/firebase/client";
import { useAgentStore } from "@/stores/agent-store";
import { setGoogleAccessToken, clearGoogleAccessToken } from "@/lib/google/oauth";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  configured: boolean;
  signInWithGoogle: () => Promise<void>;
  signInAnonymously: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Demo mode lets you use the app without configuring Firebase */
  enterDemoMode: () => void;
  isDemoMode: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const DEMO_USER = {
  uid: "demo-user",
  email: "demo@resq.app",
  displayName: "Demo User",
  photoURL: null,
} as unknown as User;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Hydrate demo mode from localStorage so refreshes don't kick you out
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("resq-demo-mode");
    if (stored === "true") {
      setIsDemoMode(true);
      setUser(DEMO_USER);
    }
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signInWithGoogle = async () => {
    if (!auth) throw new Error("Firebase not configured");
    const result = await signInWithPopup(auth, googleProvider);
    // Leaving demo mode: clear the demo flag so effectiveUser becomes the real
    // Firebase user instead of staying stuck on DEMO_USER.
    if (typeof window !== "undefined") {
      localStorage.removeItem("resq-demo-mode");
    }
    setIsDemoMode(false);
    setUser(result.user);
    // Capture the Gmail-scoped OAuth access token for email sending.
    try {
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken ?? null;
      setGoogleAccessToken(token, result.user.email ?? null);
    } catch {
      /* token capture is best-effort; email send falls back to compose URL */
    }
  };

  const signInAnonymously = async () => {
    if (!auth) throw new Error("Firebase not configured");
    const { signInAnonymously } = await import("firebase/auth");
    await signInAnonymously(auth);
  };

  const signOut = async () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("resq-demo-mode");
    }
    // Clear local (demo) state first so the UI updates even when Firebase
    // isn't configured or no real Firebase user is signed in.
    setIsDemoMode(false);
    setUser(null);
    clearGoogleAccessToken();
    if (auth) {
      try {
        await fbSignOut(auth);
      } catch {
        // no real Firebase session to end — demo mode is already cleared above
      }
    }
  };

  const enterDemoMode = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("resq-demo-mode", "true");
    }
    setUser(DEMO_USER);
    setIsDemoMode(true);
  };

  const effectiveUser = isDemoMode ? DEMO_USER : user;

  // Reset chat whenever the signed-in account changes (including demo -> real
  // or sign-out -> sign-in) so one user's conversation never leaks into another.
  const currentUid = effectiveUser?.uid ?? null;
  const prevUidRef = useRef<string | null>(currentUid);
  useEffect(() => {
    if (prevUidRef.current !== currentUid) {
      useAgentStore.getState().resetForUser();
      prevUidRef.current = currentUid;
    }
  }, [currentUid]);

  return (
    <AuthContext.Provider
      value={{
        user: effectiveUser,
        loading,
        configured: isFirebaseConfigured,
        signInWithGoogle,
        signInAnonymously,
        signOut,
        enterDemoMode,
        isDemoMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { GoogleAuthProvider };
