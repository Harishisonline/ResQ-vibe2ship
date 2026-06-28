# ResQ — Vibe2Ship Submission Google Doc Content

> Copy this document into a Google Doc and share it publicly for submission.
> Required section headers per the hackathon guidelines.

---

## 1. Problem Statement Selected

**Problem Statement 1: The Last-Minute Life Saver**

> Students, professionals, and entrepreneurs frequently miss deadlines, assignments, meetings, bill payments, interviews, and important commitments. Existing productivity tools often rely on passive reminders that are easy to ignore and do little to help users actually complete their tasks.

**Challenge:** Build an AI-powered productivity companion that proactively assists users in planning, prioritizing, and completing tasks before deadlines are missed. The solution should move beyond traditional reminders and focus on helping users take meaningful action.

---

## 2. Solution Overview

**ResQ** is an autonomous AI productivity companion that doesn't wait for you to panic. It watches your deadlines, predicts what will slip 24–72 hours in advance, and **takes action on your behalf** — drafting emails, booking focus time, breaking down vague tasks into concrete subtasks, generating starter deliverables, and escalating risk before things break.

The product is built around one principle: **prevent missed deadlines, not just remind you about them.** ResQ is *autonomous* — it plans your day, books your focus blocks, and proactively nudges you before panic hits.

### How ResQ differs from traditional reminder apps

| Traditional tools | ResQ |
|---|---|
| Passive notifications | Active intervention |
| Remind at fixed times | Adaptive reminders based on response pattern |
| Remind once | Auto-drafts emails, books focus time, generates deliverables |
| Single static task list | ResQ **breaks vague tasks into scheduled chunks** |
| Reactive (you miss → it nags) | Predictive (catches risk before slip) |
| User must ask | ResQ **plans your day automatically** |
| Single interaction | **Agentic loop** — ResQ keeps working until the task ships |

### The autonomous loop

1. **Watch** — ResQ continuously monitors your tasks, calendar, and Gmail
2. **Score** — Every task gets a 0–100 risk score recalculated every 15 minutes by the **Panic Engine**
3. **Plan** — When you ask "plan my day," ResQ books your wellness routines + ranked focus blocks into your calendar automatically
4. **Break down** — When a task is vague, ResQ asks for clarification or generates concrete subtasks (20–60 min each) scheduled **backward from the deadline**
5. **Act** — When risk crosses into warning/critical, ResQ takes automatic action via 14 typed tools
6. **Confirm** — Every action is reversible in one click; drafts are pushed to your Inbox for review, never sent directly
7. **Learn** — ResQ adapts reminder timing based on your response history

---

## 3. Key Features (mapped to the problem statement)

All eight features from the problem statement, with corresponding ResQ implementations.

### F1. Intelligent task prioritization ✅
- AI-powered Eisenhower ranking (urgency × importance)
- Considers user energy pattern (morning/afternoon/evening/night) when scheduling
- Dynamic priority adjustment based on remaining time vs effort
- **`prioritizeTasks` tool** — re-scores all tasks in one agent call

### F2. AI-powered scheduling assistance ✅
- Natural-language: "Block focus time tomorrow morning" → ResQ parses intent, checks calendar, books
- **Reverse-engineers deadlines** into multiple focus blocks (no last-minute cramming)
- **Conflict detection** — refuses to double-book over existing events
- **`planMyDay` tool** — builds a full day timeline: wellness routines + tasks at deadline + focus blocks in free gaps
- **`blockFocusTime` tool** — single-shot focus block booking

