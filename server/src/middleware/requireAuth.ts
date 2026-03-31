import type { FastifyRequest, FastifyReply } from 'fastify'
import { verifyAccessToken, type JwtPayload } from '@/services/jwtService.js'
import { UnauthorizedError } from '@/errors.js'

// Extend FastifyRequest to include the `user` property
declare module 'fastify' {
  interface FastifyRequest {
    user: JwtPayload
  }
}

/**
 * Fastify preHandler that validates the Bearer token and attaches
 * the decoded payload to `request.user`.
 *
 * Usage in routes:
 *   { preHandler: requireAuth }
 *
 * Role-based authorization (admin vs. reviewer) is intentionally deferred.
 * The `role` claim is present in every JWT and can be enforced here or in
 * individual route handlers once business rules are defined.
 */
export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or malformed Authorization header')
  }

  const token = authHeader.slice(7)
  request.user = verifyAccessToken(token)
}
