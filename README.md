# HR Recruitment Dashboard

> An AI-powered, end-to-end recruitment automation platform built with **Nuxt 4**, **PostgreSQL**, **an LLM (Groq or a local Ollama)**, **Qdrant vector search**, and **Google Workspace APIs**. It automates every stage of hiring — from posting job descriptions to scanning resumes, shortlisting candidates, scheduling interviews, and dispatching offer/rejection emails.

[![Nuxt UI](https://img.shields.io/badge/Made%20with-Nuxt%20UI-00DC82?logo=nuxt&labelColor=020420)](https://ui.nuxt.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](./docker-compose.yml)

---

## ⚠️ License Notice

This project is built on top of the **[Nuxt UI Dashboard Template](https://github.com/nuxt-ui-templates/dashboard)**, originally created by [Nuxt UI Templates](https://github.com/nuxt-ui-templates) and licensed under the **MIT License**.

> The original template's copyright notice and license are preserved as required by the MIT License terms. See [`LICENSE`](./LICENSE) and [`README.nuxt-template.md`](./README.nuxt-template.md) for the original template documentation.

All application-specific code (server APIs, AI pipeline, database schema, UI pages) built on top of this template is developed independently for recruitment automation purposes.

---

## Table of Contents

- [Overview](#overview)
- [Use Case Walkthrough](#use-case-walkthrough)
- [Screenshots](#screenshots)
- [Tech Stack](#tech-stack)
- [Low-Level System Design & Flow](#low-level-system-design--flow)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Running the Project](#running-the-project)
- [Development (Without Docker)](#development-without-docker)
- [Project Structure](#project-structure)

---

## Overview

The HR Recruitment Dashboard is a self-hosted, AI-augmented hiring platform that replaces manual HR workflows. It connects to your Gmail inbox, scans attachments, uses an LLM (Groq or a local Ollama) and vector embeddings (via Qdrant) to parse and score resumes, and automates the full candidate lifecycle — shortlisting, interview scheduling, and email communications.

---

## Use Case Walkthrough

### Step 1 — HR Creates a Job Description (JD)

The HR manager logs in and navigates to the **Jobs** page.

- Fills in the role title, salary band, required skills, qualification, experience, and location.
- Optionally configures **shortlisting criteria weights** (e.g., skills: 0.5, experience: 0.3, projects: 0.2) for fine-grained AI scoring.
- Sets a **minimum score threshold** and **shortlisting mode** (`manual` or `auto`).
- On save, the JD is stored in PostgreSQL and its vector embedding is upserted into **Qdrant** for semantic resume matching.

---

### Step 2 — Scan WhatsApp & Gmail for Applications

The HR navigates to the **Scanners** page and triggers scans:

- **Gmail Scan**: Fetches emails with PDF attachments from the connected Google account. Each PDF is parsed as a resume, analyzed by the local LLM (Ollama) to confirm it is a job application, then scored and matched to an active JD using vector similarity.
- **WhatsApp Scan**: Connects via `whatsapp-web.js` (Puppeteer-based) to scan incoming WhatsApp messages for resume attachments, processed through the same AI pipeline.
- Candidate data (name, email, phone, role matched, score, source) is saved to the database and deduplicated.
- Resumes are uploaded to **ImageKit** for persistent CDN storage.

---

### Step 3 — Review Candidates in the Table

The HR navigates to the **Candidates** page:

- A full data table lists all candidates with their name, applied role, AI match score, source (Gmail / WhatsApp), experience level, and current status.
- Candidates can be filtered by role, score range, or source.
- HR can manually review candidate profiles and update status (`shortlisted`, `rejected`, `selected`).
- In **auto mode**, candidates above the configured minimum score are automatically shortlisted.

---

### Step 4 — Schedule an Interview Event

The HR navigates to the **Interviews** page and creates a new interview event:

- Specifies the role, date, time slot (start/end), mode (`online` / `offline`), venue or meeting link, and number of candidate slots.
- The event is saved to PostgreSQL and synced to **Google Calendar** via the Calendar API.

---

### Step 5 — Assign Candidates to Interview Slots

Once an event is created:

- HR can **manually** select candidates from the shortlisted pool and assign them to the event.
- Alternatively, using **Auto-Assign**, the system automatically picks the top-scoring eligible candidates for a role and assigns them to the event's available slots.
- Assigned candidates are tracked in the `interview_candidates` join table.

---

### Step 6 — Select / Reject Candidates

After interviews:

- HR updates each candidate's status to `selected` or `rejected` directly from the Candidates or Interviews page.
- Selected candidates can have their offer details filled in (offered role, salary, location, joining date).

---

### Step 7 — Trigger Emails (Offer / Rejection / Interview Invites)

The HR navigates to the **Email Templates** page to manage template content using a rich text editor with Handlebars variable support (e.g., `{{name}}`, `{{role_applied}}`, `{{interview_date}}`).

Three primary email actions:

| Action | Trigger | Template Variables |
|---|---|---|
| **Interview Invite** | From interview event screen | `{{name}}`, `{{role_applied}}`, `{{interview_date}}`, `{{interview_start_time}}`, `{{interview_end_time}}`, `{{interview_mode}}`, `{{venue_or_link}}` |
| **Offer Letter** | From selected candidates | `{{name}}`, `{{offered_role}}`, `{{offered_salary}}`, `{{offered_location}}`, `{{joining_date}}` |
| **Rejection Mail** | From rejected candidates | `{{name}}`, `{{role_applied}}` |

- Emails are sent via the **Gmail API** (using the HR's connected Google account) — no third-party SMTP needed.
- Sent status is tracked per candidate (`invite_sent`, `offer_sent`) to prevent duplicate sending.

---

## Screenshots

### Jobs Page — Job Description Management

![Jobs Page](./screenshots/jobs.png)

---

### Scanners Page — WhatsApp Connection & Group Selection

![Scanners Page](./screenshots/scanners.png)

---

### Candidates Table — Shortlisted Candidates

![Candidates Table](./screenshots/candidates.png)

---

### Email Templates Editor

![Email Templates](./screenshots/templates.png)

---

### Interviews Page — Event Scheduler & Slot Assignment

![Interviews Page](./screenshots/interviews.png)

---

## Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| **Nuxt 4** | Full-stack Vue framework (SSR + server routes) |
| **Nuxt UI v4** | Component library (tables, modals, forms, toasts) |
| **Vue 3** | Reactive UI |
| **TailwindCSS v4** | Utility-first styling |
| **Tiptap v2** | Rich text editor for email templates |
| **Unovis** | Charts and data visualizations on the dashboard |
| **VueUse** | Composable utilities |
| **date-fns** | Date formatting and manipulation |

### Backend (Nuxt Server Routes)
| Technology | Purpose |
|---|---|
| **Nuxt Server API** | File-based API routes (`server/api/`) |
| **PostgreSQL 15** | Primary relational database |
| **node-postgres (`pg`)** | PostgreSQL client |
| **Redis** | Session/cache layer |
| **Google APIs (`googleapis`)** | Gmail + Google Calendar integration |
| **Handlebars** | Email template variable compilation |
| **jsonwebtoken** | JWT-based session auth |
| **pdf-parse** | Resume PDF text extraction |
| **whatsapp-web.js** | WhatsApp scanning via Puppeteer |
| **ImageKit** | Resume CDN storage |

### AI & Vector Search
| Technology | Purpose |
|---|---|
| **Groq or Ollama** (`LLM_PROVIDER`) | LLM for email classification and calendar event parsing |
| **Qdrant** | Vector database for semantic JD ↔ resume matching |
| **BAAI/bge-small-en-v1.5** | Embedding model (via `@xenova/transformers`) |

### Infrastructure
| Technology | Purpose |
|---|---|
| **Docker + Docker Compose** | Container orchestration |
| **Puppeteer / Chromium** | Headless browser for WhatsApp Web |

---

## Low-Level System Design & Flow

### Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         Browser (Nuxt UI)                        │
│  Jobs │ Candidates │ Interviews │ Scanners │ Templates           │
└──────────────────────┬───────────────────────────────────────────┘
                       │ HTTP (fetch / useFetch)
┌──────────────────────▼───────────────────────────────────────────┐
│                    Nuxt 4 Server (H3)                            │
│  server/api/                                                     │
│  ├── auth/          (Google OAuth, JWT session)                  │
│  ├── jobs/          (CRUD + Qdrant vector upsert)                │
│  ├── candidates/    (CRUD, status patch, scan triggers)          │
│  ├── mail/          (Gmail scan, WhatsApp scan)                  │
│  ├── interviews/    (events, slot assignment, calendar sync)     │
│  └── templates/     (email template CRUD)                        │
│                                                                  │
│  server/utils/                                                   │
│  ├── db.ts          (PostgreSQL pool, schema init)               │
│  ├── ai.ts          (Ollama: resume match, email classify)       │
│  ├── vectorMatch.ts (Qdrant: embed + cosine similarity)          │
│  ├── resumeParser.ts(PDF parse + section extraction)             │
│  ├── gmail.ts       (Gmail API: fetch, attachment download)      │
│  ├── mailer.ts      (Gmail API: send offer/invite/rejection)     │
│  ├── calendar.ts    (Google Calendar: event sync)                │
│  ├── whatsapp.ts    (whatsapp-web.js: QR auth + scan)           │
│  └── imagekit.ts    (CDN: resume upload)                         │
└───────────────┬──────────────────────────────────────────────────┘
                │
    ┌───────────┼──────────────────────────────────┐
    │           │                                  │
    ▼           ▼                                  ▼
PostgreSQL    Qdrant                           Groq or Ollama
(candidates,  (job_descriptions                (LLM_PROVIDER:
 job_roles,    collection —                    resume parse,
 events,       multi-vector:                   email analysis)
 templates)    full, skills,
               experience)
```

---

### Resume Ingestion Pipeline (Gmail / WhatsApp)

```
Trigger Scan (HR clicks "Scan Gmail" or "Scan WhatsApp")
        │
        ▼
Fetch emails/messages with PDF attachments
(Gmail API: has:attachment after:<last_scan_timestamp>)
        │
        ▼
For each email → is it a job application?
  → Ollama (analyzeEmail): returns { isApplication, position }
        │
        ├── No → Skip
        │
        └── Yes
              │
              ▼
        Download PDF attachment
              │
              ▼
        pdf-parse → extract raw resume text
              │
              ▼
        resumeParser → extract sections
        (skills, experience, projects)
              │
              ▼
        Parallel:
        ┌─────────────────────────────────────────┐
        │                                         │
        ▼                                         ▼
  Ollama (matchResume)               vectorMatch.matchResumeToJobs
  → name, email, phone,              → embed resume with
    experience, CTC, location           BAAI/bge-small-en-v1.5
                                     → search Qdrant top-3 JDs
                                     → weighted cosine similarity
                                     → { target_role, score }
        │                                         │
        └──────────────┬──────────────────────────┘
                       ▼
        Merge: candidate profile + role + score
                       │
                       ▼
        Upload resume PDF → ImageKit CDN
                       │
                       ▼
        INSERT INTO candidates (PostgreSQL)
        (deduplicated by email)
                       │
                       ▼
        If auto-shortlist mode + score ≥ min_score
        → status = 'shortlisted' automatically
```

---

### Interview Scheduling Flow

```
HR creates Interview Event
  → POST /api/interviews/events
  → INSERT INTO interview_events (PostgreSQL)
  → POST /api/interviews/sync-calendar
  → Google Calendar API: create event
        │
        ▼
HR assigns candidates (manual or auto)
  Manual: PATCH /api/interviews/events/{id}/candidates/manual
  Auto:   POST  /api/interviews/events/{id}/candidates/auto
          → SELECT top N candidates by score WHERE role = event.role
          → INSERT INTO interview_candidates
        │
        ▼
HR sends invites
  → POST /api/mail/send-invites
  → For each candidate WHERE invite_sent = false:
      - Compile Handlebars template with event + candidate data
      - Gmail API: send HTML email
      - UPDATE interview_candidates SET invite_sent = true
```

---

### Email Dispatch Flow

```
HR triggers email action:
  ┌───────────────┬──────────────────┬───────────────┐
  │  Interview    │   Offer Letter   │  Rejection    │
  │  Invite       │                  │  Mail         │
  └──────┬────────┴─────────┬────────┴──────┬────────┘
         │                  │               │
         ▼                  ▼               ▼
  Fetch template from PostgreSQL (email_templates)
         │
         ▼
  Compile Handlebars template with candidate/event variables
         │
         ▼
  Build RFC 2822 raw email (base64url encoded)
         │
         ▼
  Gmail API: users.messages.send (OAuth2 token)
         │
         ▼
  UPDATE candidates/interview_candidates
  SET offer_sent/invite_sent = true
```

---

### Database Schema (PostgreSQL)

```sql
job_roles           — JD definitions + scoring config + criteria weights
candidates          — Candidate profiles, scores, status, offer details
scan_timestamps     — Tracks last Gmail / WhatsApp scan time
interview_events    — Interview slots (role, date, time, mode, venue)
interview_candidates— Many-to-many: event ↔ candidate + invite_sent flag
email_templates     — Handlebars HTML templates (offer, invite, rejection)
```

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) with Compose v2
- A **Google Cloud project** with the Gmail, Calendar, Forms and Drive APIs enabled, and an OAuth 2.0 client whose authorised redirect URI is `http://localhost:3001/auth/google/callback`
- An [ImageKit](https://imagekit.io/) account (resumes are stored there as private files)
- For the AI model, either a [Groq](https://console.groq.com/keys) API key, or a local Ollama (started by compose, see below)

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

Each HR can also plug in **their own Groq or Gemini API key** in the app (**Settings → AI model**). Their scans and calendar syncs then use it, and when it reaches its limit they paste in a new one. Keys are checked with the provider before saving, stored encrypted, and never shown again (only their last four characters).

The database, Redis, Qdrant and Ollama addresses in `.env.example` are for `pnpm dev` on your machine; `docker compose` replaces them with the in-network ones, so one `.env` serves both.

---

## Running the Project

```bash
docker compose up --build -d                 # with LLM_PROVIDER=groq
docker compose --profile ollama up --build -d   # with LLM_PROVIDER=ollama: also starts Ollama and pulls OLLAMA_MODEL once
```

Then open **http://localhost:3001** and sign in with Google. On first start the app migrates the database, seeds the default email templates and starts its background workers; `docker compose ps` shows `hr-app` as healthy when it's ready.

| What | Address |
|---|---|
| The app | http://localhost:3001 |
| Health (database, queue, vectors, AI model) | http://localhost:3001/api/health |
| Background tasks (BullMQ queues) | http://localhost:3001/tasks |
| Qdrant dashboard (job vectors) | http://localhost:6335/dashboard |
| Postgres / Redis / Ollama | `localhost:5434` / `localhost:6380` / `localhost:11435` (this machine only) |

**Switching the AI model:** change `LLM_PROVIDER` in `.env`, then `docker compose up -d --force-recreate dashboard` (add `--profile ollama` for Ollama).

**Workers in their own container (optional):** `APP_ROLE_DASHBOARD=web docker compose --profile split up -d`. Link WhatsApp before splitting: the QR code comes from the process running WhatsApp.

### Useful Docker Commands

```bash
docker compose ps                       # status and health
docker compose logs -f dashboard        # app log
docker compose restart dashboard        # restart the app
docker compose down                     # stop (data is kept in volumes)
docker compose down -v                  # stop and delete all data
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
pnpm test            # unit tests + API smoke suite (needs postgres and redis from compose)
pnpm test:build      # the same against the production build
```

---

## Project Structure

```
dashboard/
├── app/
│   ├── pages/
│   │   ├── index.vue           # Dashboard / overview
│   │   ├── candidates.vue      # Candidates table + status management
│   │   ├── interviews.vue      # Interview scheduler + calendar
│   │   ├── scanners.vue        # Gmail & WhatsApp scan triggers
│   │   ├── templates.vue       # Email template editor
│   │   ├── customers.vue       # (Jobs / JD management)
│   │   └── login.vue           # Google OAuth login
│   ├── components/             # Reusable Vue components
│   ├── composables/            # useDashboard, useAuth, etc.
│   └── layouts/                # Default layout (sidebar + navbar)
│
├── server/
│   ├── api/
│   │   ├── auth/               # Google OAuth + JWT
│   │   ├── jobs/               # JD CRUD
│   │   ├── candidates/         # Candidate CRUD + status
│   │   ├── mail/               # Gmail scan + WhatsApp scan
│   │   ├── interviews/         # Events, slot assignment, calendar sync
│   │   └── templates/          # Email template CRUD
│   ├── utils/
│   │   ├── db.ts               # PostgreSQL pool + schema init
│   │   ├── ai.ts               # Ollama: resume match + email classify
│   │   ├── vectorMatch.ts      # Qdrant embedding + cosine similarity
│   │   ├── resumeParser.ts     # PDF text extraction + section parsing
│   │   ├── gmail.ts            # Gmail API: fetch emails + attachments
│   │   ├── mailer.ts           # Gmail API: send emails via OAuth
│   │   ├── calendar.ts         # Google Calendar API
│   │   ├── whatsapp.ts         # WhatsApp Web scanning (Puppeteer)
│   │   ├── calendarAgent.ts    # Calendar event management helpers
│   │   └── imagekit.ts         # ImageKit CDN upload
│   └── plugins/                # Server-side plugins (DB init on startup)
│
├── docker-compose.yml          # All services
├── Dockerfile                  # Multi-stage Nuxt build
├── .env.example                # Environment variable template
├── nuxt.config.ts              # Nuxt configuration
├── package.json
├── LICENSE                     # MIT License (Nuxt UI Templates)
└── README.nuxt-template.md     # Original Nuxt dashboard template README
```

---

## Acknowledgements

This project is built on the **[Nuxt UI Dashboard Template](https://github.com/nuxt-ui-templates/dashboard)** by [Nuxt UI Templates](https://github.com/nuxt-ui-templates), licensed under the [MIT License](./LICENSE). The template provides the foundational UI shell including the sidebar layout, navigation, command palette, dark mode support, and Nuxt UI components. Application-specific features (AI pipeline, Google integrations, database schema, recruitment workflows) are custom-built on top of this template.

---

*Made with ❤️ using [Nuxt UI](https://ui.nuxt.com)*
