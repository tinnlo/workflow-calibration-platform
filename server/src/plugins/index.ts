import type { FastifyInstance } from 'fastify'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { randomBytes } from 'node:crypto'
import { config } from '@/config.js'

export async function registerPlugins(fastify: FastifyInstance) {
  // Security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // Handled by netlify.toml / CDN
  })

  // CORS — credentials:true is unnecessary for Bearer-token auth;
  // removed to avoid granting cookie-based cross-origin access
  await fastify.register(cors, {
    origin: config.CORS_ORIGINS,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id', 'If-Match'],
    exposedHeaders: ['ETag', 'X-Correlation-Id'],
  })

  // Rate limiting — no skipOnError so errors don't bypass the counter
  await fastify.register(rateLimit, {
    max: config.NODE_ENV === 'production' ? 100 : 10000,
    timeWindow: '1 minute',
  })

  // Correlation ID on every request/response
  fastify.addHook('onRequest', async (request, reply) => {
    const raw = request.headers['x-correlation-id'] as string | undefined
    // Sanitize: strip non-printable ASCII and truncate to 128 chars
    const sanitized = raw ? raw.replace(/[^\x20-\x7E]/g, '').slice(0, 128) : undefined
    const correlationId = sanitized || request.id
    // Generate W3C traceparent if not present
    if (!request.headers['traceparent']) {
      const traceId = randomBytes(16).toString('hex')
      const spanId = randomBytes(8).toString('hex')
      reply.header('traceparent', `00-${traceId}-${spanId}-01`)
    }
    reply.header('x-correlation-id', correlationId)
    request.id = correlationId
  })
}
