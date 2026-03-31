import Fastify, { type FastifyInstance, type FastifyError } from 'fastify'
import { ZodError } from 'zod'
import { AppError } from '../../src/errors.js'
import { registerAuthRoutes } from '../../src/routes/auth.js'
import { registerWorkflowRoutes } from '../../src/routes/workflows.js'

/**
 * Build a lightweight test Fastify instance with the same error handler and
 * routes as production, but without CORS / Helmet / rate-limiting plugins
 * (which are irrelevant for unit tests and would slow them down).
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  // Mirror production error handler
  app.setErrorHandler(async (error: FastifyError, request, reply) => {
    const maybeApp = error as unknown
    if (maybeApp instanceof AppError) {
      return reply.status(maybeApp.statusCode).send({
        type: `https://calibration-platform.example/problems/${maybeApp.problemType}`,
        title: maybeApp.title,
        status: maybeApp.statusCode,
        detail: maybeApp.message,
        instance: request.url,
      })
    }

    if (maybeApp instanceof ZodError) {
      return reply.status(400).send({
        type: 'https://calibration-platform.example/problems/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: maybeApp.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        instance: request.url,
      })
    }

    if (error.validation) {
      return reply.status(400).send({
        type: 'https://calibration-platform.example/problems/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: error.message,
        instance: request.url,
      })
    }

    const statusCode = error.statusCode ?? 500
    return reply.status(statusCode).send({
      type: 'https://calibration-platform.example/problems/server-error',
      title: 'Server Error',
      status: statusCode,
      detail: error.message,
      instance: request.url,
    })
  })

  await registerAuthRoutes(app)
  await registerWorkflowRoutes(app)
  await app.ready()
  return app
}
