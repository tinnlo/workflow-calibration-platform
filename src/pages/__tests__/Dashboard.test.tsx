import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from '@/pages/Dashboard'
import { useWorkflows, useCreateWorkflow } from '@/hooks/useWorkflows'
import { useAuth } from '@/contexts/AuthContext'
import { ApiError } from '@/types/api'
import type { Workflow } from '@/types/workflow'

vi.mock('@/hooks/useWorkflows', () => ({
  useWorkflows: vi.fn(),
  useCreateWorkflow: vi.fn(),
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// Avoid Recharts rendering issues in jsdom
vi.mock('@/components/Dashboard/StatusChart', () => ({
  StatusChart: () => <div data-testid="status-chart" />,
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

const MOCK_USER = {
  id: 'u1',
  organizationId: 'org1',
  email: 'a@b.com',
  name: 'Alice',
  role: 'admin' as const,
}

const MOCK_WF: Partial<Workflow> = {
  id: 'wf1',
  organizationId: 'org1',
  title: 'My Workflow',
  status: 'draft',
  updatedAt: new Date().toISOString(),
}

const mockMutate = vi.fn()

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      user: MOCK_USER,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
    })
    vi.mocked(useCreateWorkflow).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useCreateWorkflow>)
  })

  function renderDashboard() {
    return render(<MemoryRouter><Dashboard /></MemoryRouter>)
  }

  it('shows loading spinner while workflows are loading', () => {
    vi.mocked(useWorkflows).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useWorkflows>)
    renderDashboard()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows error message on fetch failure', () => {
    vi.mocked(useWorkflows).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new ApiError({ type: 't', title: 'Err', status: 500, detail: 'Server error occurred' }),
    } as unknown as ReturnType<typeof useWorkflows>)
    renderDashboard()
    expect(screen.getByText(/server error occurred/i)).toBeInTheDocument()
  })

  it('shows empty-state message when workflow list is empty', () => {
    vi.mocked(useWorkflows).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useWorkflows>)
    renderDashboard()
    expect(screen.getByText(/no workflows yet/i)).toBeInTheDocument()
  })

  it('renders workflow rows and status chart when workflows exist', () => {
    vi.mocked(useWorkflows).mockReturnValue({
      data: [MOCK_WF],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useWorkflows>)
    renderDashboard()
    expect(screen.getByText('My Workflow')).toBeInTheDocument()
    expect(screen.getByTestId('status-chart')).toBeInTheDocument()
  })

  it('opens create dialog when "New Workflow" button is clicked', async () => {
    vi.mocked(useWorkflows).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useWorkflows>)
    const user = userEvent.setup()
    renderDashboard()
    await user.click(screen.getByRole('button', { name: /new workflow/i }))
    await waitFor(() => expect(screen.getByLabelText(/title/i)).toBeInTheDocument())
  })

  it('calls createWorkflow mutate with trimmed title and description', async () => {
    vi.mocked(useWorkflows).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useWorkflows>)
    const user = userEvent.setup()
    renderDashboard()
    await user.click(screen.getByRole('button', { name: /new workflow/i }))
    await waitFor(() => screen.getByLabelText(/title/i))
    await user.type(screen.getByLabelText(/title/i), 'My New Workflow')
    await user.click(screen.getByRole('button', { name: /^create$/i }))
    expect(mockMutate).toHaveBeenCalledWith(
      { title: 'My New Workflow', description: '' },
      expect.anything()
    )
  })
})
