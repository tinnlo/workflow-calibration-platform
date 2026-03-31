import type { FastifyInstance } from 'fastify'
import { registerHealthRoutes } from '@/routes/health.js'
import { registerAuthRoutes } from '@/routes/auth.js'
import { registerWorkflowRoutes } from '@/routes/workflows.js'
import { registerTestHelperRoutes } from '@/routes/testHelpers.js'

export async function registerRoutes(fastify: FastifyInstance) {
  await registerHealthRoutes(fastify)
  await registerAuthRoutes(fastify)
  await registerWorkflowRoutes(fastify)
  await registerTestHelperRoutes(fastify)
}
