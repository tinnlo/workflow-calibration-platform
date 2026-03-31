import { apiFetch } from '@/services/api'
import type { AuthUser, LoginResponse } from '@/types/auth'

/**
 * Token stored in module-level variable — never in localStorage.
 * This means tokens are cleared on page refresh (intentional for a demo).
 */
let _accessToken: string | null = null

export function getAccessToken(): string | null {
  return _accessToken
}

export function setAccessToken(token: string | null): void {
  _accessToken = token
}

export function isAuthenticated(): boolean {
  return _accessToken !== null
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const { accessToken } = await apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
  })
  setAccessToken(accessToken)
  return fetchMe()
}

export async function fetchMe(): Promise<AuthUser> {
  return apiFetch<AuthUser>('/auth/me')
}

export function logout(): void {
  setAccessToken(null)
}

// Expose token getter on window only when the E2E hook flag is explicitly set.
// Using a dedicated opt-in var instead of import.meta.env.DEV prevents a live
// bearer token from being accessible to arbitrary scripts during normal
// development sessions.
if (import.meta.env.VITE_E2E_HOOKS === 'true') {
  ;(window as Window & { __getToken?: () => string | null }).__getToken = getAccessToken
}
