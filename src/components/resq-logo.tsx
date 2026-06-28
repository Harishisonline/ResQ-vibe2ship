import { cn } from "@/lib/utils";

interface ResQLogoProps {
  className?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
}

export function ResQLogo({ className, showText = true, size = "md" }: ResQLogoProps) {
  const sizes = {
    sm: { mark: "h-6 w-6", text: "text-base", subtext: "text-[10px]" },
    md: { mark: "h-8 w-8", text: "text-xl", subtext: "text-xs" },
    lg: { mark: "h-10 w-10", text: "text-2xl", subtext: "text-sm" },
    xl: { mark: "h-14 w-14", text: "text-4xl", subtext: "text-base" },
  };
  const s = sizes[size];

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {/* Mark: an emergency-rescue chevron inside a soft ring */}
      <div
        className={cn(
          "relative flex items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-orange-500 shadow-lg shadow-primary/25",
          s.mark
        )}
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-1/2 w-1/2 text-primary-foreground"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2 L4 7 L4 17 L12 22 L20 17 L20 7 Z" />
          <path d="M9 12 L11 14 L15 10" />
        </svg>
        {/* Pulse ring */}
        <span className="absolute inset-0 animate-ping rounded-2xl bg-primary/20" />
      </div>
      {showText && (
        <div className="flex flex-col leading-none">
          <span className={cn("font-bold tracking-tight", s.text)}>ResQ</span>
          <span className={cn("font-medium text-muted-foreground", s.subtext)}>
            by Vibe2Ship
          </span>
        </div>
      )}
    </div>
  );
}
