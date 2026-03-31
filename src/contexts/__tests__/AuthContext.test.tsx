import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider, useAuth, ProtectedRoute } from '@/contexts/AuthContext'
import type { AuthUser } from '@/types/auth'

vi.mock('@/services/authService', () => ({
  isAuthenticated: vi.fn(() => false),
  fetchMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}))

// Stub navigation hooks to prevent React Router v6 transition side-effects
// that cause act() to hang in vitest/jsdom. Keep MemoryRouter and Link real.
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ state: null, pathname: '/', search: '', hash: '', key: 'default' }),
    Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />,
  }
})

import { isAuthenticated, fetchMe, login as doLogin } from '@/services/authService'

const mockIsAuthenticated = isAuthenticated as ReturnType<typeof vi.fn>
const mockFetchMe = fetchMe as ReturnType<typeof vi.fn>
const mockDoLogin = doLogin as ReturnType<typeof vi.fn>

const MOCK_USER: AuthUser = {
  id: 'u1',
  organizationId: 'org1',
  email: 'a@b.com',
  name: 'Alice',
  role: 'admin',
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: (e: Error) => void },
  { caught: boolean }
> {
  constructor(props: { children: React.ReactNode; onError?: (e: Error) => void }) {
    super(props)
    this.state = { caught: false }
  }
  static getDerivedStateFromError() { return { caught: true } }
  componentDidCatch(e: Error) { this.props.onError?.(e) }
  render() { return this.state.caught ? <div>error-caught</div> : this.props.children }
}

function TestChild() {
  const { user, loading } = useAuth()
  if (loading) return <div>loading</div>
  return <div>{user ? `user:${user.id}` : 'no-user'}</div>
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAuthenticated.mockReturnValue(false)
  })

  it('shows no-user when not authenticated', async () => {
    await act(async () => {
      render(<MemoryRouter><AuthProvider><TestChild /></AuthProvider></MemoryRouter>)
    })
    expect(screen.getByText('no-user')).toBeInTheDocument()
  })

  it('shows user when already authenticated', async () => {
    mockIsAuthenticated.mockReturnValue(true)
    mockFetchMe.mockResolvedValue(MOCK_USER)

    await act(async () => {
      render(<MemoryRouter><AuthProvider><TestChild /></AuthProvider></MemoryRouter>)
    })

    expect(screen.getByText('user:u1')).toBeInTheDocument()
  })

  it('login function calls doLogin and updates user state', async () => {
    mockDoLogin.mockResolvedValue(MOCK_USER)

    function LoginButton() {
      const { login, user } = useAuth()
      return (
        <>
          <button onClick={() => login('a@b.com', 'pass')}>login</button>
          {user && <span>logged-in:{user.id}</span>}
        </>
      )
    }

    await act(async () => {
      render(<MemoryRouter><AuthProvider><LoginButton /></AuthProvider></MemoryRouter>)
    })

    await act(async () => { screen.getByText('login').click() })
    expect(screen.getByText('logged-in:u1')).toBeInTheDocument()
  })

  it('useAuth throws when used outside AuthProvider', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let caught: Error | undefined
    function Naked() {
      useAuth()
      return null
    }
    await act(async () => {
      render(
        <MemoryRouter>
          <ErrorBoundary onError={(e) => { caught = e }}>
            <Naked />
          </ErrorBoundary>
        </MemoryRouter>
      )
    })
    expect(screen.getByText('error-caught')).toBeInTheDocument()
    expect(caught).toBeDefined()
    spy.mockRestore()
  })
})

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAuthenticated.mockReturnValue(false)
  })

  it('does not show protected content when not authenticated', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <AuthProvider>
            <ProtectedRoute><div>protected content</div></ProtectedRoute>
          </AuthProvider>
        </MemoryRouter>
      )
    })
    // Navigate stub renders instead of redirecting
    expect(screen.queryByText('protected content')).not.toBeInTheDocument()
  })

  it('renders children when authenticated', async () => {
    mockIsAuthenticated.mockReturnValue(true)
    mockFetchMe.mockResolvedValue(MOCK_USER)

    await act(async () => {
      render(
        <MemoryRouter>
          <AuthProvider>
            <ProtectedRoute><div>protected content</div></ProtectedRoute>
          </AuthProvider>
        </MemoryRouter>
      )
    })

    await waitFor(() => expect(screen.getByText('protected content')).toBeInTheDocument(), { timeout: 2000 })
  })
})
