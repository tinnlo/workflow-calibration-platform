import jwt from 'jsonwebtoken'
import { config } from '@/config.js'
import { UnauthorizedError } from '@/errors.js'

export interface JwtPayload {
  sub: string          // userId
  organizationId: string
  email: string
  name: string
  role: 'admin' | 'reviewer'
  iat?: number
  exp?: number
  iss?: string
  aud?: string | string[]
}

export function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp' | 'iss' | 'aud'>): string {
  const { JWT_SECRET, JWT_ACCESS_EXPIRY, JWT_ISSUER, JWT_AUDIENCE } = config
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    // jwt typings require StringValue but that type is not exported; cast via unknown
    expiresIn: JWT_ACCESS_EXPIRY as unknown as number,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  })
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: config.JWT_ISSUER,
      audience: config.JWT_AUDIENCE,
    }) as JwtPayload
    return payload
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Token has expired')
    }
    throw new UnauthorizedError('Invalid token')
  }
}
