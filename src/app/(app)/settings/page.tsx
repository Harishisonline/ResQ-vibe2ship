"use client";

import { useEffect, useState } from "react";
import { Clock, Sunrise, Sun, Sunset, Moon, Save, BellRing, BellOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/auth-provider";
import { useReminders } from "@/components/reminder-provider";
import { cn } from "@/lib/utils";
import * as repo from "@/lib/data/repository";
import type { EnergyPattern } from "@/lib/store/mock-store";

const PATTERNS: {
  key: EnergyPattern;
  label: string;
  hint: string;
  icon: typeof Sunrise;
}[] = [
  { key: "morning", label: "Morning", hint: "Best focus 6a–11a", icon: Sunrise },
  { key: "afternoon", label: "Afternoon", hint: "Best focus 11a–5p", icon: Sun },
  { key: "evening", label: "Evening", hint: "Best focus 5p–9p", icon: Sunset },
  { key: "night", label: "Night", hint: "Best focus 9p–2a", icon: Moon },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const userId = user?.uid ?? "demo-user";
  const { permission, requestPermission } = useReminders();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [energy, setEnergy] = useState<EnergyPattern>("morning");
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("17:00");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await repo.profile.get(userId);
        if (cancelled) return;
        setName(p.name ?? user?.displayName ?? "");
        setEnergy(p.energyPattern);
        setWorkStart(p.workHours.start);
        setWorkEnd(p.workHours.end);
      } catch {
        if (!cancelled) setName(user?.displayName ?? "");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, user?.displayName]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await repo.profile.save(userId, {
        name: name.trim() || undefined,
        energyPattern: energy,
        workHours: { start: workStart, end: workEnd },
      });
      toast.success("Profile saved. ResQ will call you by name and plan around your energy.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Tell ResQ when you focus best so it schedules work around your energy.
          </p>
        </div>

        {loading ? (
          <Skeleton className="h-72" />
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">What should ResQ call you?</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-name">Your name</Label>
                  <Input
                    id="profile-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Harish"
                    maxLength={60}
                  />
                  <p className="text-xs text-muted-foreground">
                    ResQ uses this to address you and personalize replies. Leave blank to use your
                    Google account name.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BellRing className="h-4 w-4" /> Proactive reminders
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    ResQ watches your deadlines and nudges you with the next concrete step
                    before things slip. Works in the background while the app is open.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      type="button"
                      variant={permission === "granted" ? "outline" : "default"}
                      size="sm"
                      onClick={async () => {
                        await requestPermission();
                        // Read the freshest permission from the DOM since context
                        // state hasn't re-rendered yet; only celebrate on grant.
                        const granted =
                          typeof window !== "undefined" && "Notification" in window
                            ? Notification.permission === "granted"
                            : false;
                        if (granted) toast.success("Reminders enabled");
                        else toast.error("Notifications were blocked. Allow them in your browser settings.");
                      }}
                      disabled={permission === "unsupported" || permission === "granted"}
                    >
                      {permission === "granted" ? (
                        <>
                          <BellRing className="mr-1.5 h-3.5 w-3.5" /> Notifications on
                        </>
                      ) : permission === "unsupported" ? (
                        <>
                          <BellOff className="mr-1.5 h-3.5 w-3.5" /> Not supported here
                        </>
                      ) : (
                        "Enable browser notifications"
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Energy pattern</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {PATTERNS.map(({ key, label, hint, icon: Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setEnergy(key)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all",
                        energy === key
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-primary/40"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-5 w-5",
                          energy === key ? "text-primary" : "text-muted-foreground"
                        )}
                      />
                      <span className="text-xs font-medium">{label}</span>
                      <span className="text-[10px] text-muted-foreground">{hint}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-4 w-4" /> Work hours
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="work-start">Start</Label>
                    <Input
                      id="work-start"
                      type="time"
                      value={workStart}
                      onChange={(e) => setWorkStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="work-end">End</Label>
                    <Input
                      id="work-end"
                      type="time"
                      value={workEnd}
                      onChange={(e) => setWorkEnd(e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                <Save className="mr-1.5 h-4 w-4" />
                {saving ? "Saving…" : "Save profile"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
