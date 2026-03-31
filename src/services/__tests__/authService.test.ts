import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock api.ts before importing authService to avoid circular dependency issues
vi.mock('@/services/api', () => ({ apiFetch: vi.fn() }))

import { getAccessToken, setAccessToken, isAuthenticated, logout, login, fetchMe } from '@/services/authService'
import { apiFetch } from '@/services/api'

const mockApiFetch = vi.mocked(apiFetch)

const MOCK_USER = {
  id: 'u1',
  organizationId: 'org1',
  email: 'a@b.com',
  name: 'Alice',
  role: 'admin' as const,
}

describe('authService', () => {
  beforeEach(() => {
    setAccessToken(null)
    vi.clearAllMocks()
  })

  it('getAccessToken returns null initially', () => {
    expect(getAccessToken()).toBeNull()
  })

  it('setAccessToken stores token; getAccessToken retrieves it', () => {
    setAccessToken('my-token')
    expect(getAccessToken()).toBe('my-token')
  })

  it('isAuthenticated returns false when no token', () => {
    expect(isAuthenticated()).toBe(false)
  })

  it('isAuthenticated returns true after setAccessToken', () => {
    setAccessToken('tok')
    expect(isAuthenticated()).toBe(true)
  })

  it('logout clears the token', () => {
    setAccessToken('tok')
    logout()
    expect(getAccessToken()).toBeNull()
    expect(isAuthenticated()).toBe(false)
  })

  it('login calls apiFetch twice, sets token, and returns user', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ accessToken: 'tok123' }) // POST /auth/login
      .mockResolvedValueOnce(MOCK_USER)                 // GET /auth/me

    const result = await login('a@b.com', 'pass')

    expect(getAccessToken()).toBe('tok123')
    expect(result).toEqual(MOCK_USER)
    expect(mockApiFetch).toHaveBeenCalledTimes(2)
    expect(mockApiFetch).toHaveBeenNthCalledWith(1, '/auth/login', {
      method: 'POST',
      body: { email: 'a@b.com', password: 'pass' },
    })
    expect(mockApiFetch).toHaveBeenNthCalledWith(2, '/auth/me')
  })

  it('fetchMe calls GET /auth/me', async () => {
    mockApiFetch.mockResolvedValueOnce(MOCK_USER)
    const result = await fetchMe()
    expect(result).toEqual(MOCK_USER)
    expect(mockApiFetch).toHaveBeenCalledWith('/auth/me')
  })
})
