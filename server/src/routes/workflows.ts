import type { FastifyInstance } from 'fastify'
import { CreateWorkflowSchema, UpdateWorkflowSchema, TransitionWorkflowSchema } from '@/types/workflow.js'
import type { AuditEntry, PublicAuditEntry } from '@/types/workflow.js'
import { requireAuth } from '@/middleware/requireAuth.js'
import * as store from '@/services/store.js'
import { assertTransitionPermission } from '@/services/permissions.js'
import { validateTransition } from '@/services/stateMachine.js'
import { getAuditLog } from '@/services/auditStore.js'
import { PreconditionFailedError, PreconditionRequiredError } from '@/errors.js'

export async function registerWorkflowRoutes(fastify: FastifyInstance): Promise<void> {
  const auth = { preHandler: requireAuth }

  /**
   * GET /api/workflows
   * List all workflows belonging to the caller's organisation.
   */
  fastify.get('/api/workflows', auth, async (request, reply) => {
    const workflows = store.list(request.user.organizationId)
    return reply.status(200).send(workflows)
  })

  /**
   * POST /api/workflows
   * Create a new workflow in draft state.
   */
  fastify.post('/api/workflows', auth, async (request, reply) => {
    const body = CreateWorkflowSchema.parse(request.body)
    const workflow = store.create(
      request.user.organizationId,
      request.user.sub,
      request.user.role,
      body.title,
      body.description
    )
    return reply
      .status(201)
      .header('ETag', store.getETag(workflow))
      .send(workflow)
  })

  /**
   * GET /api/workflows/:id
   * Fetch a single workflow. 404 if not found or wrong org (prevents enumeration).
   */
  fastify.get('/api/workflows/:id', auth, async (request, reply) => {
    const { id } = request.params as { id: string }
    const workflow = store.getById(id, request.user.organizationId)
    return reply
      .status(200)
      .header('ETag', store.getETag(workflow))
      .send(workflow)
  })

  /**
   * PATCH /api/workflows/:id
   * Partial update. Requires If-Match header matching the current ETag.
   * Returns 412 on stale ETag.
   */
  fastify.patch('/api/workflows/:id', auth, async (request, reply) => {
    const { id } = request.params as { id: string }
    const ifMatch = request.headers['if-match'] as string | undefined
    const body = UpdateWorkflowSchema.parse(request.body)
    const updated = store.update(id, request.user.organizationId, ifMatch, body)
    return reply
      .status(200)
      .header('ETag', store.getETag(updated))
      .send(updated)
  })

  /**
   * POST /api/workflows/:id/transition
   * Advance or revert the workflow status via the state machine.
   * Returns 422 on invalid transition.
   */
  fastify.post('/api/workflows/:id/transition', auth, async (request, reply) => {
    const { id } = request.params as { id: string }
    const ifMatch = request.headers['if-match'] as string | undefined
    const body = TransitionWorkflowSchema.parse(request.body)

    // Load workflow for concurrency and RBAC checks.
    const workflow = store.getById(id, request.user.organizationId)

    // 1. Validate ETag first — a stale/missing precondition must surface as
    //    412/428 regardless of role or transition validity, so the client knows
    //    to refresh before re-evaluating anything else.
    if (ifMatch === undefined) {
      throw new PreconditionRequiredError()
    }
    if (ifMatch !== store.getETag(workflow)) {
      throw new PreconditionFailedError()
    }

    // 2. Validate state-machine correctness (422) before RBAC (403), so that
    //    a structurally impossible transition (e.g. draft→completed for any
    //    role) is classified as a business-logic error, not an auth failure.
    validateTransition(workflow.status, body.status)

    // 3. Only then enforce role-based permission — the transition is valid but
    //    the caller may not have the required role to perform it.
    assertTransitionPermission(request.user.role, workflow.status, body.status)

    const updated = store.transition(
      id,
      request.user.organizationId,
      ifMatch,
      body.status,
      request.user.sub,
      request.user.role,
      body.reason
    )
    return reply
      .status(200)
      .header('ETag', store.getETag(updated))
      .send(updated)
  })

  /**
   * GET /api/workflows/:id/audit
   * Return the ordered, immutable audit trail for a workflow.
   * Tenant-isolated: only the owning org may read the audit log.
   * Admins receive full entries; reviewers receive a redacted view
   * (no actorId, no correlationId).
   *
   * Cache headers: private, no-store prevents any intermediary or shared cache
   * from storing role-sensitive payloads. Vary: Authorization ensures even
   * private caches key on the caller's credentials.
   */
  fastify.get('/api/workflows/:id/audit', auth, async (request, reply) => {
    const { id } = request.params as { id: string }
    // getById enforces org isolation — throws 404 for wrong-org or missing
    store.getById(id, request.user.organizationId)
    const entries = getAuditLog(id)

    reply
      .header('Cache-Control', 'private, no-store')
      .header('Vary', 'Authorization')

    if (request.user.role === 'admin') {
      return reply.status(200).send(entries)
    }

    // Reviewers get a redacted view. Use an explicit allowlist so any future
    // sensitive fields added to AuditEntry are NOT exposed by default.
    const redacted: PublicAuditEntry[] = entries.map((entry: AuditEntry): PublicAuditEntry => ({
      workflowId: entry.workflowId,
      timestamp: entry.timestamp,
      actorRole: entry.actorRole,
      oldState: entry.oldState,
      newState: entry.newState,
      ...(entry.reason !== undefined ? { reason: entry.reason } : {}),
    }))
    return reply.status(200).send(redacted)
  })
}
