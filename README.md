# ResQ — Your AI that doesn't wait for you to panic

> **Built for Vibe2Ship Hackathon · Problem Statement 1: The Last-Minute Life Saver**
> Coding Ninjas × Google for Developers · June 22–29, 2026

**ResQ** is an autonomous AI productivity companion that watches your deadlines, predicts what will slip 24–72 hours in advance, and **takes action for you** — drafting emails, blocking focus time, breaking down vague tasks into concrete subtasks, generating starter deliverables, and escalating risk before things break. It plans your day, books your focus blocks, and proactively nudges you before panic hits.

Unlike traditional reminder apps, ResQ **acts**, not just notifies.

---

## 🙏 Credits & Acknowledgments

### Build tools
- **[Google AI Studio](https://aistudio.google.com/)** — The primary build environment used to design prompts, plan architecture, and reason about the agent's tool definitions and function-calling shape.
- **[Antigravity IDE](https://antigravity.google/)** — The IDE in which this entire project was developed, debugged, and shipped.
- **[Gemini CLI](https://github.com/google-gemini/gemini-cli)** — Used from the command line for rapid iteration, file generation, and conversational debugging during the build.

### Frameworks & libraries

| Library | License | What it powers in ResQ |
|---|---|---|
| [Next.js 16](https://nextjs.org/) (App Router) | MIT | Server, App Router, streaming SSE, API routes, `output: "standalone"` for Docker |
| [React 19](https://react.dev/) | MIT | UI runtime |
| [TypeScript 5](https://www.typescriptlang.org/) | Apache-2.0 | Type safety, strict mode across the whole codebase |
| [Tailwind CSS v4](https://tailwindcss.com/) | MIT | Utility-first styling, `@theme` directive |
| [shadcn/ui](https://ui.shadcn.com/) (Base UI preset) | MIT | Button, Card, Badge, ScrollArea, Tooltip primitives |
| [Base UI](https://base-ui.com/) | MIT | Headless accessible primitives under shadcn |
| [Framer Motion](https://www.framer.com/motion/) | MIT | Page and component animations |
| [Lucide React](https://lucide.dev/) | ISC | Icon set throughout the UI |
| [Zustand](https://zustand-demo.pmnd.rs/) | MIT | Client-side agent store |
| [Sonner](https://sonner.emilkowal.ski/) | MIT | Toast notifications |
| [react-markdown](https://github.com/remarkjs/react-markdown) | MIT | Rendering assistant messages, voice transcripts |
| [remark-gfm](https://github.com/remarkjs/remark-gfm) | MIT | GitHub-flavored markdown in chat |
| [date-fns](https://date-fns.org/) | MIT | Date math for the planning engine |
| [tailwind-merge](https://github.com/dcastil/tailwind-merge) | MIT | `cn()` helper, conditional class merging |
| [clsx](https://github.com/lukeed/clsx) | MIT | Conditional class names |
| [class-variance-authority](https://cva.style/docs) | Apache-2.0 | Component variant definitions |
| [next-themes](https://github.com/pacocoursey/next-themes) | MIT | Light/dark theme toggle |
| [tw-animate-css](https://github.com/Wombosvideo/tw-animate-css) | MIT | Tailwind v4 animation utilities |
| [pdf-parse](https://www.npmjs.com/package/pdf-parse) | MIT | `/api/extract-doc` — pulls text from uploaded PDFs |

### Google technologies

| Technology | Role in ResQ |
|---|---|
| Google AI (OpenAI-compatible API) | Reasoning engine + tool orchestration |
| Google Cloud Text-to-Speech | Voice mode audio output |
| Firebase Auth + Google OAuth | Sign-in flow + Gmail/Calendar access tokens |
| Google Calendar API v3 | Read busy times, create focus blocks |
| Gmail API v1 | Send drafts (review-and-send in Inbox) |
| Google Cloud Run | Containerized hosting |
| Artifact Registry | Docker image storage |
| Cloud Build + GitHub Actions | CI/CD on push to `main` |

---

## ⚡ Quick Demo

🌐 **Live demo**: deployed on Google Cloud Run · ⏱️ 90-second walkthrough: see [SUBMISSION.md](./SUBMISSION.md)

```bash
# Run locally (works without API keys — mock mode active)
cd resq
npm install
npm run dev
# → http://localhost:3000
```

Try one of these in the chat:
- "I have a project due Friday at 5pm and I haven't started" → ResQ creates the task, **breaks it down into chunks**, blocks focus time, drafts an email
- "Plan my day" → ResQ books wellness routines + ranked focus blocks into your calendar automatically
- "What's at risk right now?" → ResQ scans your tasks and tells you what's slipping
- "Draft a follow-up email to my professor" → ResQ drafts it (or sends immediately if Gmail is connected)

---

## 🎯 The Problem (Problem Statement 1)

> Students, professionals, and entrepreneurs frequently miss deadlines, assignments, meetings, bill payments, interviews, and important commitments. Existing productivity tools often rely on **passive reminders** that are easy to ignore and do little to help users actually complete their tasks.

## 💡 The Solution

ResQ is built around one principle: **prevent missed deadlines, not just remind you about them.** It is *autonomous* — it watches, plans, and acts without being asked.

| Traditional tools | ResQ |
|---|---|
| Passive notifications | **Active intervention** |
| Remind at fixed times | **Adaptive reminders** based on response pattern |
| Remind once | **Auto-drafts** emails, **books focus time**, **generates deliverables** |
| Single static task list | **ResQ breaks vague tasks into scheduled chunks** |
| Reactive | **Predictive** — catches risk 24–72h before slip |
| User must ask | **ResQ plans your day automatically** |
| Single interaction | **Agentic loop** — ResQ keeps working until the task ships |

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **AI Brain** | Google AI (Gemini-compatible API) | Reasoning + planning + tool orchestration |
| **Function Calling** | Google AI `tools` (OpenAI `tools` format) | 14 typed actions the agent can take |
| **TTS** | Google Cloud Text-to-Speech | Voice mode audio output |
| **STT** | Web Speech API | Browser-native speech-to-text for voice mode |
| **Frontend** | Next.js 16 (App Router) + TypeScript strict | Type-safe React, SSR + API routes |
| **UI** | Tailwind CSS v4 + shadcn/ui (Base UI) | Modern, accessible components |
| **State** | Zustand | Client state for the agent store |
| **Database** | Firebase Firestore (prod) + in-memory mock (demo) | Realtime tasks, drafts, events, logs |
| **Auth** | Firebase Auth + Google OAuth | Sign-in + Gmail/Calendar OAuth scopes |
| **Calendar** | Google Calendar API v3 | Read busy times, create focus blocks |
| **Email** | Gmail API v1 | Send drafts (or push to user's inbox for review) |
| **Hosting** | Google Cloud Run (Docker) | Containerized deployment, auto-scales |

---

## ✨ What ResQ Does (Beyond Reminders)

### 1. **AI Plans Your Day Automatically**
Say "plan my day" or open the Tasks page → ResQ:
- Inserts your **wellness routines** (breakfast, lunch, walk, wind-down)
- Books **focus blocks** at the highest-risk tasks' slots
- Reserves time **before deadlines** (no last-minute cramming)
- Surfaces what's **skipped** and **deferred** for tomorrow

### 2. **AI Breaks Down Vague Tasks**
Click "Break down" on any task → ResQ:
- Calls the AI to generate 2–6 concrete subtasks (20–60 min each)
- **Asks for clarification** if the task is too vague (never invents generic parts)
- Schedules each subtask **backward from the parent deadline** into free gaps
- **Refuses to create duplicates** if the task is already broken down

### 3. **Panic Engine — Proactive Risk Detection**
A continuously-running loop that:
- Re-scores every active task (0–100) every 15 min
- Factors: time pressure, progress gap, dependency blocks, user energy fit
- **Auto-takes action** when risk crosses warning/critical:
  - **Critical (76+)** → Force-book 2-hour focus block + queue escalation draft
  - **Warning (51–75)** → Auto-draft help email + nudge
  - **Watch (26–50)** → Light nudge next app open

### 4. **Reminder Engine — Smart Nudges**
- **Overdue** — "X is overdue by 4h. Restart it now, even 10 minutes counts."
- **Due soon** — "X is due in 2h. Final push: wrap up and submit now."
- **High risk** — "X is trending toward a slip. Block a focus session today."
- **Starting/ending soon** — "Your focus session starts in 5 minutes. Get ready."

### 5. **Voice Mode (Hands-Free)**
- Browser-native STT (no API key) → `/api/agent` → TTS playback
- **Reads the user's profile name** and addresses them by it
- Visualizes every tool call as a card (you see what ResQ is doing)
- Falls back to a **scripted demo** when STT/TTS is unavailable

### 6. **Calendar Co-Pilot**
- Reads Google Calendar (busy + free slots)
- Blocks Do-Not-Disturb focus blocks
- Real **conflict detection** — refuses to double-book
- Marks agent-created events so you can tell them apart from yours

### 7. **Gmail Integration (Send or Draft)**
- If Gmail is connected: **send the email immediately**
- If not connected: push to the **Inbox** for one-click review
- RFC 2822 MIME format (correctly encoded base64)

### 8. **Goal & Habit Loops**
- Goals with linked tasks + milestones
- Habit streaks with longest-streak tracking
- Weekly progress visualization on the Insights page

### 9. **Insights Page**
- Live agent activity feed
- "Rescan risks" button triggers the Panic Engine manually
- Recent task changes, drafts, calendar events

### 10. **Notifications Bell**
- Smart nudges ranked overdue → due-soon → high-risk
- Each nudge includes a **concrete guide** ("Open the doc, do the easiest 25 minutes")
- Event start/end reminders ("Your focus session starts in 5 minutes")

---

## 🤖 The Agentic Heart — 14 Function-Calling Tools

ResQ has 14 hands — every action goes through a typed tool:

| Tool | Purpose |
|---|---|
| `createTask` | Add a task with deadline, priority, effort estimate |
| `rescheduleTask` | Move a task to a new deadline |
| `updateTaskStatus` | Mark in-progress / blocked / done |
| `prioritizeTasks` | Re-score all tasks by urgency × importance |
| `breakDownTask` | Split a vague task into concrete subtasks (asks clarification if needed) |
| `planMyDay` | Build today's timeline (routines + focus blocks) and book into calendar |
| `draftEmail` | Send via Gmail OR push draft to Inbox (never sends without confirmation) |
| `blockFocusTime` | Book a Do-Not-Disturb block in calendar (with conflict detection) |
| `escalateRisk` | Raise risk score + trigger proactive alert |
| `generateDeliverable` | Create a starter doc/outline from template |
| `createReminder` | Schedule an adaptive reminder |
| `fetchCalendarEvents` | Always called before scheduling |
| `fetchTasks` | Get user's tasks for context |
| `createGoal` | High-level outcome with milestones |

### The Agentic Loop

```
┌──────────────────────────────────────────────┐
│  User message or scheduled trigger           │
│  (chat / voice / Panic Engine / notification)│
└────────────────┬─────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────┐
│  1. Build context (user, tasks, calendar,    │
│     history, recent activity)                │
│  2. Call Google AI with system prompt +      │
│     14 tools + context                       │
│  3. AI returns tool_calls (one or many)      │
└────────────────┬─────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────┐
│  Client-side executor runs each tool call    │
│  against the data repository (Firestore or   │
│  mock). Returns a ToolResult per action.    │
└────────────────┬─────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────┐
│  Synthesizer narrates results in plain       │
│  English. Updates UI, logs to audit trail,   │
│  fires notifications.                        │
└──────────────────────────────────────────────┘
```

**Two execution paths:**
- **Chat / Voice** — User triggers → AI plans → executor runs → UI updates
- **Proactive** — Panic Engine detects risk crossing threshold → executor runs deterministic actions → user sees nudge in Notifications

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Next.js App (Google Cloud Run, port 8080)                   │
│  ├─ /chat            Streaming agent chat                    │
│  ├─ /dashboard       Agent-first home                       │
│  ├─ /tasks           Live task list with risk badges        │
│  ├─ /inbox           Review & send AI drafts                │
│  ├─ /calendar        Focus blocks + meetings                │
│  ├─ /voice           STT → /api/agent → TTS                 │
│  ├─ /goals           Long-term outcomes                     │
│  ├─ /insights        Panic Engine + activity log            │
│  ├─ /notifications   Smart nudges + event reminders         │
│  └─ /settings        Profile, energy pattern, OAuth scopes  │
└────────┬─────────────────────────────────────────────────────┘
         │
         ▼  POST /api/agent (SSE streaming)
┌──────────────────────────────────────────────────────────────┐
│  ResQ Agent Orchestrator                                     │
│  ├─ Build context (user, tasks, calendar, history)           │
│  ├─ Google AI + system prompt + 14 tools                     │
│  ├─ Stream tool calls to client                              │
│  └─ Synthesize final reply                                   │
└────────┬─────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│  Client-Side Tool Executor                                   │
│  ├─ createTask / reschedule / status / prioritize            │
│  ├─ breakDownTask (AI chunking + clarification)              │
│  ├─ planMyDay (routines + chunks + focus blocks)             │
│  ├─ blockFocusTime (with conflict detection)                 │
│  ├─ draftEmail (send if Gmail connected, else save draft)   │
│  ├─ escalateRisk / createReminder / createGoal               │
│  └─ generateDeliverable / fetch*                             │
└────────┬─────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│  Data Repository (single source of truth)                    │
│  ├─ Firestore (prod): realtime onSnapshot                    │
│  └─ REST + mock store (demo): in-memory, Firestore-shaped    │
└────────┬─────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│  Services                                                    │
│  ├─ Google AI          chat/completions + tools              │
│  ├─ Google Cloud TTS   text-to-speech for voice mode         │
│  ├─ Firestore          tasks, events, drafts, goals, logs    │
│  ├─ Gmail API          users.me.drafts.create / send         │
│  └─ Calendar API       events.insert for focus blocks        │
└──────────────────────────────────────────────────────────────┘
```

---

## 🧠 The Planning Engine (ResQ's Brain)

The **resq/lib/agent/planner.ts** module is pure functions that turn a flat task list into a plan:

| Function | What it does |
|---|---|
| `panicScore(task)` | 0–100 risk score from time pressure + importance + progress |
| `findFreeSlots(...)` | Free focus slots inside work hours, subtracting existing events |
| `assignChunkSlots(...)` | Schedules subtask slots backward from parent deadline |
| `buildDaySchedule(...)` | Full day: wellness routines + tasks at deadline + focus blocks in free gaps |
| `isPersonalActivity(...)` | Detects meals, gym, etc. (scheduled AT deadline, not flex time) |
| `scheduleChunksForParent(...)` | Chunk subtasks fit into free slots BEFORE parent due time |
| `planBreakDown(...)` | Fallback deterministic chunk splitter when AI unavailable |

**Built-in wellness routines** (auto-inserted into every plan if free):
- Breakfast (07:30–08:00)
- Morning walk (08:00–08:20)
- Lunch (12:30–13:00)
- Afternoon break (15:00–15:15)
- Evening wind-down (21:30–22:00)

---

## 📦 Project Structure

```
resq/
├── src/
│   ├── app/
│   │   ├── api/                          # Server endpoints (12 routes)
│   │   │   ├── agent/                    # SSE streaming chat
│   │   │   ├── panic-engine/             # Proactive risk scan
│   │   │   ├── break-down/               # AI task chunking
│   │   │   ├── tasks/                    # CRUD
│   │   │   ├── drafts/                   # CRUD
│   │   │   ├── drafts/ai-compose/        # AI email composer
│   │   │   ├── events/                   # Calendar events
│   │   │   ├── goals/                    # Goals CRUD
│   │   │   ├── habits/                   # Habits CRUD
│   │   │   ├── agent-logs/               # Agent activity feed
│   │   │   ├── extract-doc/              # PDF text extraction
│   │   │   └── profile/                  # User profile
│   │   ├── (app)/                        # Authenticated routes (shell)
│   │   │   ├── chat/                     # Chat-first agent UI
│   │   │   ├── dashboard/                # Agent-first home
│   │   │   ├── tasks/                    # Task list + risk badges
│   │   │   ├── inbox/                    # Drafts review
│   │   │   ├── calendar/                 # Focus blocks + meetings
│   │   │   ├── voice/                    # STT → LLM → TTS
│   │   │   ├── goals/                    # Long-term outcomes
│   │   │   ├── insights/                 # Activity feed + Panic Engine
│   │   │   ├── notifications/            # Smart nudges bell
│   │   │   ├── settings/                 # Profile + OAuth scopes
│   │   │   └── loading.tsx
│   │   ├── login/                        # Auth entry
│   │   ├── page.tsx                      # Marketing landing
│   │   ├── layout.tsx
│   │   ├── error.tsx
│   │   └── global-error.tsx
│   ├── components/
│   │   ├── auth-provider.tsx             # Firebase Auth + demo mode
│   │   ├── chat/                         # ChatPanel, ToolActionCard, Markdown
│   │   ├── shared/                       # AppSidebar, ThemeToggle
│   │   ├── mini-calendar.tsx
│   │   ├── full-screen-loader.tsx
│   │   └── ui/                           # shadcn primitives
│   ├── lib/
│   │   ├── google-ai/                    # client, tools, prompts, sanitize
│   │   ├── agent/                        # orchestrator, planner, panic-engine,
│   │   │                                 # reminder-engine, actions, executor,
│   │   │                                 # context, stream, plan-filter, task-sync
│   │   ├── data/                         # repository, pool, calendar-sync, pool-sync
│   │   ├── voice/                        # demo, google-tts, google-live, types
│   │   ├── google/                       # gmail, oauth
│   │   ├── store/                        # mock-store (in-memory fallback)
│   │   ├── firebase/                     # client, firestore
│   │   └── utils.ts
│   ├── stores/                           # Zustand: agent-store
│   ├── hooks/                            # use-collection
│   └── types/                            # task, agent
├── Dockerfile                            # Multi-stage Cloud Run build
├── .dockerignore
├── .github/workflows/deploy.yml          # Auto-deploy to Cloud Run
├── DEPLOY.md                             # Cloud Run deployment guide
├── SUBMISSION.md                         # Hackathon submission content
└── README.md                             # (this file)
```

---

## 🧪 How to Evaluate (Judges)

1. **Visit the live deployment** (link in submission)
2. **Try the interactive demo** — no signup required, click "Try demo"
3. **Suggested 90-second test**:
   - Land on homepage → see hero + 10 features
   - Click "Try ResQ now" → chat dashboard
   - Type: "I have a project due Friday and I haven't started" → ResQ creates the task, **breaks it down into chunks**, blocks focus blocks, drafts an email
   - Click "Plan my day" → ResQ books wellness routines + focus blocks into your calendar
   - Click "Tasks" → see the task with risk badge + the broken-down subtasks
   - Click "Inbox" → see drafted email
   - Click "Notifications" → see smart nudges ranked by urgency
   - Click "Insights" → "Rescan risks" triggers the Panic Engine
   - Click "Voice Mode" → tap the mic orb to start a hands-free session

---

## 📊 Maps to Evaluation Matrix

| Criterion | Weight | How ResQ scores |
|---|---|---|
| **Problem Solving & Impact** | **20%** | Real pain (missed deadlines) → real solution (autonomous planning + proactive action) |
| **Agentic Depth** | **20%** | 14 function-calling tools + proactive Panic Engine + planner that takes action without being asked |
| **Innovation & Creativity** | **20%** | "Don't wait for panic" — preventive vs reactive; AI plan-my-day; AI task chunking with clarification; smart nudge guides; Gmail-send-or-draft fallback |
| **Usage of Google Technologies** | **15%** | Google AI + Cloud TTS + Firebase Auth + Google OAuth + Calendar API + Gmail API + Cloud Run + Cloud Build |
| **Product Experience & Design** | **10%** | Polished UI, dark mode, responsive, smooth animations, brand-consistent |
| **Technical Implementation** | **10%** | TS strict, streaming SSE, planner + executor separation, Firestore + mock dual backend, Docker + Cloud Run |
| **Completeness & Usability** | **5%** | Working demo without API keys, clear UI, no broken routes, seed data, mobile-friendly |

---

## 🚀 Deployment

See [DEPLOY.md](./DEPLOY.md) for full Google Cloud Run deployment instructions.

```bash
npm run build       # production build
npm run start       # serve production locally
```

**GitHub Actions** (already configured at `.github/workflows/deploy.yml`):
- Every push to `main` auto-builds and deploys to Cloud Run
- Requires: `GCP_SA_KEY` secret + `GCP_PROJECT_ID` variable in GitHub repo settings

---

## 🔧 Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_AI_API_KEY` | ✅ Yes | Google AI API key for the AI agent |
| `GOOGLE_AI_BASE_URL` | No | Default: `https://api.google.ai/v1` |
| `GOOGLE_AI_MODEL` | No | Default: `gemini-2.0-flash` |
| `GOOGLE_TTS_URL` | No | Google Cloud TTS base URL |
| `NEXT_PUBLIC_GOOGLE_AI_API_KEY` | No | Browser-side Google AI key |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | No | Firebase Auth |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | No | Firebase project |
| `GOOGLE_OAUTH_CLIENT_ID` | No | Gmail/Calendar OAuth |
| `GOOGLE_OAUTH_CLIENT_SECRET` | No | Gmail/Calendar OAuth |
| `GMAIL_ACCESS_TOKEN` | No | Server-side Gmail access |
| `NEXT_TELEMETRY_DISABLED` | Yes | Set to `1` — disables Next.js telemetry |
| `NODE_ENV` | Yes | Set to `production` in Cloud Run |

---

## 📝 License

MIT — built for Vibe2Ship, free for the community.

---

**Built with 🔥 by Harish for Vibe2Ship 2026**
*Developed in [Antigravity IDE](https://antigravity.google/) · Designed in [Google AI Studio](https://aistudio.google.com/) · Shipped with [Gemini CLI](https://github.com/google-gemini/gemini-cli)*