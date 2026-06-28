# ResQ — Google Cloud Deployment Guide

This guide deploys ResQ to **Google Cloud Run** — the recommended host for containerized Node.js/Next.js apps on Google Cloud. Cloud Run supports SSR, API routes, and streaming responses out of the box.

---

## Prerequisites

- Google Cloud account with billing enabled
- `gcloud` CLI installed: https://cloud.google.com/sdk/docs/install
- Docker installed (for local container build): https://docs.docker.com/get-docker/
- Project ID ready (from Google Cloud Console)

---

## Step 1: One-time Google Cloud Setup

### Install and authenticate

```bash
# Install gcloud CLI
curl https://sdk.cloud.google.com | bash
gcloud init

# Authenticate
gcloud auth login

# Set your project (replace PROJECT_ID with your actual project ID)
gcloud config set project PROJECT_ID
```

### Enable required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com
```

### Create Artifact Registry repository

```bash
gcloud artifacts repositories create resq \
  --repository-format=docker \
  --location=us-central1 \
  --description="ResQ container images"
```

---

## Step 2: Configure Next.js for Cloud Run

The included `next.config.ts` already has `output: "standalone"` (required for Docker):

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

The Docker `CMD` (`node server.js`) reads the `PORT` env var automatically — Cloud Run sets this to `8080` by default.

---

## Step 3: Create Dockerfile

Create `Dockerfile` in the project root:

```dockerfile
# ---- Base stage ----
FROM node:20-alpine AS base
WORKDIR /app

# ---- Dependencies stage ----
FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci

# ---- Builder stage ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- Runner stage ----
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 8080
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

**`next.config.ts` is already configured** with `output: "standalone"`:

---

## Step 4: Create .dockerignore

Create `.dockerignore` in the project root:

```
# dependencies
node_modules
npm-debug.log
yarn-error.log

# Next.js
.next
out
build

# production
.env
.env.local
.env.*.local

# misc
.DS_Store
*.pem
Thumbs.db

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# vercel
.vercel

# types
.tsbuildinfo
```

---

## Step 5: Store secrets in Secret Manager

Store your API keys securely — never bake them into the container image.

```bash
# Google AI API Key
gcloud secrets create GOOGLE_AI_API_KEY --data-file=- <<< "your_google_ai_api_key"

# Firebase (optional)
gcloud secrets create FIREBASE_PROJECT_ID --data-file=- <<< "your_firebase_project_id"
gcloud secrets create NEXT_PUBLIC_FIREBASE_API_KEY --data-file=- <<< "your_firebase_api_key"

# Grant Cloud Run service access to secrets
gcloud secrets add-iam-policy-binding GOOGLE_AI_API_KEY \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## Step 6: Build and deploy

### Option A: Manual deploy (fastest for first push)

```bash
# Build the container
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/PROJECT_ID/resq/resq:latest \
  --project=PROJECT_ID

# Deploy to Cloud Run
gcloud run deploy resq \
  --image=us-central1-docker.pkg.dev/PROJECT_ID/resq/resq:latest \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10 \
  --concurrency=80 \
  --timeout=60s \
  --set-secrets=GOOGLE_AI_API_KEY=GOOGLE_AI_API_KEY:latest
```

Your service URL will be: `https://resq-HASH-uc.a.run.app`

### Option B: GitHub Actions CI/CD (recommended)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Google Cloud Run

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2
        with:
          service_account_key: ${{ secrets.GCP_SA_KEY }}

      - name: Configure Docker auth
        run: gcloud auth configure-docker us-central1-docker.pkg.dev

      - name: Build and push container
        run: |
          gcloud builds submit \
            --tag us-central1-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/resq/resq:latest

      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy resq \
            --image=us-central1-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/resq/resq:latest \
            --region=us-central1 \
            --platform=managed \
            --allow-unauthenticated \
            --port=8080 \
            --memory=512Mi \
            --cpu=1 \
            --min-instances=0 \
            --max-instances=10 \
            --set-secrets=GOOGLE_AI_API_KEY=GOOGLE_AI_API_KEY:latest
