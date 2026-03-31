import { randomUUID } from 'crypto'
import { type Workflow, type WorkflowStatus, type UpdateWorkflowInput } from '@/types/workflow.js'
import { validateTransition } from '@/services/stateMachine.js'
import { NotFoundError, PreconditionFailedError, PreconditionRequiredError, UnprocessableEntityError } from '@/errors.js'
import { SEED_USERS } from '@/data/seed.js'

// ─── In-memory store ──────────────────────────────────────────────────────────

const db = new Map<string, Workflow>()

function now(): string {
  return new Date().toISOString()
}

function makeETag(version: number): string {
  return `W/"${version}"`
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getETag(workflow: Workflow): string {
  return makeETag(workflow.version)
}

export function list(organizationId: string): Workflow[] {
  return [...db.values()].filter((w) => w.organizationId === organizationId)
}

export function getById(id: string, organizationId: string): Workflow {
  const workflow = db.get(id)
  // Return 404 for both missing and wrong-org workflows: a 403 would confirm
  // the resource exists, enabling cross-tenant enumeration.
  if (!workflow || workflow.organizationId !== organizationId) {
    throw new NotFoundError(`Workflow '${id}' not found`)
  }
  return workflow
}

export function create(
  organizationId: string,
  createdBy: string,
  title: string,
  description: string
): Workflow {
  const id = randomUUID()
  const ts = now()
  const workflow: Workflow = {
    id,
    organizationId,
    title,
    description,
    status: 'draft',
    currentStep: 1,
    step1Data: null,
    step2Data: null,
    step3Data: null,
    step4Data: null,
    version: 1,
    statusHistory: [{ from: null, to: 'draft', timestamp: ts }],
    createdAt: ts,
    updatedAt: ts,
    createdBy,
  }
  db.set(id, workflow)
  return workflow
}

export function update(
  id: string,
  organizationId: string,
  ifMatchETag: string | undefined,
  input: UpdateWorkflowInput
): Workflow {
  const workflow = getById(id, organizationId)

  if (ifMatchETag === undefined) {
    throw new PreconditionRequiredError()
  }
  if (ifMatchETag !== makeETag(workflow.version)) {
    throw new PreconditionFailedError()
  }

  const terminalStates: WorkflowStatus[] = ['submitted', 'completed', 'failed']
  if (terminalStates.includes(workflow.status)) {
    throw new UnprocessableEntityError(
      `Workflow in '${workflow.status}' state cannot be modified`
    )
  }

  const updated: Workflow = {
    ...workflow,
    ...(input.title !== undefined && { title: input.title }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.currentStep !== undefined && { currentStep: input.currentStep }),
    ...(input.step1Data !== undefined && { step1Data: input.step1Data }),
    ...(input.step2Data !== undefined && { step2Data: input.step2Data }),
    ...(input.step3Data !== undefined && { step3Data: input.step3Data }),
    ...(input.step4Data !== undefined && { step4Data: input.step4Data }),
    version: workflow.version + 1,
    updatedAt: now(),
  }
  db.set(id, updated)
  return updated
}

export function transition(
  id: string,
  organizationId: string,
  ifMatchETag: string | undefined,
  to: WorkflowStatus,
  reason?: string
): Workflow {
  const workflow = getById(id, organizationId)

  if (ifMatchETag === undefined) {
    throw new PreconditionRequiredError()
  }
  if (ifMatchETag !== makeETag(workflow.version)) {
    throw new PreconditionFailedError()
  }

  // throws 422 if invalid
  validateTransition(workflow.status, to)

  const ts = now()
  const updated: Workflow = {
    ...workflow,
    status: to,
    version: workflow.version + 1,
    updatedAt: ts,
    statusHistory: [
      ...workflow.statusHistory,
      { from: workflow.status, to, timestamp: ts, ...(reason ? { reason } : {}) },
    ],
  }
  db.set(id, updated)
  return updated
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

export function seedWorkflows(): void {
  const orgs: Array<{ orgId: string; adminId: string; name: string }> = [
    { orgId: 'org-apex', adminId: 'user-aa-admin', name: 'Apex Analytics' },
    { orgId: 'org-beacon', adminId: 'user-bd-admin', name: 'Beacon Data' },
    { orgId: 'org-clarity', adminId: 'user-cc-admin', name: 'Clarity Corp' },
  ]

  const periods = ['Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025', 'Q1 2026']
  const statuses: WorkflowStatus[] = ['draft', 'in_progress', 'submitted', 'completed', 'failed']

  for (const org of orgs) {
    for (let i = 0; i < 5; i++) {
      const targetStatus = statuses[i]
      const workflow = create(
        org.orgId,
        org.adminId,
        `${org.name} — ${periods[i]} Calibration`,
        `Automated seed workflow for ${periods[i]}`
      )

      // Advance through states as needed
      const path: WorkflowStatus[] = buildPath(targetStatus)
      for (let j = 1; j < path.length; j++) {
        const w = db.get(workflow.id)!
        const ts = now()
        const next = path[j]
        db.set(workflow.id, {
          ...w,
          status: next,
          version: w.version + 1,
          updatedAt: ts,
          statusHistory: [...w.statusHistory, { from: path[j - 1], to: next, timestamp: ts }],
        })
      }
    }
  }
}

function buildPath(target: WorkflowStatus): WorkflowStatus[] {
  const chains: Record<WorkflowStatus, WorkflowStatus[]> = {
    draft: ['draft'],
    in_progress: ['draft', 'in_progress'],
    submitted: ['draft', 'in_progress', 'submitted'],
    completed: ['draft', 'in_progress', 'submitted', 'completed'],
    failed: ['draft', 'in_progress', 'submitted', 'failed'],
  }
  return chains[target]
}

export function reset(): void {
  db.clear()
}

// Run seed on module load so it is available when the server starts
seedWorkflows()

// Re-export seed users for auth route
export { SEED_USERS }
