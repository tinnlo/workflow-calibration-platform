import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { LoginSchema } from '@/types/workflow.js'
import { signAccessToken } from '@/services/jwtService.js'
import { requireAuth } from '@/middleware/requireAuth.js'
import { SEED_USERS } from '@/data/seed.js'
import { UnauthorizedError } from '@/errors.js'
import { config } from '@/config.js'

/**
 * A valid bcrypt hash used for constant-time comparison when the submitted
 * email address does not match any known user. This prevents timing-based
 * user enumeration: the bcrypt work is always performed regardless of whether
 * the email exists in the system.
 */
const DUMMY_HASH = '$2b$10$ZFu6xoOaL3vvr9WV6otEAOJntHnmGmOKfYZmdGkNa4bOT9WfS0RK6'

export async function registerAuthRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/auth/login
   * Returns a short-lived JWT access token on valid credentials.
   * Rate-limited to 10 requests per 5 minutes in production.
   */
  fastify.post(
    '/api/auth/login',
    {
      config: {
        rateLimit: {
          max: config.NODE_ENV === 'production' ? 10 : 10000,
          timeWindow: '5 minutes',
        },
      },
    },
    async (request, reply) => {
      const body = LoginSchema.parse(request.body)

      const user = SEED_USERS.find((u) => u.email === body.email)
      // Always run bcrypt.compare to prevent email-enumeration via timing
      const hashToCompare = user?.passwordHash ?? DUMMY_HASH
      const valid = await bcrypt.compare(body.password, hashToCompare)

      if (!user || !valid) throw new UnauthorizedError('Invalid email or password')

      const token = signAccessToken({
        sub: user.id,
        organizationId: user.organizationId,
        email: user.email,
        name: user.name,
        role: user.role,
      })

      return reply.status(200).send({ accessToken: token })
    }
  )

  /**
   * GET /api/auth/me
   * Returns the current user's profile from the JWT.
   */
  fastify.get('/api/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    const { sub, organizationId, email, name, role } = request.user
    return reply.status(200).send({ id: sub, organizationId, email, name, role })
  })
}
