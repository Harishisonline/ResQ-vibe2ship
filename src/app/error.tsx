"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <h1 className="mb-1 text-xl font-semibold">Something went wrong</h1>
      <p className="mb-4 max-w-sm text-sm text-muted-foreground">
        An unexpected error occurred. You can try again; your data is safe.
      </p>
      <Button onClick={reset}>
        <RefreshCw className="mr-1.5 h-4 w-4" /> Try again
      </Button>
    </div>
  );
}
