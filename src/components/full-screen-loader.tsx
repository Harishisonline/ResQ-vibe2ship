import { ResQLogo } from "@/components/resq-logo";
import { cn } from "@/lib/utils";

interface FullScreenLoaderProps {
  message?: string;
  /** When true, dims and overlays on top of existing content (for route transitions). */
  overlay?: boolean;
  className?: string;
}

/**
 * Branded full-screen loading state. Shown during auth bootstrap and route
 * transitions so the app never looks blank/broken while data is loading.
 */
export function FullScreenLoader({
  message = "Loading your workspace",
  overlay = false,
  className,
}: FullScreenLoaderProps) {
  return (
    <div
      className={cn(
        "flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 text-center",
        overlay && "fixed inset-0 z-50 min-h-screen bg-background/80 backdrop-blur-sm",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div className="animate-pulse">
        <ResQLogo size="xl" showText={false} />
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-primary" />
        </div>
        <p className="text-sm font-medium text-foreground">{message}</p>
        <p className="text-xs text-muted-foreground">ResQ is preparing your data. Just a moment.</p>
      </div>
    </div>
  );
}
