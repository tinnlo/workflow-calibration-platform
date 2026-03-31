import Fastify, { type FastifyError } from 'fastify'
import { ZodError } from 'zod'
import { config } from '@/config.js'
import { loggerConfig } from '@/logger.js'
import { registerPlugins } from '@/plugins/index.js'
import { registerRoutes } from '@/routes/index.js'
import { AppError } from '@/errors.js'

const fastify = Fastify({
  logger: loggerConfig,
  // trustProxy is intentionally false: we do not sit behind a known proxy in
  // this demo. Enabling it unconditionally would let any client spoof
  // X-Forwarded-For and bypass IP-based rate limiting.
  trustProxy: false,
  requestIdLogLabel: 'correlationId',
})

// RFC 7807 global error handler
fastify.setErrorHandler(async (error: FastifyError, request, reply) => {
  // AppError hierarchy (NotFoundError, UnauthorizedError, etc.)
  const appError = error as unknown
  if (appError instanceof AppError) {
    return reply.status(appError.statusCode).send({
      type: `https://calibration-platform.example/problems/${appError.problemType}`,
      title: appError.title,
      status: appError.statusCode,
      detail: appError.message,
      instance: request.url,
      correlationId: request.id,
    })
  }

  // ZodError from manual schema.parse() calls in route handlers
  if (appError instanceof ZodError) {
    return reply.status(400).send({
      type: 'https://calibration-platform.example/problems/validation-error',
      title: 'Validation Error',
      status: 400,
      detail: appError.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
      instance: request.url,
      correlationId: request.id,
    })
  }

  fastify.log.error({ err: error }, 'Unhandled error')

  if (error.validation) {
    return reply.status(400).send({
      type: 'https://calibration-platform.example/problems/validation-error',
      title: 'Validation Error',
      status: 400,
      detail: error.message,
      instance: request.url,
      correlationId: request.id,
    })
  }

  const statusCode = error.statusCode ?? 500
  const detail =
    statusCode >= 500 && config.NODE_ENV === 'production' ? 'Internal server error' : error.message

  return reply.status(statusCode).send({
    type: 'https://calibration-platform.example/problems/server-error',
    title: statusCode >= 500 ? 'Internal Server Error' : 'Request Error',
    status: statusCode,
    detail,
    instance: request.url,
    correlationId: request.id,
  })
})

// Graceful shutdown
const gracefulShutdown = async () => {
  try {
    await fastify.close()
    process.exit(0)
  } catch (err: unknown) {
    fastify.log.error({ err }, 'Error during graceful shutdown')
    process.exit(1)
  }
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)

async function start() {
  try {
    await registerPlugins(fastify)
    await registerRoutes(fastify)

    await fastify.listen({ port: config.PORT, host: '0.0.0.0' })
    fastify.log.info(`Workflow Calibration API listening on port ${config.PORT}`)
    fastify.log.info(
      { environment: config.NODE_ENV, corsOrigins: config.CORS_ORIGINS },
      'Server configuration'
    )
  } catch (err: unknown) {
    fastify.log.error({ err }, 'Failed to start server')
    process.exit(1)
  }
}

start()
