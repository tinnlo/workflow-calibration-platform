import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/services/authService', () => ({
  getAccessToken: vi.fn(),
  logout: vi.fn(),
}))

import { apiFetch, extractETag } from '@/services/api'
import { getAccessToken, logout } from '@/services/authService'
import { ApiError } from '@/types/api'

const mockGetAccessToken = vi.mocked(getAccessToken)
const mockLogout = vi.mocked(logout)

function mockFetch(status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json', ...extraHeaders })
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: vi.fn().mockResolvedValue(body),
    headers,
  }) as unknown as typeof fetch
}

describe('apiFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAccessToken.mockReturnValue(null)
  })

  it('sends Bearer token when a token is stored', async () => {
    mockGetAccessToken.mockReturnValue('my-token')
    mockFetch(200, { ok: true })
    await apiFetch('/workflows')
    const callHeaders = vi.mocked(global.fetch).mock.calls[0][1]?.headers as Record<string, string>
    expect(callHeaders['Authorization']).toBe('Bearer my-token')
  })

  it('does not send Authorization header when no token', async () => {
    mockFetch(200, { ok: true })
    await apiFetch('/workflows')
    const callHeaders = vi.mocked(global.fetch).mock.calls[0][1]?.headers as Record<string, string>
    expect(callHeaders['Authorization']).toBeUndefined()
  })

  it('sets Content-Type when body is provided', async () => {
    mockFetch(200, {})
    await apiFetch('/workflows', { method: 'POST', body: { title: 'T' } })
    const callHeaders = vi.mocked(global.fetch).mock.calls[0][1]?.headers as Record<string, string>
    expect(callHeaders['Content-Type']).toBe('application/json')
  })

  it('sets If-Match header when etag is provided', async () => {
    mockFetch(200, {})
    await apiFetch('/workflows/1', { etag: 'W/"1"' })
    const callHeaders = vi.mocked(global.fetch).mock.calls[0][1]?.headers as Record<string, string>
    expect(callHeaders['If-Match']).toBe('W/"1"')
  })

  it('throws ApiError on non-2xx response', async () => {
    const problem = { type: 'test', title: 'Bad', status: 422, detail: 'Nope' }
    mockFetch(422, problem)
    await expect(apiFetch('/workflows')).rejects.toBeInstanceOf(ApiError)
  })

  it('calls logout and dispatches auth:expired on 401 for non-login paths', async () => {
    const problem = { type: 'test', title: 'Unauth', status: 401, detail: 'Expired' }
    mockFetch(401, problem)
    const events: Event[] = []
    const listener = (e: Event) => events.push(e)
    window.addEventListener('auth:expired', listener)
    await expect(apiFetch('/workflows')).rejects.toBeInstanceOf(ApiError)
    window.removeEventListener('auth:expired', listener)
    expect(mockLogout).toHaveBeenCalled()
    expect(events).toHaveLength(1)
  })

  it('does NOT call logout or dispatch auth:expired on 401 for /auth/login path', async () => {
    const problem = { type: 'test', title: 'Unauth', status: 401, detail: 'Bad creds' }
    mockFetch(401, problem)
    const events: Event[] = []
    const listener = (e: Event) => events.push(e)
    window.addEventListener('auth:expired', listener)
    await expect(apiFetch('/auth/login', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ApiError)
    window.removeEventListener('auth:expired', listener)
    expect(mockLogout).not.toHaveBeenCalled()
    expect(events).toHaveLength(0)
  })

  it('returns undefined for 204 No Content', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
      json: vi.fn(),
    }) as unknown as typeof fetch
    const result = await apiFetch('/workflows/1')
    expect(result).toBeUndefined()
  })
})

describe('extractETag', () => {
  it('returns the ETag header value', () => {
    const headers = new Headers({ etag: 'W/"3"' })
    expect(extractETag(headers)).toBe('W/"3"')
  })

  it('returns undefined when no ETag header', () => {
    expect(extractETag(new Headers())).toBeUndefined()
  })
})
