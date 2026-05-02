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

  it('returns 422 for invalid state-machine transition (draft → completed)', async () => {
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

// ── RBAC: transition permission enforcement ────────────────────────────────────

describe('RBAC — reviewer blocked from admin-only transitions', () => {
  /** Helper: advance a workflow to a target status using admin tokens */
  async function advanceToSubmitted(adminToken: string): Promise<{ id: string; etag: string }> {
    const created = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: authHeader(adminToken),
      payload: { title: 'RBAC Test Workflow' },
    })
    const { id } = created.json<{ id: string }>()

    await app.inject({
      method: 'POST',
      url: `/api/workflows/${id}/transition`,
      headers: { ...authHeader(adminToken), 'if-match': 'W/"1"' },
      payload: { status: 'in_progress' },
    })
    await app.inject({
      method: 'POST',
      url: `/api/workflows/${id}/transition`,
      headers: { ...authHeader(adminToken), 'if-match': 'W/"2"' },
      payload: { status: 'submitted' },
    })
    return { id, etag: 'W/"3"' }
  }

  it('reviewer is blocked from submitted → completed (403)', async () => {
    const adminToken = makeToken()
    const reviewerToken = makeToken({ sub: 'user-aa-reviewer', role: 'reviewer', email: 'reviewer@apex.example', name: 'Aaron Reviewer' })
    const { id, etag } = await advanceToSubmitted(adminToken)

    const res = await app.inject({
      method: 'POST',
      url: `/api/workflows/${id}/transition`,
      headers: { ...authHeader(reviewerToken), 'if-match': etag },
      payload: { status: 'completed' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('reviewer is blocked from submitted → failed (403)', async () => {
    const adminToken = makeToken()
    const reviewerToken = makeToken({ sub: 'user-aa-reviewer', role: 'reviewer', email: 'reviewer@apex.example', name: 'Aaron Reviewer' })
    const { id, etag } = await advanceToSubmitted(adminToken)

    const res = await app.inject({
      method: 'POST',
      url: `/api/workflows/${id}/transition`,
      headers: { ...authHeader(reviewerToken), 'if-match': etag },
      payload: { status: 'failed' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('reviewer is blocked from failed → draft (403)', async () => {
    const adminToken = makeToken()
    const reviewerToken = makeToken({ sub: 'user-aa-reviewer', role: 'reviewer', email: 'reviewer@apex.example', name: 'Aaron Reviewer' })
    const { id, etag } = await advanceToSubmitted(adminToken)

    // Admin fails it first
    await app.inject({
      method: 'POST',
      url: `/api/workflows/${id}/transition`,
      headers: { ...authHeader(adminToken), 'if-match': etag },
      payload: { status: 'failed' },
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/workflows/${id}/transition`,
      headers: { ...authHeader(reviewerToken), 'if-match': 'W/"4"' },
      payload: { status: 'draft' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('admin is allowed to perform submitted → completed (200)', async () => {
    const adminToken = makeToken()
    const { id, etag } = await advanceToSubmitted(adminToken)

    const res = await app.inject({
      method: 'POST',
      url: `/api/workflows/${id}/transition`,
      headers: { ...authHeader(adminToken), 'if-match': etag },
      payload: { status: 'completed' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ status: string }>().status).toBe('completed')
  })

  it('admin is allowed to perform submitted → failed (200)', async () => {
    const adminToken = makeToken()
    const { id, etag } = await advanceToSubmitted(adminToken)

    const res = await app.inject({
      method: 'POST',
      url: `/api/workflows/${id}/transition`,
      headers: { ...authHeader(adminToken), 'if-match': etag },
      payload: { status: 'failed' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ status: string }>().status).toBe('failed')
  })

  it('admin is allowed to perform failed → draft (recovery)', async () => {
    const adminToken = makeToken()
    const { id, etag } = await advanceToSubmitted(adminToken)

    await app.inject({
      method: 'POST',
      url: `/api/workflows/${id}/transition`,
      headers: { ...authHeader(adminToken), 'if-match': etag },
      payload: { status: 'failed' },
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/workflows/${id}/transition`,
      headers: { ...authHeader(adminToken), 'if-match': 'W/"4"' },
      payload: { status: 'draft' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ status: string }>().status).toBe('draft')
  })

  it('reviewer is allowed to perform draft → in_progress (200)', async () => {
    const reviewerToken = makeToken({ sub: 'user-aa-reviewer', role: 'reviewer', email: 'reviewer@apex.example', name: 'Aaron Reviewer' })
    const created = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: authHeader(reviewerToken),
      payload: { title: 'Reviewer Start Test' },
    })
    const { id } = created.json<{ id: string }>()
    const etag = created.headers['etag'] as string

    const res = await app.inject({
      method: 'POST',
      url: `/api/workflows/${id}/transition`,
      headers: { ...authHeader(reviewerToken), 'if-match': etag },
      payload: { status: 'in_progress' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('reviewer is allowed to perform in_progress → submitted (200)', async () => {
    const reviewerToken = makeToken({ sub: 'user-aa-reviewer', role: 'reviewer', email: 'reviewer@apex.example', name: 'Aaron Reviewer' })
    const created = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: authHeader(reviewerToken),
      payload: { title: 'Reviewer Submit Test' },
    })
    const { id } = created.json<{ id: string }>()

    await app.inject({
      method: 'POST',
      url: `/api/workflows/${id}/transition`,
      headers: { ...authHeader(reviewerToken), 'if-match': 'W/"1"' },
      payload: { status: 'in_progress' },
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/workflows/${id}/transition`,
      headers: { ...authHeader(reviewerToken), 'if-match': 'W/"2"' },
      payload: { status: 'submitted' },
    })
    expect(res.statusCode).toBe(200)
  })
})

// ── Audit trail ──────────────────────────────────────────────────────────────

describe('GET /api/workflows/:id/audit', () => {
  it('returns 401 without auth', async () => {
    const token = makeToken()
    const created = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: authHeader(token),
      payload: { title: 'Audit Auth Test' },
    })
    const { id } = created.json<{ id: string }>()

    const res = await app.inject({ method: 'GET', url: `/api/workflows/${id}/audit` })
    expect(res.statusCode).toBe(401)
  })

  it('returns 404 for wrong-org (tenant isolation)', async () => {
    const apexToken = makeToken()
    const created = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: authHeader(apexToken),
      payload: { title: 'Apex Audit Test' },
    })
    const { id } = created.json<{ id: string }>()

    const beaconToken = makeToken({ sub: 'user-bd-admin', organizationId: 'org-beacon', email: 'admin@beacon.example' })
    const res = await app.inject({
      method: 'GET',
      url: `/api/workflows/${id}/audit`,
      headers: authHeader(beaconToken),
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns a creation entry for a workflow with no API transitions', async () => {
    const token = makeToken()
    const created = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: authHeader(token),
      payload: { title: 'No Transitions Yet' },
    })
    const { id } = created.json<{ id: string }>()

    const res = await app.inject({
      method: 'GET',
      url: `/api/workflows/${id}/audit`,
      headers: authHeader(token),
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('private, no-store')
    expect(res.headers['vary']).toBe('Authorization')
    const entries = res.json<unknown[]>()
    expect(entries).toHaveLength(1)
    // Creation entry: null → draft
    expect(entries[0]).toMatchObject({ oldState: null, newState: 'draft' })
  })

  it('returns ordered entries after transitions', async () => {
    const token = makeToken()
    const created = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: authHeader(token),
      payload: { title: 'Audit Sequence Test' },
    })
    const { id } = created.json<{ id: string }>()

    await app.inject({
      method: 'POST',
      url: `/api/workflows/${id}/transition`,
      headers: { ...authHeader(token), 'if-match': 'W/"1"' },
      payload: { status: 'in_progress' },
    })
    await app.inject({
      method: 'POST',
      url: `/api/workflows/${id}/transition`,
      headers: { ...authHeader(token), 'if-match': 'W/"2"' },
      payload: { status: 'submitted' },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/workflows/${id}/audit`,
      headers: authHeader(token),
    })
    expect(res.statusCode).toBe(200)
    const entries = res.json<Array<{ oldState: string | null; newState: string }>>()
    expect(entries).toHaveLength(3)
    expect(entries[0].oldState).toBe(null)
    expect(entries[0].newState).toBe('draft')
    expect(entries[1].oldState).toBe('draft')
    expect(entries[1].newState).toBe('in_progress')
    expect(entries[2].oldState).toBe('in_progress')
    expect(entries[2].newState).toBe('submitted')
  })

  it('each entry contains all required fields', async () => {
    const token = makeToken()
    const created = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: authHeader(token),
      payload: { title: 'Audit Fields Test' },
    })
    const { id } = created.json<{ id: string }>()

    await app.inject({
      method: 'POST',
      url: `/api/workflows/${id}/transition`,
      headers: { ...authHeader(token), 'if-match': 'W/"1"' },
      payload: { status: 'in_progress', reason: 'Starting work' },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/workflows/${id}/audit`,
      headers: authHeader(token),
    })
    const entries = res.json<Array<Record<string, unknown>>>()
    expect(entries).toHaveLength(2)

    // entries[0] is the creation entry; entries[1] is the transition we just made
    const entry = entries[1]
    expect(typeof entry.correlationId).toBe('string')
    expect(entry.correlationId).toMatch(/^[0-9a-f-]{36}$/) // UUID
    expect(entry.workflowId).toBe(id)
    expect(typeof entry.timestamp).toBe('string')
    expect(entry.actorId).toBe('user-aa-admin')
    expect(entry.actorRole).toBe('admin')
    expect(entry.oldState).toBe('draft')
    expect(entry.newState).toBe('in_progress')
    expect(entry.reason).toBe('Starting work')
  })

  it('audit log captures the submitted → failed → draft recovery path', async () => {
    const token = makeToken()
    const created = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: authHeader(token),
      payload: { title: 'Recovery Audit Test' },
    })
    const { id } = created.json<{ id: string }>()

    for (const [etag, status] of [['W/"1"', 'in_progress'], ['W/"2"', 'submitted'], ['W/"3"', 'failed'], ['W/"4"', 'draft']] as const) {
      await app.inject({
        method: 'POST',
        url: `/api/workflows/${id}/transition`,
        headers: { ...authHeader(token), 'if-match': etag },
        payload: { status },
      })
    }

    const res = await app.inject({
      method: 'GET',
      url: `/api/workflows/${id}/audit`,
      headers: authHeader(token),
    })
    const entries = res.json<Array<{ oldState: string | null; newState: string }>>()
    expect(entries).toHaveLength(5)
    // entries[0] is the creation entry (null → draft)
    expect(entries[3].oldState).toBe('submitted')
    expect(entries[3].newState).toBe('failed')
    expect(entries[4].oldState).toBe('failed')
    expect(entries[4].newState).toBe('draft')
  })

  it('reviewer receives redacted entries (no actorId, no correlationId)', async () => {
    const adminToken = makeToken()
    const created = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: authHeader(adminToken),
      payload: { title: 'Redaction Test' },
    })
    const { id } = created.json<{ id: string }>()

    await app.inject({
      method: 'POST',
      url: `/api/workflows/${id}/transition`,
      headers: { ...authHeader(adminToken), 'if-match': 'W/"1"' },
      payload: { status: 'in_progress', reason: 'review starts' },
    })

    const reviewerToken = makeToken({
      sub: 'user-aa-reviewer',
      email: 'reviewer@apex.example',
      name: 'Rex Reviewer',
      role: 'reviewer',
    })
    const res = await app.inject({
      method: 'GET',
      url: `/api/workflows/${id}/audit`,
      headers: authHeader(reviewerToken),
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('private, no-store')
    expect(res.headers['vary']).toBe('Authorization')

    const entries = res.json<Array<Record<string, unknown>>>()
    expect(entries.length).toBeGreaterThanOrEqual(1)
    for (const entry of entries) {
      expect(entry).not.toHaveProperty('actorId')
      expect(entry).not.toHaveProperty('correlationId')
      // Public fields must be present
      expect(entry).toHaveProperty('workflowId')
      expect(entry).toHaveProperty('timestamp')
      expect(entry).toHaveProperty('actorRole')
      expect(entry).toHaveProperty('oldState')
      expect(entry).toHaveProperty('newState')
    }
  })
})
