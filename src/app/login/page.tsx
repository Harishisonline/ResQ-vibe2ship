"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogIn, Sparkles, Zap, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ResQLogo } from "@/components/resq-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/components/auth-provider";

export default function LoginPage() {
  const router = useRouter();
  const { user, configured, signInWithGoogle, enterDemoMode, loading } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && !loading) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  const handleGoogle = async () => {
    setError(null);
    setSigningIn(true);
    try {
      await signInWithGoogle();
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setSigningIn(false);
    }
  };

  const handleDemo = () => {
    enterDemoMode();
    router.push("/dashboard");
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="gradient-mesh absolute inset-0 -z-10 opacity-60" />

      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <ResQLogo size="lg" />
        </div>

        <Card className="border-border/60 bg-card/80 shadow-2xl backdrop-blur-xl">
          <CardContent className="space-y-6 p-8">
            <div className="space-y-2 text-center">
              <Badge variant="secondary" className="mx-auto">
                <Sparkles className="mr-1 h-3 w-3 text-primary" />
                Welcome back
              </Badge>
              <h1 className="text-2xl font-bold tracking-tight">Sign in to ResQ</h1>
              <p className="text-sm text-muted-foreground">
                Connect your calendar and email so ResQ can take real action for you.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <div className="space-y-3">
              <Button
                onClick={handleGoogle}
                disabled={!configured || signingIn}
                className="h-12 w-full gap-2 text-base"
                size="lg"
              >
                <LogIn className="h-4 w-4" />
                {signingIn ? "Signing in…" : "Continue with Google"}
              </Button>

              {!configured && (
                <p className="text-center text-xs text-muted-foreground">
                  Firebase not configured. Add credentials to .env.local for Google sign-in
                </p>
              )}

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>

              <Button
                onClick={handleDemo}
                variant="outline"
                className="group h-12 w-full gap-2 text-base"
                size="lg"
              >
                <Zap className="h-4 w-4 text-primary transition-transform group-hover:scale-110" />
                Try the interactive demo
              </Button>

              <p className="text-center text-xs leading-relaxed text-muted-foreground">
                Demo mode runs entirely in your browser with mock data. Full version
                syncs with Google Calendar and Gmail.
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
