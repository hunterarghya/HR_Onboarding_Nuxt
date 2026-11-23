# HR Recruitment Dashboard

> An AI-powered, end-to-end recruitment automation platform built with **Nuxt 4**, **PostgreSQL**, **BullMQ + Redis**, **an LLM (Groq, Gemini or a local Ollama)**, **Qdrant vector search**, and **Google Workspace APIs**. It automates every stage of hiring — from posting job descriptions and collecting resumes from Gmail, WhatsApp and Google Forms, to scoring and shortlisting candidates, scheduling interviews, and sending invitations and offer letters.

[![Nuxt UI](https://img.shields.io/badge/Made%20with-Nuxt%20UI-00DC82?logo=nuxt&labelColor=020420)](https://ui.nuxt.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](./docker-compose.yml)

---

## ⚠️ License Notice

This project is built on top of the **[Nuxt UI Dashboard Template](https://github.com/nuxt-ui-templates/dashboard)**, originally created by [Nuxt UI Templates](https://github.com/nuxt-ui-templates) and licensed under the **MIT License**.

> The original template's copyright notice and license are preserved as required by the MIT License terms. See [`LICENSE`](./LICENSE) and [`README.nuxt-template.md`](./README.nuxt-template.md) for the original template documentation.

All application-specific code (server APIs, AI pipeline, background tasks, database schema, UI pages) built on top of this template is developed independently for recruitment automation purposes.

---

## Table of Contents

- [Overview](#overview)
- [Use Case Walkthrough](#use-case-walkthrough)
- [Demo](#demo)
- [Tech Stack](#tech-stack)
- [Low-Level System Design & Flow](#low-level-system-design--flow)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Running the Project](#running-the-project)
- [Development (Without Docker)](#development-without-docker)
- [Project Structure](#project-structure)

---

## Overview

The HR Recruitment Dashboard is a self-hosted, AI-augmented hiring platform that replaces manual HR workflows. It collects resumes from **Gmail**, **WhatsApp groups** and **Google Forms**, reads and scores them against your job descriptions using local vector embeddings (via **Qdrant**), and automates the rest of the candidate lifecycle — shortlisting, interview scheduling with two-way **Google Calendar** sync, and email communication through the HR's own Gmail.

Slow work (scans, bulk emails, calendar syncs, preparing jobs for matching) runs as **background tasks** on BullMQ, so the app always stays responsive and you can follow every task's progress on the **Tasks** page. The AI model is pluggable: the server ships with a default (Groq, Gemini or Ollama), and each HR can plug in **their own Groq or Gemini API key** from **Settings**.

---

## Use Case Walkthrough

### Step 1 — HR Creates a Job Description (JD)

The HR signs in with Google and lands on the **Jobs** page.

- Fills in the role title, salary band, required skills, qualification, minimum experience, location and an optional application deadline.
- Optionally sets **criteria weights** (e.g., skills: 0.5, experience: 0.3, projects: 0.2) for fine-grained scoring.
- Chooses a **shortlisting mode** — `manual` (every resume is kept as *applied* for review) or `auto` (resumes at or above the **minimum score** are *shortlisted* automatically).
- On **Post Job Description**, the job is saved instantly and:
  - a public **Google Form** ("Job Application: <role>") is created for it — copy its link from the job card and share it anywhere;
  - preparing the job for resume matching (embedding it into **Qdrant**) runs in the background. The **Tasks** page shows *"“Backend Developer” is ready to match resumes"* when it's done.

---

### Step 2 — Collect Applications from Gmail, WhatsApp & Google Forms

The HR opens the **Scanners** page. Each source has the same kind of button, and each scan runs as a background task with live progress (*"Scanning… 3 / 10"*):

- **Scan Emails** — reads Gmail messages with PDF attachments received since the last scan. An AI **email classifier** first decides whether each email is a job application; only applications go further.
- **Scan WhatsApp** — link WhatsApp once by scanning the in-app **QR code**, pick the groups to watch, and the scan collects PDF resumes posted there since the last scan.
- **Scan All Forms** — reads the Google Form responses for every job (or just the forms you select) and downloads each applicant's resume, whether it's a Google Drive link or a public `https://` link. Links typed by the public are downloaded **safely**: HTTPS only, never to internal addresses, with size and time limits, and only real PDFs are accepted.

Every resume then goes through the same pipeline: text extraction → details parsed from the text (name, email, phone, experience, location, CTC) → **semantic match** against every job in Qdrant → shortlisting decision → stored. Resumes are uploaded to **ImageKit as private files** and only open through short-lived signed links. Each source remembers where it stopped, so the next scan only reads what's new.

---

### Step 3 — Review Candidates in the Table

The HR opens the **Candidates** page:

- **All Candidates** lists everyone with their applied role, AI match score, source (Gmail / WhatsApp / Google Forms), experience and status, with search, filters (role, status, source, score) and paging.
- HR moves candidates through the statuses: `applied` → `shortlisted` / `hold` / `marked` / `rejected` → `selected`.
- Resumes that match no job closely enough land in the **Open** pool for manual review.
- In **auto mode**, candidates above the job's minimum score arrive already *shortlisted*.

---

### Step 4 — Schedule an Interview Event

The HR opens the **Interviews** page and creates an event:

- Picks the job role, date, start and end time, mode (`online` / `offline`), venue or meeting link, **Max Candidates** and extra (backup) candidates.
- The event is saved and, by default, also created on the HR's **Google Calendar**.
- It works the other way too: **Sync Google Calendar** reads interview events created directly in Google Calendar, and an AI **calendar agent** turns them into interview events (role, date, time, mode, venue). With a public HTTPS address configured, Google **pushes** calendar changes to the app, which syncs automatically; a daily background task keeps that subscription alive.

---

### Step 5 — Assign Candidates to Interview Slots

Once an event exists:

- **Manual** — pick candidates from the eligible pool (best scores first) and save the list for the event.
- **Auto-Assign** — fills the event's slots (max + extra) with the best-scoring eligible candidates of that role who aren't already in another event.
- **Auto-Assign All** — spreads a role's eligible candidates across all of its events in date order, best scores first.

---

### Step 6 — Select / Reject Candidates

After interviews:

- HR marks candidates `selected` or `rejected` from the Candidates page.
- Selecting a candidate asks for the **offer details** (offered role, salary, location, joining date). Selected candidates appear in their own **Selected Candidates** table, filterable by offered role and location.

---

### Step 7 — Trigger Emails (Interview Invites / Offer Letters)

The **Templates** page manages email templates in a rich text editor with Handlebars variables (e.g., `{{name}}`, `{{role_applied}}`, `{{interview_date}}`), with a live preview filled with sample data. Interview Invitation, Offer Letter and Rejection Mail templates are created for you on first start.

| Action | Trigger | Template Variables |
|---|---|---|
| **Interview Invite** | One event, or all events at once, from the Interviews page | `{{name}}`, `{{role_applied}}`, `{{interview_date}}`, `{{interview_start_time}}`, `{{interview_end_time}}`, `{{interview_mode}}`, `{{venue_or_link}}` |
| **Offer Letter** | **Send Offer Letters** on the selected candidates | `{{name}}`, `{{offered_role}}`, `{{offered_salary}}`, `{{offered_location}}`, `{{joining_date}}` |
| **Rejection Mail** | Template only (no send action yet) | `{{name}}`, `{{role_applied}}` |

Every template can also use `{{company_name}}` (set once per HR) and the candidate's details (`{{email}}`, `{{phone}}`, `{{current_location}}`, `{{experience_years}}`, `{{score}}`…).

- Emails are sent through the **Gmail API** from the HR's own account — no SMTP server needed.
- Sending runs as a background task, one batch at a time. Each candidate is flagged (`invite_sent`, `offer_sent`) right after their email goes out, so nobody is mailed twice, even if a batch is retried.

---

## Demo

▶️ **[Watch the demo](https://drive.google.com/file/d/1Ooza_RdNC928kJGH6aP_91JJcHm5GywK/view?usp=sharing)**

---

## Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| **Nuxt 4** | Full-stack Vue framework (SSR + server routes) |
| **Nuxt UI v4** | Component library (tables, modals, forms, toasts) |
| **Vue 3** | Reactive UI |
| **TailwindCSS v4** | Utility-first styling |
| **Tiptap** | Rich text editor for email templates |
| **VueUse** | Composable utilities |
| **date-fns** | Date formatting and manipulation |

### Backend (Nuxt Server / Nitro)
| Technology | Purpose |
|---|---|
| **Nitro (h3)** | API routes, layered as route → controller → service → repository / integration |
| **Zod** | Validation of every request body, query and parameter, and of the environment at start-up |
| **PostgreSQL 15** + **node-postgres (`pg`)** | Primary database, with versioned SQL migrations |
| **BullMQ + Redis** | Background task queues (scans, mail, background) with retries, progress and schedules |
| **Redis** | Also backs the per-user / per-IP rate limits |
| **Google APIs (`googleapis`)** | Gmail, Google Calendar, Google Forms and Google Drive |
| **Handlebars** | Email template variables |
| **jsonwebtoken** | Session tokens in an httpOnly cookie |
| **AES-256-GCM** (Node `crypto`) | Encrypts stored Google tokens and HR API keys |
| **pdf-parse** | Resume PDF text extraction |
| **whatsapp-web.js** | WhatsApp group scanning via a headless browser |
| **ImageKit** | Private resume storage with signed links |

### AI & Vector Search
| Technology | Purpose |
|---|---|
| **Groq, Gemini or Ollama** (`LLM_PROVIDER`, or each HR's own key) | Email classification and reading interview events from Google Calendar |
| **Qdrant** | Vector database for semantic JD ↔ resume matching (multi-vector: full, skills, experience) |
| **BAAI/bge-small-en-v1.5** | Local embedding model (via `@xenova/transformers`), no external calls |

### Infrastructure
| Technology | Purpose |
|---|---|
| **Docker + Docker Compose** | One-command setup of the app, Postgres, Redis, Qdrant and (optionally) Ollama |
| **Puppeteer / Chromium** | Headless browser for WhatsApp Web |
| **Vitest** | Unit tests and an API test suite against a real server, run in CI |

---

## Low-Level System Design & Flow

### Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           Browser (Nuxt UI)                              │
│  Jobs │ Scanners │ Candidates │ Templates │ Interviews │ Tasks │ Settings │
└───────────────────────┬──────────────────────────────────────────────────┘
                        │ HTTP (session in an httpOnly cookie)
┌───────────────────────▼──────────────────────────────────────────────────┐
│                       Nuxt 4 Server (Nitro / h3)                         │
│                                                                          │
│  middleware/   request id → auth (deny by default) → rate limits         │
│  api/          one-line route files → feature controllers                │
│                                                                          │
│  features/     controller → service → repository                         │
│  ├── job-roles      jobs + their vectors in Qdrant                       │
│  ├── google-forms   a public application form per job                    │
│  ├── ingestion      Gmail / WhatsApp / Forms scans + resume pipeline     │
│  ├── candidates     table, statuses, offer details, resume links         │
│  ├── interviews     events, slot assignment, calendar sync + webhook     │
│  ├── mail           interview invites, offer letters                     │
│  ├── templates      email templates + preview                            │
│  ├── ai-settings    each HR's own Groq / Gemini keys                     │
│  └── tasks          the Tasks page API                                   │
│                                                                          │
│  agents/        email-classifier, calendar-event (LLM prompts + parsing)  │
│  integrations/  google, whatsapp, llm, embeddings, qdrant, imagekit,     │
│                 http/safe-download                                       │
│  core/          db, errors, auth, rate limits, tasks (BullMQ)             │
└──────┬──────────────┬──────────────┬──────────────┬──────────────┬───────┘
       │              │              │              │              │
       ▼              ▼              ▼              ▼              ▼
  PostgreSQL        Redis          Qdrant      Groq / Gemini    Google APIs
  (jobs,         (BullMQ queues  (job vectors:  / Ollama        (Gmail, Calendar,
   candidates,    scans · mail ·  full, skills,  (LLM)           Forms, Drive)
   events,        background,     experience)                    + ImageKit
   templates,     rate limits)                                   + WhatsApp Web
   users, keys)
```

The same codebase runs as the web server, the background workers, or both (`APP_ROLE=web | worker | all`). By default one container does everything; the workers can be moved to their own container.

---

### Resume Ingestion Pipeline (Gmail / WhatsApp / Google Forms)

```
HR clicks "Scan Emails", "Scan WhatsApp" or "Scan All Forms"
        │
        ▼
POST /api/candidates/scan-mail | scan | scan-forms
  → 202 { taskId }  (one scan of each kind at a time)
  → the page follows the task's progress
        │
        ▼
Worker (scans queue) collects new PDFs since the source's last scan
  ┌──────────────────────┬──────────────────────┬─────────────────────────────┐
  │ Gmail                │ WhatsApp             │ Google Forms                │
  │ emails with PDFs     │ selected groups      │ responses per form          │
  │   │                  │   │                  │   │                         │
  │   ▼                  │   ▼                  │   ▼                         │
  │ AI email classifier: │ PDF media only       │ file upload → Drive API     │
  │ is it an application?│                      │ Drive link  → Drive API     │
  │   no → skip          │                      │ other link  → safe download │
  │                      │                      │   (https, no internal       │
  │                      │                      │    addresses, 10 MB, 15 s,  │
  │                      │                      │    must be a PDF)           │
  └──────────┬───────────┴──────────┬───────────┴──────────────┬──────────────┘
             └──────────────────────┼──────────────────────────┘
                                    ▼
                    pdf-parse → raw resume text
                                    │
                                    ▼
                    Resume parser (no AI): name, email, phone,
                    experience, location, CTC + sections
                    (skills, experience, projects)
                                    │
                                    ▼
                    Resume scorer:
                    → embed the resume (BAAI/bge-small-en-v1.5)
                    → Qdrant: top-3 closest jobs
                    → best match below 55% → "Open" pool
                    → job has criteria weights → weighted
                      section-by-section similarity
                    → { job, score 0–100 }
                                    │
                                    ▼
                    Shortlist policy:
                    manual job → keep as "applied"
                    auto job   → keep as "shortlisted" if score ≥ min_score
                                    │
                                    ▼
                    Upload PDF → ImageKit (private file)
                                    │
                                    ▼
                    Save candidate (PostgreSQL) — the same email
                    applying to the same job updates one candidate
                                    │
                                    ▼
                    Scan finished → the source's watermark moves to
                    the scan's start, so the next scan only reads new items
```

---

### Interview Scheduling Flow

```
HR creates an interview event
  → POST /api/interviews/events
  → INSERT INTO interview_events
  → Google Calendar API: create the event (unless turned off)
        │
        ▼
Google Calendar → app (two ways)
  Manual: "Sync Google Calendar" → POST /api/interviews/sync-calendar → 202 { taskId }
  Push:   Google → POST /api/interviews/webhook (channel id + secret token checked)
          → calendar.sync task queued
  Worker: events from the last 7 days to the next 60
          → AI calendar agent: is this an interview? which role, date, time, mode, venue?
          → new interviews imported, events cancelled in Google removed
  Daily:  calendar.renewChannels keeps the push subscription alive
        │
        ▼
HR assigns candidates (manual or auto)
  Manual:   PATCH /api/interviews/events/{id}/candidates/manual
  Auto:     POST  /api/interviews/events/{id}/candidates/auto
            → best eligible candidates of the role, up to max + extra
  Auto-all: POST  /api/interviews/events/auto-assign-all
            → spreads a role's candidates over its events in date order
        │
        ▼
HR sends invites
  → POST /api/mail/interview-invites/{eventId}  (or interview-invites-all)
  → 202 { taskId } → mail queue (see Email Dispatch Flow)
```

---

### Email Dispatch Flow

```
HR triggers an email action:
  ┌──────────────────────────┬───────────────────────────┐
  │  Interview Invites       │  Offer Letters            │
  │  (one event / all)       │  (selected candidates)    │
  └────────────┬─────────────┴─────────────┬─────────────┘
               ▼                           ▼
  202 { taskId } — the mail queue sends one batch at a time
               │
               ▼
  Load the chosen template (its type must match the action)
               │
               ▼
  For each candidate not yet mailed (invite_sent / offer_sent = false):
     Compile the Handlebars template with candidate + event / offer data
     + the HR's company name
               │
               ▼
     Build a MIME email → Gmail API users.messages.send
     (the HR's own Google account, OAuth)
               │
               ▼
     UPDATE … SET invite_sent / offer_sent = true   (right after each send)
               │
               ▼
  Result on the Tasks page: "12 emails sent · 1 skipped (already sent)"
```

---

### Database Schema (PostgreSQL)

```sql
users                — HR accounts (Google sign-in), company name, chosen AI provider
google_credentials   — each HR's Google tokens, encrypted (AES-256-GCM)
llm_keys             — each HR's own Groq / Gemini API keys, encrypted
job_roles            — JD definitions + shortlisting mode, min score, criteria weights
google_forms         — the application form of each job + its question map
candidates           — profiles, scores, status, source, private resume file, offer details
scan_timestamps      — where each source (Gmail, each WhatsApp group, each form) last stopped
interview_events     — interview slots (role, date, time, mode, venue, Google event id)
interview_candidates — many-to-many: event ↔ candidate + invite_sent flag
email_templates      — Handlebars HTML templates (invite, offer, rejection)
calendar_channels    — Google Calendar push subscriptions (token stored hashed)
```

Changes to the schema are versioned migrations in `server/database/migrations/` (`0001_baseline.sql` … `0012_llm_keys.sql`), applied automatically on start-up.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) with Compose v2
- A **Google Cloud project** with the Gmail, Calendar, Forms and Drive APIs enabled, and an OAuth 2.0 client whose authorised redirect URI is `http://localhost:3001/auth/google/callback`
- An [ImageKit](https://imagekit.io/) account (resumes are stored there as private files)
- For the AI model, one of: a [Groq](https://console.groq.com/keys) API key, a [Gemini](https://aistudio.google.com/apikey) API key, or a local Ollama (started by compose, see below)

---

## Environment Variables

Copy `.env.example` to `.env` and fill it in; every setting is described there. The server checks them at start-up and refuses to start with a message naming any missing or invalid one.

| Required | |
|---|---|
| `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY` | 64 random hex characters each: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ALLOWED_EMAILS` and/or `ALLOWED_EMAIL_DOMAINS` | who may sign in |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Google OAuth |
| `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT` | resume storage |
| `LLM_PROVIDER` | the server's default AI: `groq` (`GROQ_API_KEY`, `GROQ_MODEL`), `gemini` (`GEMINI_API_KEY`, `GEMINI_MODEL`) or `ollama` (`OLLAMA_MODEL`, e.g. `phi3`) |

| Optional | |
|---|---|
| `PUBLIC_BASE_URL` | the app's public `https://` address; turns on Google Calendar push notifications |
| `APP_ROLE` | `all` (default), `web` or `worker` |

Each HR can also plug in **their own Groq or Gemini API key** in the app (**Settings → AI model**). Their scans and calendar syncs then use it, and when it reaches its limit they paste in a new one. Keys are checked with the provider before saving, stored encrypted, and never shown again (only their last four characters).

The database, Redis, Qdrant and Ollama addresses in `.env.example` are for `pnpm dev` on your machine; `docker compose` replaces them with the in-network ones, so one `.env` serves both.

---

## Running the Project

```bash
docker compose up --build -d                    # with LLM_PROVIDER=groq or gemini
docker compose --profile ollama up --build -d   # with LLM_PROVIDER=ollama: also starts Ollama and pulls OLLAMA_MODEL once
```

Then open **http://localhost:3001** and sign in with Google. On first start the app migrates the database, seeds the default email templates and starts its background workers; `docker compose ps` shows `hr-app` as healthy when it's ready.

| What | Address |
|---|---|
| The app | http://localhost:3001 |
| Health (database, queue, vectors, AI model) | http://localhost:3001/api/health |
| Background tasks (scans, emails, calendar, job matching) | http://localhost:3001/tasks |
| Qdrant dashboard (job vectors) | http://localhost:6335/dashboard |
| Postgres / Redis / Ollama | `localhost:5434` / `localhost:6380` / `localhost:11435` (this machine only) |

**Switching the AI model:** change `LLM_PROVIDER` in `.env`, then `docker compose up -d --force-recreate dashboard` (add `--profile ollama` for Ollama). Or skip the restart and plug in your own key under **Settings**.

**Workers in their own container (optional):** `APP_ROLE_DASHBOARD=web docker compose --profile split up -d`. Link WhatsApp before splitting: the QR code comes from the process running WhatsApp.

### Useful Docker Commands

```bash
docker compose ps                       # status and health
docker compose logs -f dashboard        # app log
docker compose restart dashboard        # restart the app
docker compose down                     # stop (data is kept in volumes)
docker compose down -v                  # stop and delete all data (WhatsApp must be linked again)
docker compose exec postgres psql -U postgres -d hr_onboarding
```

---

## Development (Without Docker)

Keep the supporting services in Docker and run the app with hot reload:

```bash
docker compose up -d postgres redis qdrant     # add: --profile ollama up -d ollama ollama-pull
pnpm install
pnpm dev                                        # http://localhost:3001
```

```bash
pnpm lint            # ESLint, including the server layer rules
pnpm typecheck
pnpm test            # unit tests + API test suite (needs postgres and redis from compose)
pnpm test:build      # the same against the production build
```

---

## Project Structure

```
HR_Onboarding_Nuxt/
├── app/
│   ├── pages/
│   │   ├── index.vue           # Jobs: post and manage job descriptions + their forms
│   │   ├── scanners.vue        # Gmail, WhatsApp (QR + groups) and Google Forms scans
│   │   ├── candidates.vue      # All / selected candidates, statuses, offer letters
│   │   ├── interviews.vue      # Interview events, slot assignment, calendar sync, invites
│   │   ├── templates.vue       # Email template editor + preview
│   │   ├── tasks.vue           # Background tasks in plain words
│   │   ├── settings.vue        # Each HR's own AI keys and model
│   │   └── login.vue           # Google sign-in
│   ├── components/             # ActionButton, SourceBadge, UserMenu, …
│   ├── composables/            # useApi, useTask, useSessionUser, useDashboard
│   └── layouts/                # Default layout (sidebar + navbar)
│
├── server/
│   ├── api/                    # One-line route files → feature controllers
│   ├── routes/auth/google/     # Google OAuth callback
│   ├── middleware/             # Request id, auth (deny by default), rate limits
│   ├── features/               # controller → service → repository, per feature
│   │   ├── job-roles/          #   jobs + their Qdrant vectors
│   │   ├── google-forms/       #   one application form per job
│   │   ├── ingestion/          #   scans, sources/ (gmail, whatsapp, forms) + pipeline/
│   │   ├── candidates/  interviews/  mail/  templates/
│   │   ├── ai-settings/        #   each HR's Groq / Gemini keys
│   │   ├── auth/  health/  tasks/  whatsapp/
│   ├── agents/                 # LLM agents: email-classifier, calendar-event
│   ├── integrations/           # google, whatsapp, llm (groq · gemini · ollama), embeddings,
│   │                           # qdrant, imagekit, http/safe-download
│   ├── core/                   # db, errors, http (validation, rate limits), auth, tasks (BullMQ)
│   ├── database/               # migrations/, migrator, seed (default templates)
│   ├── config/                 # the only place that reads process.env (validated with Zod)
│   └── plugins/                # start-up: config, database, task workers, WhatsApp
│
├── test/
│   ├── unit/                   # Vitest unit tests
│   └── api/                    # API tests against a real server
│
├── docker-compose.yml          # App, Postgres, Redis, Qdrant, optional Ollama
├── Dockerfile                  # Multi-stage Nuxt build
├── .env.example                # Environment variable template
├── nuxt.config.ts              # Nuxt configuration
├── package.json
├── LICENSE                     # MIT License (Nuxt UI Templates)
└── README.nuxt-template.md     # Original Nuxt dashboard template README
```

---

## Acknowledgements

This project is built on the **[Nuxt UI Dashboard Template](https://github.com/nuxt-ui-templates/dashboard)** by [Nuxt UI Templates](https://github.com/nuxt-ui-templates), licensed under the [MIT License](./LICENSE). The template provides the foundational UI shell including the sidebar layout, navigation, command palette, dark mode support, and Nuxt UI components. Application-specific features (AI pipeline, background tasks, Google integrations, database schema, recruitment workflows) are custom-built on top of this template.

---

*Made with ❤️ using [Nuxt UI](https://ui.nuxt.com)*
