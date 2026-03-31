import type { FastifyInstance } from 'fastify'

export async function registerHealthRoutes(fastify: FastifyInstance) {
  fastify.get('/api/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })
  })

  fastify.get('/api/health/ready', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      store: 'ready',
      timestamp: new Date().toISOString(),
    })
  })
}