```

**GitHub repo secrets needed:**
- `GCP_SA_KEY` — Download a JSON key for a service account with roles: `Cloud Build Editor`, `Cloud Run Admin`, `Secret Manager Secret Accessor`
- `GCP_PROJECT_ID` — Your Google Cloud project ID (set in repo → Settings → Variables)

**GitHub repo variables needed:**
- `GCP_PROJECT_ID` — Your project ID (set in repo → Settings → Variables)

---

## Step 7: Set environment variables on Cloud Run

For non-secret env vars (or if you prefer env vars over Secret Manager):

```bash
gcloud run services update resq \
  --region=us-central1 \
  --set-env-vars="NEXT_PUBLIC_GOOGLE_AI_API_KEY=your_key,NEXT_TELEMETRY_DISABLED=1,NODE_ENV=production"
```

To use Secret Manager values directly:
```bash
gcloud run services update resq \
  --region=us-central1 \
  --update-secrets=GOOGLE_AI_API_KEY=GOOGLE_AI_API_KEY:latest
```

---

## Environment variables reference

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_AI_API_KEY` | ✅ Yes | Google AI API key for the AI agent |
| `GOOGLE_AI_BASE_URL` | No | Default: `https://api.google.ai/v1` |
| `GOOGLE_AI_MODEL` | No | Default: `gemini-2.0-flash` |
| `NEXT_PUBLIC_GOOGLE_AI_API_KEY` | No | Browser-side Google AI (TTS) |
| `GOOGLE_TTS_URL` | No | Default: `https://texttospeech.googleapis.com/v1` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | No | Firebase Auth (keeps Google OAuth working) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | No | Firebase project |
| `FIREBASE_PROJECT_ID` | No | Firebase Admin |
| `GOOGLE_OAUTH_CLIENT_ID` | No | Gmail/Calendar OAuth |
| `GOOGLE_OAUTH_CLIENT_SECRET` | No | Gmail/Calendar OAuth |
| `NEXT_TELEMETRY_DISABLED` | Yes | Set to `1` — disables Next.js telemetry |
| `NODE_ENV` | Yes | Set to `production` |

---

## Custom domain (optional)

```bash
gcloud run domain-mappings create --service=resq --domain=resq.yourdomain.com
```

Then add the DNS record (verify ownership in Google Cloud Console first).

---

## Monitoring

```bash
# View logs
gcloud run logs read resq --region=us-central1 --tail=50

# View service details
gcloud run services describe resq --region=us-central1
```

---

## Local development

```bash
cd /Users/harish/Downloads/Vibe2ship/resq
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
```

For local Cloud Run testing (optional):
```bash
# Build Docker image locally
docker build -t resq .

# Run locally (mimics Cloud Run environment)
docker run -p 8080:8080 \
  -e GOOGLE_AI_API_KEY=your_key \
  -e NEXT_TELEMETRY_DISABLED=1 \
  -e NODE_ENV=production \
  resq
# Open http://localhost:8080
```

---

## Troubleshooting

### `Error: Cannot find module 'next'`
The `output: "standalone"` in `next.config.ts` requires `npm run build` to produce the standalone output. Ensure your Dockerfile runs `npm run build` before copying the standalone output.

### 502 Bad Gateway
The container started but the app crashed. Check logs:
```bash
gcloud run logs read resq --region=us-central1 --filter="severity>=ERROR"
```

### Slow cold starts
Cloud Run cold-starts the container on first request. Next.js builds are heavy — to improve cold start:
- Increase memory to `1Gi`
- Keep `min-instances=0` (only pay for what you use)
- For production, set `min-instances=1` to avoid cold starts entirely

### Streaming SSE not working
Cloud Run supports up to 64KB response headers. For streaming, make sure `--timeout=60s` is set (already in the deploy command above).

---

## Architecture overview

```
GitHub (main branch)
    │
    ▼
GitHub Actions (CI/CD)
    │
    ├── Build Docker image
    └── Push to Artifact Registry
              │
              ▼
        Google Cloud Run
        (us-central1)
        ┌──────────────┐
        │  ResQ App   │
        │  Next.js    │
        │  Port 8080  │
        └──────────────┘
              │
              ▼
         Public URL
    https://resq-HASH.uc.r.appspot.com
```
