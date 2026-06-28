"use client";

import Link from "next/link";
import { Bell, BellRing } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReminders } from "@/components/reminder-provider";

/**
 * Bell icon with a live unread count. Clicking it opens the dedicated
 * Notifications page (where nudges can be snoozed/dismissed and browser
 * notifications enabled), rather than a fragile in-place dropdown.
 */
export function ReminderBell() {
  const { nudges } = useReminders();
  const count = nudges.length;

  return (
    <Link
      href="/notifications"
      aria-label={count > 0 ? `${count} notifications` : "Notifications"}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      )}
    >
      {count > 0 ? (
        <BellRing className="h-4 w-4" />
      ) : (
        <Bell className="h-4 w-4" />
      )}
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
          {count}
        </span>
      )}
    </Link>
  );
}
