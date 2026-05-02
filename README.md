# Workflow Calibration Platform

A multi-tenant, RBAC-governed human-in-the-loop workflow platform for institutional data review and calibration. This is a portfolio demo showcasing auditable approval transitions, reversible state transitions, and ETag-protected concurrent edits.

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

## Key Properties

- **RBAC-governed human-in-the-loop workflows** — role-based transition control is explicit and enforced server-side, not hidden in the UI
- **Auditable approval transitions** — every state transition emits an immutable audit entry (actor, role, old state, new state, timestamp, correlation ID); readable via `GET /api/workflows/:id/audit`
- **Reversible state transitions** — the `submitted → failed → draft` path is a first-class recovery story, gated to the `admin` role
- **ETag-protected concurrent edits** — every write requires `If-Match`; stale ETags return HTTP 412; the UI distinguishes this from permission denial (403)

## Role Capabilities

| Transition | reviewer | admin |
|---|---|---|
| `draft → in_progress` | Yes | Yes |
| `in_progress → submitted` | Yes | Yes |
| `submitted → completed` | — | Yes |
| `submitted → failed` | — | Yes |
| `failed → draft` (recovery) | — | Yes |

Permissions are enforced on the server. A reviewer attempting an admin-only transition receives HTTP 403.

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
# Install frontend dependencies
npm install

# Install server dependencies
npm install --prefix server

# Start both frontend (port 5173) and API (port 3001)
npm run dev
```

The Vite dev server proxies `/api/*` to `http://localhost:3001`.

### Run Tests

```bash
# Server unit + route tests (RBAC, audit, ETag, tenant isolation)
npm run test:server

# Frontend unit tests
npm test
```

### Build

```bash
# Frontend production build → dist/
VITE_API_BASE_URL=https://your-api-origin.example npm run build

# Server production build → server/dist/
npm run build:server
```

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | No | Authenticate and receive JWT |
| `GET` | `/api/auth/me` | Yes | Current user profile |
| `GET` | `/api/workflows` | Yes | List org workflows |
| `POST` | `/api/workflows` | Yes | Create workflow (returns 201 + ETag) |
| `GET` | `/api/workflows/:id` | Yes | Get workflow (returns ETag) |
| `PATCH` | `/api/workflows/:id` | Yes | Update workflow (requires `If-Match`) |
| `POST` | `/api/workflows/:id/transition` | Yes | RBAC-gated state transition; 403 on permission denial |
| `GET` | `/api/workflows/:id/audit` | Yes | Ordered audit trail for a workflow (tenant-isolated) |

### Audit Entry Schema

Each entry in `GET /api/workflows/:id/audit` contains:

```json
{
  "correlationId": "uuid",
  "workflowId": "uuid",
  "timestamp": "ISO 8601",
  "actorId": "user-id",
  "actorRole": "admin | reviewer",
  "oldState": "draft | in_progress | submitted | completed | failed | null",
  "newState": "draft | in_progress | submitted | completed | failed",
  "reason": "optional string"
}
```

`oldState` is `null` only on the creation entry (the workflow did not exist before).

## Architecture Notes

- **RBAC enforcement**: The permission matrix lives in `server/src/services/permissions.ts`. It is checked before the state machine on every transition call.
- **Audit log**: Append-only `Map<workflowId, AuditEntry[]>` in `server/src/services/auditStore.ts`. Entries are never mutated after insertion. Both `db` and `auditStore` are atomically rolled back on transition failure.
- **Tenant isolation on audit**: `GET /api/workflows/:id/audit` calls `store.getById` first; a wrong-org or missing workflow returns 404 before any audit data is read.
- **ETag concurrency**: Every `PATCH` and `transition` checks `If-Match`. A stale ETag returns 412. The frontend distinguishes 412 (conflict) from 403 (permission denied) with separate toast messages.
- **Auto-save guard**: The form wizard tracks an `isFlushing` flag. Navigation and submit buttons are disabled while a debounced save is in flight, preventing re-entrant writes or mid-save navigation.
- **Token storage**: Access tokens are held in a module-level variable (never `localStorage`), cleared on page refresh — intentional for this demo.
- **In-memory DB**: All data lives in a `Map<string, Workflow>` on the server, seeded with 5 workflows per organisation on startup.
- **No refresh tokens**: The 15-minute JWT expiry is intentionally short; the demo login page makes re-authentication trivial.

## Project Structure

```
├── src/                        # React frontend
│   ├── components/             # UI components
│   │   ├── Dashboard/          # StatusChart (Recharts)
│   │   ├── Layout/             # AppLayout (nav + Outlet)
│   │   └── Workflow/           # WorkflowWizard + Steps 1–4
│   ├── contexts/               # AuthContext + ProtectedRoute
│   ├── hooks/                  # useWorkflows (incl. useAuditLog), useAutoSave
│   ├── pages/                  # Login, Dashboard, WorkflowDetail, NotFound
│   ├── services/               # api, authService, pdfExport
│   └── types/                  # TypeScript interfaces (incl. AuditEntry)
└── server/                     # Fastify API
    ├── src/
    │   ├── data/               # Seed users + demo workflows
    │   ├── middleware/         # requireAuth
    │   ├── routes/             # auth, workflows (incl. audit route)
    │   ├── services/           # jwtService, stateMachine, store, permissions, auditStore
    │   └── types/              # Zod schemas + TypeScript types (incl. AuditEntry)
    └── tests/                  # Vitest unit + route tests (RBAC, audit, ETag, tenant isolation)
```

---

> Designed and built end-to-end by Xingting Luo. AI tools were used to accelerate coding, debugging, and documentation; architecture, implementation choices, and delivery ownership are mine.
