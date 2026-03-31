import type { FastifyInstance } from 'fastify'
import { reset, seedWorkflows } from '@/services/store.js'
import { config } from '@/config.js'

/**
 * Test-only routes registered exclusively when NODE_ENV === 'test'.
 * Not available in development, staging, or production.
 *
 * POST /api/test/reset  — clears all data, re-seeds, returns 204
 */
export async function registerTestHelperRoutes(fastify: FastifyInstance): Promise<void> {
  if (config.NODE_ENV !== 'test') return

  fastify.post('/api/test/reset', async (_request, reply) => {
    reset()
    seedWorkflows()
    return reply.status(204).send()
  })
}
