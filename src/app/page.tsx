import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Mail,
  Mic,
  Shield,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { ResQLogo } from "@/components/resq-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const features = [
  {
    icon: Clock,
    title: "Panic Detector",
    description:
      "Watches your deadlines and surfaces risk 24-72 hours before things slip. No more 11pm surprises.",
    accent: "from-orange-500 to-red-500",
  },
  {
    icon: Sparkles,
    title: "Rescue Agent",
    description:
      "When a deadline is at risk, ResQ doesn't just warn. It acts. Drafts emails, books focus time, generates starter files.",
    accent: "from-amber-500 to-orange-500",
  },
  {
    icon: Calendar,
    title: "Calendar Co-Pilot",
    description:
      "Natural-language scheduling with conflict detection. ResQ reverse-engineers your deadline into focus blocks.",
    accent: "from-blue-500 to-cyan-500",
  },
  {
    icon: TrendingUp,
    title: "Priority Brain",
    description:
      "Google AI-powered Eisenhower ranking with your energy patterns. Know what to do next without thinking.",
    accent: "from-purple-500 to-pink-500",
  },
  {
    icon: Mic,
    title: "Voice Wake-Word",
    description:
      "'Hey ResQ, what's about to blow up?' Get a hands-free briefing whenever you need it.",
    accent: "from-green-500 to-emerald-500",
  },
  {
    icon: Shield,
    title: "Context-Aware Nudges",
    description:
      "Reminders that learn when you actually respond. Early if you're a procrastinator, gentle if you're focused.",
    accent: "from-indigo-500 to-violet-500",
  },
];

const agentActions = [
  { icon: FileText, label: "Generated project outline in Drive", time: "2 min ago" },
  { icon: Calendar, label: "Blocked 90 min focus session tomorrow 9am", time: "5 min ago" },
  { icon: Mail, label: "Drafted follow-up email for review", time: "12 min ago" },
  { icon: CheckCircle2, label: "Marked 'Lab report' as in-progress", time: "1 hr ago" },
];

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated background */}
      <div className="gradient-mesh absolute inset-0 -z-10 opacity-60" />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <ResQLogo size="md" />
          <nav className="hidden items-center gap-1 md:flex">
            <Link
              href="#features"
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Features
            </Link>
            <Link
              href="#how-it-works"
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              How it works
            </Link>
            <Link
              href="#tech"
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Tech
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" className="hidden sm:inline-flex" nativeButton={false} render={<Link href="/login" />}>
              Sign in
            </Button>
            <Button nativeButton={false} render={<Link href="/dashboard" />}>
              Try the demo <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative px-4 pt-16 pb-24 sm:px-6 sm:pt-24 sm:pb-32 lg:px-8">
        <div className="mx-auto max-w-5xl text-center">
          <Badge variant="secondary" className="mb-6 animate-fade-in gap-1.5">
            <Zap className="h-3 w-3 text-primary" />
            Built for Vibe2Ship · Coding Ninjas × Google for Developers
          </Badge>

          <h1 className="animate-slide-up text-balance text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
            Your AI that{" "}
            <span className="bg-gradient-to-r from-primary via-orange-500 to-amber-500 bg-clip-text text-transparent">
              doesn&apos;t wait
            </span>
            <br />
            for you to panic.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl animate-slide-up text-balance text-lg leading-8 text-muted-foreground sm:text-xl">
            ResQ is an autonomous productivity companion that watches your
            deadlines, predicts what will slip, and{" "}
            <strong className="text-foreground">does the work for you</strong>:
            drafts emails, books focus time, generates starter files.
          </p>

          <div className="mt-10 flex animate-slide-up flex-col items-center justify-center gap-4 sm:flex-row">
            <Button
              size="lg"
              className="group h-12 px-6 text-base"
              nativeButton={false}
              render={<Link href="/dashboard" />}
            >
              Try ResQ now
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-12 px-6 text-base"
              nativeButton={false}
              render={<Link href="#features" />}
            >
              See how it works
            </Button>
          </div>

          {/* Demo preview */}
          <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {agentActions.map((action, i) => (
              <div
                key={action.label}
                className="animate-fade-in rounded-xl border border-border/60 bg-card/60 p-4 text-left shadow-sm backdrop-blur transition-all hover:-translate-y-1 hover:shadow-md"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <action.icon className="mb-2 h-5 w-5 text-primary" />
                <p className="text-sm font-medium leading-tight">{action.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{action.time}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border/40 px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <Badge variant="outline" className="mb-4">
              What ResQ does
            </Badge>
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              Eight ways ResQ has your back
            </h2>
            <p className="mt-4 text-pretty text-lg text-muted-foreground">
              Every feature is built around one principle: prevent missed deadlines, not just remind you about them.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 transition-all hover:-translate-y-1 hover:border-border hover:shadow-xl"
              >
                <div
                  className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${feature.accent} text-white shadow-lg`}
                >
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="border-t border-border/40 bg-muted/30 px-4 py-24 sm:px-6 lg:px-8"
      >
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <Badge variant="outline" className="mb-4">
              How it works
            </Badge>
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              From panic to plan in three steps
            </h2>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Tell ResQ",
                body: "Drop a deadline in chat: 'Project due Friday 5pm.' ResQ immediately checks your calendar and tasks.",
              },
              {
                step: "02",
                title: "ResQ plans",
                body: "Google AI calculates real effort, reverse-engineers a schedule, and books focus blocks. You see every action.",
              },
              {
                step: "03",
                title: "You ship",
                body: "ResQ watches for risk, drafts help when you fall behind, and reminds you only when it matters.",
              },
            ].map((step) => (
              <div key={step.step} className="relative">
                <div className="text-7xl font-bold text-primary/15">{step.step}</div>
                <h3 className="-mt-6 mb-3 text-xl font-semibold">{step.title}</h3>
                <p className="text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech */}
      <section id="tech" className="border-t border-border/40 px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <Badge variant="outline" className="mb-4">
              Built with Google AI
            </Badge>
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              Powered by Google, designed for action
            </h2>
            <p className="mt-4 text-pretty text-lg text-muted-foreground">
              ResQ uses Google AI with function calling to take real action,
              not just chat.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[
              "Google AI",
              "Function Calling",
              "Google TTS",
              "Firebase",
              "Firestore",
              "Next.js 16",
            ].map((tech) => (
              <div
                key={tech}
                className="flex items-center justify-center rounded-xl border border-border/60 bg-card px-4 py-6 text-sm font-medium transition-colors hover:bg-accent"
              >
                {tech}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/40 px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Stop missing deadlines. Start shipping.
          </h2>
          <p className="mt-4 text-pretty text-lg text-muted-foreground">
            Try the interactive demo. No signup required.
          </p>
          <Button
            size="lg"
            className="group mt-8 h-12 px-8 text-base"
            nativeButton={false}
            render={<Link href="/dashboard" />}
          >
            Launch demo
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
          <ResQLogo size="sm" />
          <p className="text-xs text-muted-foreground">
            Built for Vibe2Ship · Coding Ninjas × Google for Developers · 2026
          </p>
        </div>
      </footer>
    </div>
  );
}
