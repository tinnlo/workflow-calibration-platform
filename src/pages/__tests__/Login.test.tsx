import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Login from '@/pages/Login'
import { useAuth } from '@/contexts/AuthContext'
import { ApiError } from '@/types/api'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// Preserve real MemoryRouter/Link but stub hooks that cause navigation side-effects
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ state: null, pathname: '/login', search: '', hash: '', key: 'default' }),
  }
})

const mockLogin = vi.fn()

describe('Login page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      loading: false,
      login: mockLogin,
      logout: vi.fn(),
    })
  })

  function renderLogin() {
    return render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )
  }

  it('renders email, password fields and sign-in button', () => {
    renderLogin()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('shows validation error for invalid email', async () => {
    const user = userEvent.setup()
    renderLogin()
    await user.type(screen.getByLabelText(/email/i), 'notanemail')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() =>
      expect(screen.getByText(/invalid email/i)).toBeInTheDocument()
    )
  })

  it('calls login with email and password on valid submit', async () => {
    mockLogin.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderLogin()
    await user.type(screen.getByLabelText(/email/i), 'admin@apex.example')
    await user.type(screen.getByLabelText(/password/i), 'Demo1234!')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith('admin@apex.example', 'Demo1234!')
    )
  })

  it('shows ApiError detail message on login failure', async () => {
    mockLogin.mockRejectedValue(
      new ApiError({ type: 't', title: 'Err', status: 401, detail: 'Invalid email or password' })
    )
    const user = userEvent.setup()
    renderLogin()
    await user.type(screen.getByLabelText(/email/i), 'admin@apex.example')
    await user.type(screen.getByLabelText(/password/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() =>
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument()
    )
  })

  it('shows generic error for unexpected exceptions', async () => {
    mockLogin.mockRejectedValue(new Error('Network failure'))
    const user = userEvent.setup()
    renderLogin()
    await user.type(screen.getByLabelText(/email/i), 'admin@apex.example')
    await user.type(screen.getByLabelText(/password/i), 'pass')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() =>
      expect(screen.getByText(/unexpected error/i)).toBeInTheDocument()
    )
  })
})
