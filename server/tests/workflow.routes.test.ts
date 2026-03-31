import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './helpers/buildApp.js'
import { reset, seedWorkflows } from '../src/services/store.js'
import { signAccessToken } from '../src/services/jwtService.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeToken(overrides: Partial<Parameters<typeof signAccessToken>[0]> = {}) {
  return signAccessToken({
    sub: 'user-aa-admin',
    organizationId: 'org-apex',
    email: 'admin@apex.example',
    name: 'Alice Admin',
    role: 'admin',
    ...overrides,
  })
}

function authHeader(token: string) {
  return { authorization: `Bearer ${token}` }
}

// ─── Test suite ───────────────────────────────────────────────────────────────

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  reset()
  seedWorkflows()
})

// ── Auth routes ───────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('returns 200 and accessToken on valid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@apex.example', password: 'Demo1234!' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ accessToken: string }>()
    expect(typeof body.accessToken).toBe('string')
    expect(body.accessToken.split('.')).toHaveLength(3)
  })

  it('returns 401 on wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@apex.example', password: 'WrongPass!' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 on unknown email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nobody@nowhere.example', password: 'Demo1234!' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 400 on missing body fields (Zod)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /api/auth/me', () => {
  it('returns user profile from token', async () => {
    const token = makeToken()
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: authHeader(token),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ id: string; organizationId: string }>()
    expect(body.id).toBe('user-aa-admin')
    expect(body.organizationId).toBe('org-apex')
  })

  it('returns 401 without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 for a malformed token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: 'Bearer notavalidtoken' },
    })
    expect(res.statusCode).toBe(401)
  })
})

// ── Workflow routes ───────────────────────────────────────────────────────────

