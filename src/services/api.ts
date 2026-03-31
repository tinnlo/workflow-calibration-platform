import { ApiError, type ProblemDetail } from '@/types/api'
import { getAccessToken, logout } from '@/services/authService'

const BASE_URL: string = (() => {
  const envUrl = import.meta.env.VITE_API_BASE_URL
  if (import.meta.env.PROD && !envUrl) {
    throw new Error(
      'VITE_API_BASE_URL must be set to the API origin in production/staging builds. ' +
      'The "/api" fallback only works in local development.'
    )
  }
  return envUrl ?? '/api'
})()

interface FetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  etag?: string
}

/**
 * Central fetch wrapper that:
 * - Attaches Bearer token from in-memory authService
 * - Sets Content-Type: application/json for requests with a body
 * - Sends If-Match header when etag is provided
 * - On 401: clears the token (session expired) so ProtectedRoute redirects
 * - Throws ApiError (wrapping RFC 7807 problem detail) on non-2xx responses
 */
export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { body, etag, ...rest } = options
  const token = getAccessToken()

  const headers: Record<string, string> = {
    ...(rest.headers as Record<string, string>),
    Accept: 'application/json',
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  if (etag) {
    headers['If-Match'] = etag
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    let problem: ProblemDetail
    try {
      problem = (await response.json()) as ProblemDetail
    } catch {
      problem = {
        type: 'https://calibration-platform.example/problems/network-error',
        title: 'Request Failed',
        status: response.status,
        detail: response.statusText || 'An unexpected error occurred',
      }
    }

    // 401 means the token expired or is invalid — clear it so the ProtectedRoute
    // will redirect to /login on the next render cycle.
    if (response.status === 401 && path !== '/auth/login') {
      logout()
    }

    throw new ApiError(problem)
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

/** Extract ETag header from a response for subsequent conditional requests */
export function extractETag(headers: Headers): string | undefined {
  return headers.get('etag') ?? undefined
}
