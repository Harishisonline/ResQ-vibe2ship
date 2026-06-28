"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppSidebar, MobileNav } from "@/components/shared/app-sidebar";
import { FullScreenLoader } from "@/components/full-screen-loader";
import { ReminderProvider } from "@/components/reminder-provider";
import { PoolSyncProvider } from "@/components/pool-sync-provider";
import { useAuth } from "@/components/auth-provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <FullScreenLoader message="Loading your workspace" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <PoolSyncProvider>
      <ReminderProvider>
        <div className="flex h-screen overflow-hidden bg-background">
          <AppSidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <MobileNav />
            <main className="flex-1 overflow-hidden">{children}</main>
          </div>
        </div>
      </ReminderProvider>
    </PoolSyncProvider>
  );
}
