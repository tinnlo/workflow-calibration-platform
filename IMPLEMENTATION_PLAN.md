# Implementation Plan v3 (Final)

*Status: Approved and locked — all stages complete*
*Last updated: 2026-03-31*

---

## Overview

Clean-room rebuild of a multi-tenant human-in-the-loop workflow platform for
institutional data review and calibration. Derived from the architecture of a
private enterprise system; all proprietary references removed.

**In-memory mock DB** — no Cosmos emulator or external database required.
The backend stores all data in plain JS Maps, reset on restart.

---

## Architectural Decisions

### Auth
- JWT HS256, access token only (no refresh tokens)
- 15-minute expiry
- Token stored in React ref (memory only — does not survive page refresh)
- `organizationId` derived exclusively from JWT claims, never from request body
- Demo: 3 organizations × 2 users each, credentials documented in README

### State Machine
```
draft -> in_progress -> submitted -> completed
                                  -> failed -> draft (retry)
```
- `completed` is terminal (no further transitions)
- Invalid transitions return 422 Unprocessable Entity
- No DELETE route — `failed` state handles business-level failure
- Each transition recorded with timestamp in `statusHistory` array

### Data Storage
- In-memory Maps keyed by `workflowId`
- Tenant isolation enforced: all reads/writes filter by `organizationId` from JWT
- ETag-based optimistic concurrency: manual `W/"<version>"` header
  - Stale `If-Match` returns 412 Precondition Failed
  - No `@fastify/etag` plugin

### Error Handling
- RFC 7807 Problem Details (`application/problem+json`)
- Type URIs: `https://calibration-platform.example/problems/<error-type>`
- Client-safe `detail` only — no stack traces or internal state leakage

### Validation
- Zod schemas with explicit `max()` field lengths from day one
- Fail-fast config validation at startup (blocks server start on invalid env)
- Production guards: reject default JWT secret, require explicit CORS origins

### Sanitization
- CI grep check (GitHub Actions) for banned terms:
  `Forward Analytics`, `FA` (case-sensitive in identifiers), `fa_` prefix,
  institution names, climate-finance compound terms
- Generic words like "climate" or "carbon" alone are NOT banned
- `institutionId` → `organizationId` everywhere
- `climateFinance.com/problems/` → `calibration-platform.example/problems/`

---

## Stage 1: Project Scaffolding & Configuration

**Goal**: Monorepo skeleton that compiles, lints, and runs empty dev servers.

**Status**: Complete
   - `package.json` with npm workspaces (`["server"]`)
   - Root scripts: `dev`, `build`, `test`, `lint`, `typecheck`
   - `.nvmrc` (Node 20 LTS)
   - `.gitignore` (node_modules, dist, .env, coverage)

2. **Frontend (root)**
   - Vite + React 18 + TypeScript (SWC plugin)
   - Install: `tailwindcss`, `postcss`, `autoprefixer`, `@tailwindcss/vite`
   - Install: `shadcn/ui` CLI, init with HSL CSS variables
   - `vite.config.ts`: path alias `@/` → `src/`, dev proxy `/api` → `localhost:3001`
   - `tsconfig.json`: strict, path alias
   - `tailwind.config.ts`: shadcn preset with HSL theme tokens
   - Generate initial shadcn components: `button`, `card`, `input`, `label`, `form`,
     `toast`, `dialog`, `badge`, `tabs`, `progress`, `separator`
   - Empty `src/App.tsx` with "Hello Calibration Platform"

3. **Backend (`server/`)**
   - `server/package.json` with own deps
   - Install: `fastify`, `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`,
     `jsonwebtoken`, `zod`, `pino`, `pino-pretty` (dev)
   - `server/tsconfig.json`: strict, path alias `@/` → `src/`, outDir `dist`
   - `server/src/index.ts`: minimal Fastify server listening on port 3001
   - `server/src/config.ts`: Zod-validated env config with production guards
   - `server/src/logger.ts`: Pino with pino-pretty dev transport, redacted auth headers

4. **Shared tooling**
   - ESLint config (flat config, typescript-eslint)
   - Prettier config
   - `vitest.config.ts` (frontend) and `server/vitest.config.ts` (backend)
   - `.env.example` with safe defaults