### F3. Personalized productivity recommendations ✅
- ResQ tells you what to work on next based on risk score + energy pattern
- Adapts to your response history (early reminder if you're a procrastinator, gentle if focused)
- **Smart nudges** in the Notifications page: overdue → due-soon → high-risk

### F4. Context-aware reminders ✅
- Adaptive timing — ResQ adjusts reminder lead-time based on past behavior
- Strategy types: `fixed`, `context_aware`, `adaptive`
- Snooze patterns inform future timing
- **5 nudge kinds**: overdue, due_soon, high_risk, starting_soon, ending_soon
- Each nudge includes a **concrete guide** (e.g., "Open the doc and do the easiest 25 minutes")

### F5. Calendar integration ✅
- Read+write Google Calendar API v3
- Auto-book Do-Not-Disturb focus blocks
- Manual events stay separate from agent-created events (visible as "AI" badges)
- **Calendar pool-sync** — keeps agent-created events in sync with task status changes

### F6. Goal and habit tracking ✅
- Goals with linked tasks + milestones (semester, quarter, year)
- Habit streaks with longest-streak tracking
- Weekly progress visualizations on Insights page
- **`createGoal` tool** — long-term outcomes with milestones

### F7. Voice-enabled assistance ✅
- Web Speech API (browser built-in, no API key) for speech-to-text
- Google Cloud Text-to-Speech for voice output
- **Real voice loop**: STT → `/api/agent` → TTS playback
- Reads the user's profile name and addresses them by it
- Visualizes every tool call as a card
- Falls back to a scripted demo when STT/TTS is unavailable

### F8. Autonomous task planning and execution ✅ **← The differentiator**
- **14 function-calling tools** (full list in section 8)
- Proactive **Panic Engine** runs continuously via API endpoint
- Takes action without being asked: drafts, schedules, generates, escalates
- **`breakDownTask` tool** — AI splits vague tasks into concrete subtasks with clarification fallback
- **`planMyDay` tool** — autonomous day planning with routines + chunks + focus blocks
- Full audit trail visible in Insights page

---

## 4. Technologies Used

### AI / ML
- **Google AI** via OpenAI-compatible API — primary reasoning engine
- **Google Cloud TTS** — text-to-speech for voice mode output
- **Web Speech API** — speech-to-text for voice mode input
- **Function Calling** — 14 typed tools for agentic actions (Google AI `tools` format)

### Frontend
- Next.js 16 (App Router) with TypeScript strict mode
- React 19
- Tailwind CSS v4 with `@theme` directive
- shadcn/ui (Base UI preset)
- Framer Motion (animations)
- Zustand (state management)
- Lucide React (icons)
- react-markdown + remark-gfm (chat rendering)

### Backend / Data
- Firebase Firestore (production) — realtime `onSnapshot` sync
- In-memory mock store (demo mode) — REST API, Firestore-shaped
- Firebase Auth (Google provider with Calendar + Gmail scopes)
- Single client-side repository that auto-switches between Firestore and mock

### Integrations
- Google Calendar API v3 (read + write events)
- Gmail API v1 (`users.me.drafts.create` / `users.me.messages.send`) — sends if connected, drafts if not

### Tooling
- Docker (multi-stage build)
- Google Cloud Run (deployment)
- GitHub Actions CI/CD (auto-deploy on push)
- TypeScript 5.x with strict mode
- ESLint

### Build & dev tools
- **[Google AI Studio](https://aistudio.google.com/)** — primary design + prompt-iteration environment
- **[Antigravity IDE](https://antigravity.google/)** — the IDE used to develop the entire codebase
- **[Gemini CLI](https://github.com/google-gemini/gemini-cli)** — rapid iteration + file generation

### Deployment
- **Google Cloud Run** (Docker container, port 8080)
- Auto-scales from 0 to 10 instances
- GitHub Actions pipeline: `git push main` → Cloud Build → Artifact Registry → Cloud Run

---

## 5. Google Technologies Utilized

This is the heart of the submission — ResQ uses Google across the stack:

| Category | Google Technology | How ResQ uses it |
|---|---|---|
| **AI / Voice** | Google AI + Google Cloud TTS | Primary reasoning engine + text-to-speech |
| **Auth** | Firebase Auth with Google provider | Sign-in flow + Google OAuth access tokens for Gmail/Calendar APIs |
| **Calendar API** | Google Calendar v3 | Read busy times, create focus blocks |
| **Gmail API** | Gmail v1 (`users.me.drafts.create` + `users.me.messages.send`) | Send drafts (or push to user's inbox for review) |
| **OAuth 2.0** | Google OAuth with scopes | `calendar.readonly`, `calendar.events`, `gmail.compose`, `gmail.send` |
| **Hosting** | Google Cloud Run | Containerized deployment with auto-scaling |
| **Container Registry** | Artifact Registry | Stores Docker images for Cloud Run |
| **CI/CD** | GitHub Actions + Cloud Build | Auto-deploy on every push to `main` |
| **Monitoring** | Cloud Run logging | Centralized logs, error tracking |
| **Build tools** | Google AI Studio + Antigravity IDE + Gemini CLI | Design, develop, and ship the codebase |

**Google Cloud Run satisfies the hosting/deployment requirement**: ResQ runs as a Docker container on Google's infrastructure, auto-scales, and is accessed via a public HTTPS URL.

---

## 6. Live Demo Link

🌐 **[INSERT DEPLOYMENT URL AFTER DEPLOY TO CLOUD RUN]**

Example once deployed:
```bash
gcloud run services describe resq --region=us-central1 --format="value(status.url)"
```

---

## 7. Agentic Depth — Why This Scores High

The **ResQ agent** is the centerpiece of the "agentic depth" criterion. It is autonomous on three fronts:

### A. The Planner (pure deterministic)
A module of pure functions (`src/lib/agent/planner.ts`) that turns a flat task list into a plan:
- `panicScore(task)` — 0–100 score from time pressure + importance + progress
- `findFreeSlots(...)` — free focus slots inside work hours
- `assignChunkSlots(...)` — schedules subtask slots backward from parent deadline
- `buildDaySchedule(...)` — full day: routines + chunks + focus blocks + deadline markers
- **Built-in wellness routines**: breakfast, lunch, walk, wind-down — auto-inserted if free

### B. The Panic Engine (proactive)
A continuously-running risk-detection loop (`src/lib/agent/panic-engine.ts`):
1. **Scans** every active task in the user's context
2. **Scores** each one 0–100 based on four factors:
   - Time pressure (deadline proximity): 0–40 points
   - Progress gap (estimated vs actual effort): 0–30 points
   - Dependency block (waiting on someone): 0–15 points
   - Energy fit (task at peak hours?): 0–15 points
3. **Escalates** when risk crosses from safe/watch into warning/critical
4. **Acts** autonomously — drafts help emails, books emergency focus blocks, generates starter deliverables
5. **Logs** every action to an audit trail visible in the Insights page

**Trigger**: `POST /api/panic-engine { userId }` returns a full scan report.

### C. The AI Agent (reactive + smart)
A 14-tool agent that the user talks to in chat or voice:
1. Builds a live context from the data repository
2. Calls Google AI with system prompt + tools + context
3. Executes the AI's tool calls on the client (writes to Firestore / sends via Gmail / books calendar)
4. Synthesizes a plain-English reply that shows what it did

### Panic Engine risk levels

| Level | Score | Action |
|---|---|---|
| Safe | 0–25 | No action, trust the user |
| Watch | 26–50 | Light nudge on next app open |
| Warning | 51–75 | Proactive nudge + auto-draft help email |
| Critical | 76–100 | Force-book 2-hour focus block + queue escalation draft + red banner |

### The key differentiator
ResQ doesn't wait for the user to ask. It identifies risk and takes action proactively — the definition of an agentic system. And when the user *does* engage (chat / voice), the agent can break down vague tasks, plan a full day, draft emails, and book focus time in one turn.

---

## 8. The 14 Tools (Function Calling)

Every tool is declared in Google AI `tools` format and executed by the client-side executor against the live data repository:

```
createTask          — Add a task with deadline, priority, effort estimate
rescheduleTask      — Move a task to a new deadline
updateTaskStatus    — Mark in-progress / blocked / done
prioritizeTasks     — Re-score all tasks by urgency × importance
breakDownTask       — Split a vague task into scheduled subtasks (asks clarification if needed)
planMyDay           — Build today's timeline and book focus blocks into calendar
draftEmail          — Send via Gmail OR push draft to Inbox (never sends without confirmation)
blockFocusTime      — Book a Do-Not-Disturb block in calendar (with conflict detection)
escalateRisk        — Raise risk score + trigger proactive alert
generateDeliverable — Create a starter doc/outline from template
createReminder      — Schedule an adaptive reminder
fetchCalendarEvents — Always called before scheduling (checks conflicts)
fetchTasks          — Get user's tasks for context
createGoal          — High-level outcome with milestones
```

---

## 9. Two-Minute Demo Script

1. **0–15s**: Land on homepage. See hero "Your AI that doesn't wait for you to panic." Click "Try ResQ now."
2. **15–30s**: Chat dashboard loads in demo mode. Type: "I have a project due Friday at 5pm and I haven't started."
3. **30–60s**: Watch the agent work. ResQ will likely:
   - Call `createTask` (task created with risk score)
   - Call `breakDownTask` (asks "what does this involve?" or returns concrete subtasks scheduled backward from Friday)
   - Call `blockFocusTime` (3 focus blocks booked before Friday)
   - Call `draftEmail` (a follow-up email drafted in the Inbox)
4. **60–90s**: Click "Tasks" — see the task with risk badge + the broken-down subtasks with scheduled times. Click "Plan my day" — see your calendar get populated with wellness routines + focus blocks. Click "Notifications" — see the smart nudges ranked by urgency. Click "Voice Mode" — tap the mic orb and start a hands-free session.
5. **90s**: Done. ResQ has planned more in 90 seconds than most productivity apps do in a week.

---

**Built with 🔥 by Harish for Vibe2Ship 2026**
*Developed in [Antigravity IDE](https://antigravity.google/) · Designed in [Google AI Studio](https://aistudio.google.com/) · Shipped with [Gemini CLI](https://github.com/google-gemini/gemini-cli)*