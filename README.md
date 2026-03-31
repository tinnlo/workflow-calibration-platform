# Workflow Calibration Platform

A multi-tenant human-in-the-loop workflow platform for institutional data review and calibration. This is a portfolio demo showcasing a full-stack TypeScript application.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite (SWC) + TypeScript |
| UI | shadcn/ui + Tailwind CSS + Recharts |
| Forms | react-hook-form + Zod |
| State | TanStack Query v5 |
| Backend | Fastify 5 + TypeScript |
| Auth | JWT HS256 (15-min access tokens, in-memory only) |
| Storage | In-memory Map (no database required for demo) |
| Error format | RFC 7807 Problem Details |

## Features

- **Multi-tenant isolation** — JWT claims carry `organizationId`; the API enforces tenant boundaries on every request
- **4-step wizard** — Organisation Profile → Data Collection → Review & Calibration → Summary & Submit
- **State machine** — `draft → in_progress → submitted → completed`, `submitted → failed → draft` (retry)
- **Optimistic concurrency** — ETag + `If-Match` headers; stale writes return HTTP 412
- **Auto-save** — debounced PATCH on form changes, flushed on `visibilitychange` / `beforeunload`
- **PDF export** — jsPDF + jspdf-autotable
- **Status chart** — Recharts pie chart on the dashboard

## Demo Credentials

All accounts share the password: **`Demo1234!`**

| Organisation | Email | Role |
|---|---|---|
| Apex Analytics | `admin@apex.example` | admin |
| Apex Analytics | `reviewer@apex.example` | reviewer |
| Beacon Data | `admin@beacon.example` | admin |
| Beacon Data | `reviewer@beacon.example` | reviewer |
| Clarity Corp | `admin@clarity.example` | admin |
| Clarity Corp | `reviewer@clarity.example` | reviewer |

## Getting Started

### Prerequisites

- Node.js >= 20
- npm >= 10

### Install & Run

```bash
# Install all dependencies (root + server workspace)
npm install

# Start both frontend (port 5173) and API (port 3001)
npm run dev
```

The Vite dev server proxies `/api/*` to `http://localhost:3001`.

### Run Tests

```bash
# Server unit tests
npm run test:server

# Frontend unit tests (currently passWithNoTests)
npm test
```

### Build

```bash
# Frontend production build → dist/
npm run build

# Server production build → server/dist/
npm run build:server
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Authenticate and receive JWT |
| `GET` | `/api/auth/me` | Current user profile |
| `GET` | `/api/workflows` | List org workflows |
| `POST` | `/api/workflows` | Create workflow (returns 201 + ETag) |
| `GET` | `/api/workflows/:id` | Get workflow (returns ETag) |
| `PATCH` | `/api/workflows/:id` | Update workflow (requires `If-Match`) |
| `POST` | `/api/workflows/:id/transition` | Advance state machine |

## Architecture Notes

- **Token storage**: Access tokens are held in a module-level variable (never `localStorage`), so they are cleared on page refresh — intentional for this demo.
- **In-memory DB**: All data lives in a `Map<string, Workflow>` on the server. The store is seeded with 5 workflows per organisation on startup.
- **No refresh tokens**: The 15-minute JWT expiry is intentionally short; the demo login page makes re-authentication trivial.
- **ETag concurrency**: Every `PATCH` and `transition` checks `If-Match`. A stale ETag returns 412. The frontend refetches and retries automatically on conflict detection.

## Project Structure

```
├── src/                        # React frontend
│   ├── components/             # UI components
│   │   ├── Dashboard/          # StatusChart (Recharts)
│   │   ├── Layout/             # AppLayout (nav + Outlet)
│   │   └── Workflow/           # WorkflowWizard + Steps 1–4
│   ├── contexts/               # AuthContext + ProtectedRoute
│   ├── hooks/                  # useWorkflows, useAutoSave
│   ├── pages/                  # Login, Dashboard, WorkflowDetail, NotFound
│   ├── services/               # api, authService, pdfExport
│   └── types/                  # TypeScript interfaces
└── server/                     # Fastify API
    ├── src/
    │   ├── data/               # Seed users
    │   ├── middleware/         # requireAuth
    │   ├── routes/             # auth, workflows
    │   ├── services/           # jwtService, stateMachine, store
    │   └── types/              # Zod schemas + TypeScript types
    └── tests/                  # Vitest unit + route tests
```