5. **CI foundation**
   - `.github/workflows/ci.yml`: install → typecheck → lint → test → build
   - Sanitization grep step (banned term check via `.github/banned-terms.txt`)

### Success Criteria
- `npm run dev` starts both frontend (Vite on 5173) and backend (Fastify on 3001)
- `npm run typecheck` passes with zero errors
- `npm run lint` passes
- `npm test` runs (with zero tests, exits cleanly)
- `npm run build` produces `dist/` for frontend and `server/dist/` for backend
- CI workflow definition is valid

### Files Created
```
package.json
.nvmrc
.gitignore
.env.example
.prettierrc
eslint.config.js
vite.config.ts
tsconfig.json
tsconfig.app.json
tsconfig.node.json
tailwind.config.ts
postcss.config.js
vitest.config.ts
index.html
src/App.tsx
src/main.tsx
src/index.css
src/vite-env.d.ts
src/lib/utils.ts
src/components/ui/          (shadcn generated)
components.json
server/package.json
server/tsconfig.json
server/vitest.config.ts
server/src/index.ts
server/src/config.ts
server/src/logger.ts
.github/workflows/ci.yml
.github/banned-terms.txt
```

---

## Stage 2: Backend Core

**Goal**: Auth, workflow CRUD, state machine, and tenant isolation — all with tests.

**Status**: Complete
   - `signAccessToken(payload)` → token string
   - `verifyAccessToken(token)` → decoded claims or throws
   - Claims: `{ sub, email, organizationId, role }`
   - HS256, 15-min expiry, secret from config

2. **Auth middleware** (`server/src/middleware/requireAuth.ts`)
   - Extract `Bearer` token from `Authorization` header
   - Verify and attach `request.user` with decoded claims
   - 401 if missing/invalid, RFC 7807 format

3. **Auth routes** (`server/src/routes/auth.ts`)
   - `POST /api/auth/login` — validate email/password against seed users, return token
   - `GET /api/auth/me` — return current user from token (requires auth)
   - Seed users: 3 orgs × 2 users, hardcoded in `server/src/data/seed.ts`

4. **In-memory store** (`server/src/services/store.ts`)
   - `Map<string, Workflow>` keyed by `workflowId`
   - CRUD operations that always filter by `organizationId`
   - Version counter for ETag concurrency
   - Seed data loaded at startup

5. **Workflow schemas** (`server/src/types/workflow.ts`)
   - Zod schemas with `max()` lengths on all string fields
   - Types: `Workflow`, `WorkflowStep`, `CreateWorkflowInput`, `UpdateWorkflowInput`
   - Status enum: `draft | in_progress | submitted | completed | failed`
   - `statusHistory: Array<{ from, to, timestamp, reason? }>`

6. **State machine** (`server/src/services/stateMachine.ts`)
   - Pure function: `validateTransition(from, to) → boolean`
   - Allowed: draft→in_progress, in_progress→submitted, submitted→completed,
     submitted→failed, failed→draft
   - 422 on invalid transition with descriptive Problem Details

7. **Workflow routes** (`server/src/routes/workflows.ts`)
   - `GET /api/workflows` — list for org (paginated)
   - `POST /api/workflows` — create (status: draft)
   - `GET /api/workflows/:id` — get one (includes ETag response header)
   - `PATCH /api/workflows/:id` — update step data (requires If-Match, returns new ETag)
   - `POST /api/workflows/:id/transition` — state transition
   - All routes behind `requireAuth`

8. **Health endpoints**
   - `GET /api/health` — liveness check
   - `GET /api/health/ready` — readiness (checks store is initialized)

9. **Fastify plugins** (`server/src/plugins/index.ts`)
   - CORS (configurable origins from env)
   - Helmet (security headers)
   - Rate limit (100 req/min default)
   - Request ID / correlation ID
   - RFC 7807 error handler (global `setErrorHandler`)

10. **Tests**
    - `server/tests/jwt.test.ts` — sign/verify, expiry, invalid secret
    - `server/tests/stateMachine.test.ts` — all valid/invalid transitions
    - `server/tests/workflow.routes.test.ts` — CRUD, auth, tenant isolation,
      ETag concurrency (412), invalid transitions (422)
    - Use Fastify `inject()` for route tests (no HTTP server needed)

