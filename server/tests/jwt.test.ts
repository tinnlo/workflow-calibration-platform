import { describe, it, expect } from 'vitest'
import { signAccessToken, verifyAccessToken } from '../src/services/jwtService.js'
import { UnauthorizedError } from '../src/errors.js'

describe('jwtService', () => {
  const payload = {
    sub: 'user-test-01',
    organizationId: 'org-test',
    email: 'test@example.com',
    name: 'Test User',
    role: 'admin' as const,
  }

  it('signs and verifies a valid token', () => {
    const token = signAccessToken(payload)
    expect(typeof token).toBe('string')
    expect(token.split('.')).toHaveLength(3)

    const decoded = verifyAccessToken(token)
    expect(decoded.sub).toBe(payload.sub)
    expect(decoded.organizationId).toBe(payload.organizationId)
    expect(decoded.email).toBe(payload.email)
    expect(decoded.name).toBe(payload.name)
    expect(decoded.role).toBe(payload.role)
  })

  it('throws UnauthorizedError for a tampered token', () => {
    const token = signAccessToken(payload)
    const tampered = token.slice(0, -4) + 'XXXX'
    expect(() => verifyAccessToken(tampered)).toThrow(UnauthorizedError)
  })

  it('throws UnauthorizedError for a completely invalid string', () => {
    expect(() => verifyAccessToken('not.a.token')).toThrow(UnauthorizedError)
  })

  it('throws UnauthorizedError with message "Invalid token" for bad token', () => {
    try {
      verifyAccessToken('bad.token.here')
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedError)
      expect((err as UnauthorizedError).message).toBe('Invalid token')
    }
  })
})
