import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { login as doLogin, logout as doLogout, fetchMe, isAuthenticated } from '@/services/authService'
import type { AuthUser } from '@/types/auth'

// ─── Context shape ────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const qc = useQueryClient()

  // Keep a ref to the latest qc so effects with stable [] deps always call
  // the current instance. This avoids re-running mount-only effects when qc
  // identity changes (e.g. in test environments with unstable mocks).
  const qcRef = useRef(qc)
  useEffect(() => { qcRef.current = qc }, [qc])

  // On mount: if a token already exists (e.g. page reload), verify it.
  // Clear the React Query cache before setting the verified user so that any
  // data cached by a previous session cannot be synchronously served to the
  // newly-identified user while fresh queries are in flight.
  // The `cancelled` flag ensures a slow fetchMe() that resolves after a
  // concurrent logout/token-expiry cannot repopulate user state.
  useEffect(() => {
    let cancelled = false
    if (isAuthenticated()) {
      fetchMe()
        .then((me) => {
          if (cancelled) return
          qcRef.current.clear()
          setUser(me)
        })
        .catch(() => {
          if (cancelled) return
          doLogout()
          setUser(null)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    } else {
      setLoading(false)
    }
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const me = await doLogin(email, password)
    // Clear any cache from a previous session before setting the new user so
    // that stale queries (including audit logs) are never served to the new user.
    qcRef.current.clear()
    setUser(me)
  }, [])

  const logout = useCallback(() => {
    doLogout()
    setUser(null)
    // Clear the cache on logout so that the next user who logs in on the same
    // browser cannot see cached data (e.g. audit logs) from the previous session.
    qcRef.current.clear()
  }, [])

  // Listen for the 'auth:expired' event fired by apiFetch when a 401 is
  // received. This ensures that token expiry/revocation triggers a full
  // teardown (user state + React Query cache) without apiFetch needing a
  // direct reference to AuthContext or QueryClient.
  useEffect(() => {
    window.addEventListener('auth:expired', logout)
    return () => window.removeEventListener('auth:expired', logout)
  }, [logout])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

// ─── Protected route ──────────────────────────────────────────────────────────

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