### Success Criteria
- All tests pass
- `POST /api/auth/login` returns a valid JWT for seed users
- Org A cannot read/write Org B workflows
- State machine rejects invalid transitions with 422
- Stale `If-Match` returns 412
- All error responses are RFC 7807 compliant

---

## Stage 3: Frontend Core

**Goal**: Auth flow, workflow list, 4-step form wizard with auto-save, and dashboard chart.

**Status**: Complete

### Tasks

1. **API client** (`src/services/api.ts`)
   - `apiFetch<T>(path, options)` with Problem+JSON error parsing
   - Attaches `Authorization: Bearer` from auth ref
   - Returns typed response or throws `ApiError` with Problem Details

2. **Auth service** (`src/services/authService.ts`)
   - Token stored in module-level ref (not localStorage, not React state)
   - `login(email, password)` → stores token, returns user
   - `logout()` → clears token
   - `getToken()` → current token or null
   - `isAuthenticated()` → boolean

3. **Auth context & routing** (`src/contexts/AuthContext.tsx`)
   - React context providing `user`, `login`, `logout`, `isAuthenticated`
   - `ProtectedRoute` component redirecting to `/login` if unauthenticated
   - Lazy-loaded routes with `React.lazy` + `Suspense`

4. **Pages**
   - `src/pages/Login.tsx` — email/password form, demo credential hints
   - `src/pages/Dashboard.tsx` — workflow list with status badges, create button, status chart
   - `src/pages/WorkflowDetail.tsx` — 4-step form wizard container
   - `src/pages/NotFound.tsx` — 404 page

5. **Form wizard** (`src/components/Workflow/`)
   - `WorkflowWizard.tsx` — step navigation, progress indicator
   - `Step1OrganizationProfile.tsx` — org name, contact, description
   - `Step2DataCollection.tsx` — data points table, add/edit/remove
   - `Step3ReviewCalibration.tsx` — review values, add corrections
   - `Step4Summary.tsx` — read-only summary, submit button, PDF export
   - Each step uses `react-hook-form` + Zod resolver
   - Steps share form state via parent wizard component

6. **useAutoSave hook** (`src/hooks/useAutoSave.ts`)
   - Debounced PATCH (1s default) on form data change
   - Request coalescing (latest data wins if rapid changes)
   - Status indicator: idle | saving | saved | error
   - Flush on `beforeunload` and `visibilitychange`

7. **useWorkflows hook** (`src/hooks/useWorkflows.ts`)
   - TanStack Query wrappers: `useWorkflowList`, `useWorkflow`, `useCreateWorkflow`,
     `useUpdateWorkflow`, `useTransitionWorkflow`
   - Optimistic updates where appropriate
   - ETag tracking for concurrency

8. **PDF export** (`src/services/pdfExport.ts`)
   - jsPDF generation: org header, workflow summary, data points table,
     corrections log, timestamp
   - Triggered from Step 4

9. **Dashboard chart** (`src/components/Dashboard/StatusChart.tsx`)
   - Recharts bar or donut chart showing workflow count by status
   - Data derived from workflow list query

10. **Layout & UI**
    - `src/components/Layout/AppLayout.tsx` — sidebar nav, header with user/org info, logout
    - shadcn components for all UI elements
    - Responsive (works on desktop, acceptable on tablet)

11. **Types** (`src/types/`)
    - `api.ts` — `ProblemDetails`, `ApiError`, `ApiResponse`
    - `workflow.ts` — mirrors server types
    - `auth.ts` — `User`, `LoginRequest`, `LoginResponse`

### Success Criteria
- Login with demo credentials shows dashboard
- Dashboard shows workflow list and status chart
- Create workflow navigates to 4-step wizard
- Auto-save indicator shows saving/saved on each step
- Can navigate forward/back through steps without losing data
- Step 4 submit triggers state transition to `submitted`
- PDF downloads with correct content
- Unauthenticated access redirects to login

---

## Stage 4: Integration & Error Handling

**Goal**: Wire frontend and backend end-to-end, handle all edge cases.

**Status**: Complete

