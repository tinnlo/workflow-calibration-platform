import type { FastifyInstance } from 'fastify'
import { CreateWorkflowSchema, UpdateWorkflowSchema, TransitionWorkflowSchema } from '@/types/workflow.js'
import { requireAuth } from '@/middleware/requireAuth.js'
import * as store from '@/services/store.js'

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
    const updated = store.transition(
      id,
      request.user.organizationId,
      ifMatch,
      body.status,
      body.reason
    )
    return reply
      .status(200)
      .header('ETag', store.getETag(updated))
      .send(updated)
  })
}
