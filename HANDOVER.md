# HANDOVER

Repo: `workflow-calibration-platform`

## Objective

Build on the shipped full-stack TypeScript workflow demo and make this repo the portfolio's clearest example of:

- RBAC-governed human-in-the-loop workflows
- auditable approval transitions
- reversible state transitions
- ETag-protected concurrent edits

This repo should become the primary public demo for approval safety, role-based transition control, and recovery paths.

## Current shipped baseline

The following are already shipped and must be preserved:

- JWT-based tenant isolation with `organizationId` claims
- in-memory full-stack demo architecture
- state machine with retry path
- ETag optimistic concurrency with HTTP 412 on stale writes
- debounced auto-save
- seeded admin and reviewer demo accounts

This handover extends the current multi-tenant workflow pattern rather than replacing it.

## Required shipped outcome

A reviewer should be able to see that this repo governs:

- **who** may perform a transition
- **what** transitions happened
- **how** failed workflows can be recovered safely

Minimum shipped outcome:

1. Make the role-action matrix explicit in server policy.
2. Enforce transition permissions separately for `admin` and `reviewer`.
3. Emit an immutable audit trail for workflow transitions.
4. Add `GET /api/workflows/:id/audit`.
5. Surface permission denial and stale-ETag conflicts clearly in the UI.

## In scope

- explicit role/action matrix
- transition-level permission enforcement
- read-only audit endpoint
- immutable transition audit records
- UI handling for denied transitions and ETag conflicts
- tests and docs

## Out of scope

- replacing JWT auth
- adding a database
- redesigning the workflow wizard
- enterprise IAM or SSO
- general-purpose audit logging beyond workflow transitions

## Required public framing

Use wording like:

- RBAC-governed human-in-the-loop workflows
- auditable approval transitions
- reversible state transitions
- ETag-protected concurrent edits

Do not describe it as:

- a full enterprise workflow engine
- a database-backed compliance platform
- a generic authorization framework

## Required interfaces, artifacts, and config surfaces

Add or expose:

- explicit role-action rules for at least `admin` and `reviewer`
- read-only endpoint: `GET /api/workflows/:id/audit`

Each audit entry must include at least:

- timestamp
- actor id
- actor role
- old state
- new state
- correlation id

Preserve:

- existing workflow routes
- current JWT claim model
- in-memory demo architecture

Use the current retry path as the public rollback/recovery story:

- `submitted -> failed -> draft`

## Implementation guidance

### 1. Make the permission model explicit

Today the repo already has auth and a state machine.

The new work must make role-based transition control visible and testable:

- reviewer can work and submit
- admin controls final completion, failure, and recovery actions

### 2. Keep audit history immutable and ordered

Audit entries should be append-only for the lifetime of the in-memory process.

The endpoint should return a stable, ordered history for a workflow.

### 3. Keep tenant boundaries on audit reads

The same org-isolation rules that protect workflow reads must also protect audit reads.

### 4. Surface failures clearly in the UI

The frontend should clearly distinguish:

- permission denial
- stale ETag conflict

These are different failure modes and should not blur together.

### 5. Keep the rollback story simple and real

Do not invent a second rollback model.

Use the current failed-and-recover path as the public demonstration of reversible workflow execution.

## Likely files to modify

- `README.md`
- `server/src/routes/...`
- `server/src/services/...`
- `server/src/types/...`
- `server/tests/...`
- `src/...`
- `tests/...`

## Verification commands

Run the repo's real paths after implementation. At minimum:

```bash
npm run test:server
npm test
npm run build
npm run build:server
```

Add implementation-specific verification for:

- reviewer blocked from admin-only transitions
- admin allowed to perform recovery transitions
- audit endpoint returning ordered history
- tenant isolation on audit reads
- stale-ETag HTTP 412 path remaining intact

## Guardrails

- Do not add a database for this wave.
- Do not break the current JWT tenant-isolation model.
- Do not hide permission decisions only in the UI; enforce them on the server.
- Do not weaken the existing ETag concurrency behavior.
- Do not claim compliance-grade persistence that the in-memory demo does not have.

## Acceptance standard

Accept the implementation only if all of the following are true:

1. Role-based transition permissions are explicit and enforced server-side.
2. Reviewer and admin capabilities differ meaningfully and are tested.
3. `GET /api/workflows/:id/audit` exists and respects tenant isolation.
4. Audit entries are ordered and include actor, role, old state, new state, timestamp, and correlation id.
5. The `submitted -> failed -> draft` recovery path remains functional and visible.
6. HTTP 412 stale-ETag behavior still works.
7. UI surfaces permission denial and conflict states clearly.
8. README framing matches the shipped behavior.