### Tasks

1. **Concurrency conflict UI**
   - When PATCH returns 412, show toast: "This workflow was modified elsewhere. Please refresh."
   - Refresh button reloads workflow data

2. **State transition UI**
   - Dashboard shows current status with color-coded badges
   - Transition buttons only appear for valid next states
   - Failed workflows show "Retry" button (transitions back to draft)
   - Completed workflows are read-only

3. **Error boundary**
   - `src/components/ErrorBoundary.tsx` — catches React render errors
   - Shows friendly error page with "Go to Dashboard" link

4. **Loading states**
   - Skeleton loaders for dashboard list
   - Spinner for form wizard initial load
   - Disabled buttons during async operations

5. **Toast notifications**
   - Success: workflow created, submitted, completed
   - Error: validation failures, network errors, auth expiry
   - Warning: concurrency conflict

6. **Auth expiry handling**
   - When any API call returns 401, clear token and redirect to login
   - Show toast: "Session expired. Please log in again."

7. **Vite dev proxy verification**
   - Ensure `/api/*` proxies cleanly to Fastify in dev mode
   - Test with concurrent frontend + backend dev servers

8. **netlify.toml**
   - SPA redirect (`/* → /index.html 200`)
   - Security headers: CSP, X-Frame-Options, X-Content-Type-Options,
     Referrer-Policy, Permissions-Policy

9. **Integration tests**
   - `server/tests/integration/auth-workflow.test.ts` — full flow:
     login → create → update steps → transition → verify final state
   - Tenant isolation test: login as Org A, try to read Org B workflow → 404

### Success Criteria
- Full end-to-end flow works: login → create → fill 4 steps → submit → complete
- 412 conflict shows user-friendly message
- Expired token redirects to login
- All error states show appropriate UI feedback
- `netlify.toml` security headers present

---

## Stage 5: Polish & Demo Readiness

**Goal**: README, seed script, CI sanitization, final quality pass.

**Status**: Complete

### Tasks

1. **README.md**
   - Architecture overview with diagram (text/ASCII)
   - Tech stack summary
   - Local development setup instructions
   - Demo credentials table (3 orgs × 2 users)
   - API endpoint reference
   - Engineering ownership note

2. **Seed data script** (`server/src/data/seed.ts`)
   - 3 organizations: "Acme Corp", "Globex Industries", "Initech Solutions"
   - 2 users per org (one admin, one reviewer)
   - 5 workflows per org in various states (draft, in_progress, submitted, completed, failed)
   - Realistic-looking but entirely synthetic data points

3. **CI sanitization step**
   - GitHub Actions step that greps for banned terms
   - Fails the build if any match found
   - Banned list in `.github/banned-terms.txt`

4. **Playwright E2E smoke test** (`tests/e2e/smoke.spec.ts`)
   - Login with demo credentials
   - Create new workflow
   - Fill step 1 and step 2
   - Navigate to step 4 and submit
   - Verify workflow shows as submitted on dashboard

5. **Final quality pass**
   - Run full test suite
   - Run linter and formatter
   - Run typecheck
   - Verify CI pipeline green
   - Manual walkthrough of demo flow
   - Confirm no proprietary terms leaked

### Success Criteria
- README clearly explains the project for a portfolio visitor
- `npm run dev` → demo is fully usable with seed data
- CI pipeline passes (typecheck + lint + test + build + sanitization)
- Playwright smoke test passes
- Zero proprietary term leakage

---

## Dependency Map

```
Stage 1 (scaffolding)
  ├── Stage 2 (backend core)
  └── Stage 3 (frontend core)  ← depends on Stage 2 for API contract
        └── Stage 4 (integration) ← depends on Stage 2 + 3
              └── Stage 5 (polish) ← depends on Stage 4
```

Stages 2 and 3 can partially overlap once Stage 2's route contracts are defined.

---

## Out of Scope (Intentionally Excluded)

- Refresh tokens / token rotation
- Document upload / Azure Blob Storage
- Redis caching
- Real database (Cosmos DB or otherwise) — in-memory only
- DELETE endpoints
- Role-based access control beyond org-level isolation
- Email notifications
- Real deployment to cloud (config files provided but deploy is manual)
