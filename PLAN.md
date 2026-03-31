# workflow-calibration-platform — Build Plan

*Owner: Xingting Luo (github.com/tinnlo)*
*Prepared: 2026-03-30*

---

## What this is

A public portfolio demo of a **multi-tenant human-in-the-loop workflow platform** for institutional data review and calibration. It demonstrates the B2B review/feedback loop architecture pattern that production agentic AI systems require when structured human oversight is needed.

This is a clean-room rebuild derived from the architecture and engineering patterns of a private enterprise system. All company references, real institution names, real data, and internal infrastructure identifiers have been removed.

---

## Public story

An organization submits data records for calibration. A reviewer walks through a multi-step workflow, reviews computed values, adds corrections, and generates a structured PDF report. The corrected data is captured for downstream reprocessing.

This maps directly to a real production pattern: agentic pipelines produce outputs → institutions review and correct → corrections feed back into the pipeline.

---

## Tech stack

### Frontend (React SPA)
- React 18 + TypeScript
- Vite (SWC plugin)
- shadcn/ui (Radix UI primitives) + Tailwind CSS
- TanStack React Query
- react-hook-form + Zod for form validation
- Recharts for data visualization
- jsPDF for PDF report generation
- react-router-dom

### Backend (Fastify API)
- Fastify + TypeScript
- Azure Cosmos DB (NoSQL) — organization-based partition key
- Azure Blob Storage — document uploads
- JWT authentication (HS256) with access/refresh tokens
- Zod — config/input validation with fail-fast startup
- RFC 7807 Problem Details error responses

### Testing & CI
- Vitest — unit tests (frontend + backend)
- Playwright — E2E smoke tests
- GitHub Actions — CI/CD pipeline

### Deployment
- Frontend: Netlify
- Backend: Azure App Service

---

## Architecture

```
workflow-calibration-platform/
├── src/                          # React 18 + Vite frontend
│   ├── pages/
│   │   ├── Index.tsx             # Dashboard / entry
│   │   ├── Workflow.tsx          # Workflow list
│   │   ├── DataPointReview.tsx   # Step-by-step review form
│   │   └── ReportPreview.tsx     # PDF preview and export
│   ├── components/
│   │   ├── Dashboard/
│   │   ├── Workflow/             # Form wizard steps
│   │   ├── Organization/
│   │   └── ui/                   # shadcn/ui components
│   ├── services/                 # API clients (auth, workflows, documents)
│   ├── hooks/                    # useAutoSave, useWorkflows, etc.
│   └── types/
├── server/                       # Fastify backend
│   └── src/
│       ├── routes/               # auth, workflows, documents, health, metrics
│       ├── services/             # cosmos, jwt, workflow state machine, blob
│       ├── plugins/
│       ├── config.ts             # Zod-validated env config
│       └── index.ts
├── tests/
│   ├── unit/                     # Vitest
│   └── e2e/                      # Playwright
├── .github/workflows/
│   └── ci.yml
├── .env.example
├── netlify.toml
├── package.json
└── README.md
```

---

## Core patterns to implement

### 1. Multi-tenant data isolation
- All Cosmos DB operations partitioned by `organizationId`
- Enforced at query level — no cross-organization data leakage

### 2. Workflow state machine
```
draft → pending → in_progress → completed
                              → failed → pending (retry)
```
- State transitions validated server-side
- Each transition logged with timestamp

### 3. Fail-fast config validation
```typescript
// server/src/config.ts
const schema = z.object({
  COSMOS_ENDPOINT: z.string().url(),
  COSMOS_KEY: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  // ...
})
const config = schema.parse(process.env)
export default config
```
- Blocks startup if any required env var is missing or invalid
- No runtime surprises

### 4. JWT auth
- Access token (15m) + refresh token (7d)
- RS256 or HS256 (demo uses HS256 for simplicity)
- Multi-organization support (org claim in token)

### 5. RFC 7807 error responses
```json
{
  "type": "https://example.com/errors/validation-failed",
  "title": "Validation Failed",
  "status": 422,
  "detail": "organizationId is required"
}
```

### 6. Form wizard with auto-save
- 4-step multi-page form
- useAutoSave hook — debounced PATCH on change
- Draft state persisted to Cosmos DB

### 7. PDF report generation
- jsPDF — client-side, no server dependency
- Structured output: organization header, data summary, corrections log, reviewer sign-off

---

## Sanitization rules

Remove or replace:
- `Forward Analytics`, `FA`, `fa_` — use `calibration_platform`, `org_`, `entity_`
- Institution names (Blackstone, Bridgewater, CalPERS, UK Finance) — use `DemoOrg A`, `DemoOrg B`
- Climate-specific field names → generic `data_point`, `metric_value`, `source`
- Internal Azure resource names, subscription IDs, resource group names
- Real AV scanning service credentials (stub or remove)
- Internal deployment URLs

Public-safe vocabulary:
- `organization` (not institution)
- `data_record` / `data_point` (not climate metric)
- `reviewer` (not analyst)
- `calibration_value` (not carbon correction)

---

## Runnable demo path

1. Start backend locally (`npm run dev` in `server/`)
2. Start frontend (`npm run dev`)
3. Register an organization
4. Submit a draft data record
5. Transition through workflow states
6. Review and correct data points
7. Generate PDF report
8. Run Vitest unit tests
9. Run Playwright smoke test (login → submit workflow → complete)

---

## Public data strategy

- No real institutional data
- Use synthetic demo organizations: `DemoOrg A`, `DemoOrg B`
- Demo data fixtures: 3 organizations, 5 workflows, 10 data points each
- Fixtures checked in as JSON seed scripts in `scripts/seed.ts`
- `.env.example` with fake/local values only

---

## Acceptance criteria

- [ ] No company identifiers remain in source, docs, config, or examples
- [ ] No real secrets or internal service URLs
- [ ] README explains architecture in public-safe terms
- [ ] Local demo path runs end-to-end (can use Cosmos DB emulator or mock)
- [ ] Vitest unit tests pass
- [ ] At least one Playwright smoke test passes
- [ ] `netlify.toml` includes security headers (CSP, X-Frame-Options, etc.)
- [ ] Backend config validates all env vars at startup with Zod
- [ ] State machine transitions are validated server-side
- [ ] Multi-tenant isolation verified by test (org A cannot read org B data)

---

## Engineering ownership note

> Designed and built end-to-end by Xingting Luo as a solo architect-engineer. AI tools were used to accelerate coding, debugging, and documentation, but the architecture, implementation choices, and delivery ownership were mine.