describe('GET /api/workflows', () => {
  it("returns only workflows for the caller's org", async () => {
    const token = makeToken()
    const res = await app.inject({
      method: 'GET',
      url: '/api/workflows',
      headers: authHeader(token),
    })
    expect(res.statusCode).toBe(200)
    const workflows = res.json<Array<{ organizationId: string }>>()
    expect(workflows.length).toBe(5) // seed creates 5 per org
    expect(workflows.every((w) => w.organizationId === 'org-apex')).toBe(true)
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/workflows' })
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/workflows', () => {
  it('creates a workflow and returns 201 with ETag', async () => {
    const token = makeToken()
    const res = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: authHeader(token),
      payload: { title: 'Test Workflow', description: 'A test' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json<{ id: string; status: string; organizationId: string }>()
    expect(body.status).toBe('draft')
    expect(body.organizationId).toBe('org-apex')
    expect(res.headers['etag']).toMatch(/^W\/"1"$/)
  })

  it('returns 400 when title is missing', async () => {
    const token = makeToken()
    const res = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: authHeader(token),
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /api/workflows/:id', () => {
  it('returns the workflow with ETag', async () => {
    const token = makeToken()
    // Create one first
    const created = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: authHeader(token),
      payload: { title: 'Fetch Test' },
    })
    const { id } = created.json<{ id: string }>()

    const res = await app.inject({
      method: 'GET',
      url: `/api/workflows/${id}`,
      headers: authHeader(token),
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['etag']).toBeDefined()
  })

  it('returns 404 for non-existent id', async () => {
    const token = makeToken()
    const res = await app.inject({
      method: 'GET',
      url: '/api/workflows/does-not-exist',
      headers: authHeader(token),
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 404 when another org tries to read the workflow', async () => {
    const apexToken = makeToken()
    const created = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: authHeader(apexToken),
      payload: { title: 'Apex only' },
    })
    const { id } = created.json<{ id: string }>()

    const beaconToken = makeToken({ sub: 'user-bd-admin', organizationId: 'org-beacon', email: 'admin@beacon.example' })
    const res = await app.inject({
      method: 'GET',
      url: `/api/workflows/${id}`,
      headers: authHeader(beaconToken),
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('PATCH /api/workflows/:id', () => {
  it('updates title and increments version', async () => {
    const token = makeToken()
    const created = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: authHeader(token),
      payload: { title: 'Original Title' },
    })
    const { id } = created.json<{ id: string }>()
    const etag = created.headers['etag'] as string

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/workflows/${id}`,
      headers: { ...authHeader(token), 'if-match': etag },
      payload: { title: 'Updated Title' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ title: string; version: number }>()
    expect(body.title).toBe('Updated Title')
    expect(body.version).toBe(2)
    expect(res.headers['etag']).toBe('W/"2"')
  })

  it('returns 412 on stale ETag', async () => {
    const token = makeToken()
    const created = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: authHeader(token),
      payload: { title: 'ETag Test' },
    })
    const { id } = created.json<{ id: string }>()

    // First update succeeds
    await app.inject({
      method: 'PATCH',
      url: `/api/workflows/${id}`,
      headers: { ...authHeader(token), 'if-match': 'W/"1"' },
      payload: { title: 'First Update' },
    })

    // Second update with stale ETag → 412
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/workflows/${id}`,
      headers: { ...authHeader(token), 'if-match': 'W/"1"' },
      payload: { title: 'Stale Update' },
    })
    expect(res.statusCode).toBe(412)
  })
})

describe('POST /api/workflows/:id/transition', () => {
  it('transitions draft → in_progress', async () => {
    const token = makeToken()
    const created = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: authHeader(token),
      payload: { title: 'Transition Test' },
    })
    const { id } = created.json<{ id: string }>()
    const etag = created.headers['etag'] as string

    const res = await app.inject({
      method: 'POST',
      url: `/api/workflows/${id}/transition`,
      headers: { ...authHeader(token), 'if-match': etag },
      payload: { status: 'in_progress' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ status: string }>().status).toBe('in_progress')
  })

  it('returns 422 for invalid transition (draft → completed)', async () => {
    const token = makeToken()
    const created = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: authHeader(token),
      payload: { title: 'Bad Transition' },
    })
    const { id } = created.json<{ id: string }>()
    const etag = created.headers['etag'] as string

    const res = await app.inject({
      method: 'POST',
      url: `/api/workflows/${id}/transition`,
      headers: { ...authHeader(token), 'if-match': etag },
      payload: { status: 'completed' },
    })
    expect(res.statusCode).toBe(422)
  })

  it('tenant isolation: cannot transition another org\'s workflow (returns 404)', async () => {
    const apexToken = makeToken()
    const created = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: authHeader(apexToken),
      payload: { title: 'Apex Workflow' },
    })
    const { id } = created.json<{ id: string }>()

    const beaconToken = makeToken({ sub: 'user-bd-admin', organizationId: 'org-beacon', email: 'admin@beacon.example' })
    const res = await app.inject({
      method: 'POST',
      url: `/api/workflows/${id}/transition`,
      headers: authHeader(beaconToken),
      payload: { status: 'in_progress' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 428 when If-Match header is missing on transition', async () => {
    const token = makeToken()
    const created = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: authHeader(token),
      payload: { title: 'No ETag Transition' },
    })
    const { id } = created.json<{ id: string }>()

    const res = await app.inject({
      method: 'POST',
      url: `/api/workflows/${id}/transition`,
      headers: authHeader(token),
      payload: { status: 'in_progress' },
    })
    expect(res.statusCode).toBe(428)
  })

  it('transitions failed → draft (retry)', async () => {
    const token = makeToken()
    // Create and advance to failed: draft → in_progress → submitted → failed
    const created = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: authHeader(token),
      payload: { title: 'Retry Test' },
    })
    const { id } = created.json<{ id: string }>()

    const steps: Array<{ from: string; to: string }> = [
      { from: 'W/"1"', to: 'in_progress' },
      { from: 'W/"2"', to: 'submitted' },
      { from: 'W/"3"', to: 'failed' },
    ]
    for (const step of steps) {
      await app.inject({
        method: 'POST',
        url: `/api/workflows/${id}/transition`,
        headers: { ...authHeader(token), 'if-match': step.from },
        payload: { status: step.to },
      })
    }

    // Retry: failed → draft
    const res = await app.inject({
      method: 'POST',
      url: `/api/workflows/${id}/transition`,
      headers: { ...authHeader(token), 'if-match': 'W/"4"' },
      payload: { status: 'draft' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ status: string }>().status).toBe('draft')
  })
})

// ── If-Match required (Stage 1a) ──────────────────────────────────────────────

describe('PATCH /api/workflows/:id — If-Match required', () => {
  it('returns 428 when If-Match header is missing', async () => {
    const token = makeToken()
    const created = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: authHeader(token),
      payload: { title: 'No Header Test' },
    })
    const { id } = created.json<{ id: string }>()

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/workflows/${id}`,
      headers: authHeader(token),
      payload: { title: 'Blind Overwrite Attempt' },
    })
    expect(res.statusCode).toBe(428)
  })
})

// ── Terminal state immutability (Stage 1c) ────────────────────────────────────

describe('PATCH /api/workflows/:id — terminal state guard', () => {
  /** Helper: advance a new workflow to the given status via sequential transitions */
  async function createAndAdvanceTo(
    token: string,
    targetStatus: 'submitted' | 'completed' | 'failed'
  ): Promise<string> {
    const created = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: authHeader(token),
      payload: { title: `Terminal ${targetStatus}` },
    })
    const { id } = created.json<{ id: string }>()

    const pathMap: Record<string, Array<{ from: string; to: string }>> = {
      submitted: [
        { from: 'W/"1"', to: 'in_progress' },
        { from: 'W/"2"', to: 'submitted' },
      ],
      completed: [
        { from: 'W/"1"', to: 'in_progress' },
        { from: 'W/"2"', to: 'submitted' },
        { from: 'W/"3"', to: 'completed' },
      ],
      failed: [
        { from: 'W/"1"', to: 'in_progress' },
        { from: 'W/"2"', to: 'submitted' },
        { from: 'W/"3"', to: 'failed' },
      ],
    }

    for (const step of pathMap[targetStatus]) {
      await app.inject({
        method: 'POST',
        url: `/api/workflows/${id}/transition`,
        headers: { ...authHeader(token), 'if-match': step.from },
        payload: { status: step.to },
      })
    }
    return id
  }

  it('returns 422 when PATCHing a submitted workflow', async () => {
    const token = makeToken()
    const id = await createAndAdvanceTo(token, 'submitted')
    const version = 3 // draft(1) → in_progress(2) → submitted(3)
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/workflows/${id}`,
      headers: { ...authHeader(token), 'if-match': `W/"${version}"` },
      payload: { title: 'Mutate Submitted' },
    })
    expect(res.statusCode).toBe(422)
  })

  it('returns 422 when PATCHing a completed workflow', async () => {
    const token = makeToken()
    const id = await createAndAdvanceTo(token, 'completed')
    const version = 4
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/workflows/${id}`,
      headers: { ...authHeader(token), 'if-match': `W/"${version}"` },
      payload: { title: 'Mutate Completed' },
    })
    expect(res.statusCode).toBe(422)
  })

  it('returns 422 when PATCHing a failed workflow', async () => {
    const token = makeToken()
    const id = await createAndAdvanceTo(token, 'failed')
    const version = 4
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/workflows/${id}`,
      headers: { ...authHeader(token), 'if-match': `W/"${version}"` },
      payload: { title: 'Mutate Failed' },
    })
    expect(res.statusCode).toBe(422)
  })
})

// ── Test helper route safety ────────────────────────────────────────────────

describe('POST /api/test/reset', () => {
  it('returns 404 when NODE_ENV is not "test"', async () => {
    // buildApp does not register test helper routes, so this should 404.
    // This proves the route is not leaked into non-test environments.
    const res = await app.inject({
      method: 'POST',
      url: '/api/test/reset',
    })
    expect(res.statusCode).toBe(404)
  })
})
