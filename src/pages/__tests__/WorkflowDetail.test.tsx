import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import WorkflowDetail from '@/pages/WorkflowDetail'
import { useWorkflow, useTransitionWorkflow } from '@/hooks/useWorkflows'
import { ApiError } from '@/types/api'
import type { Workflow } from '@/types/workflow'

vi.mock('@/hooks/useWorkflows', () => ({
  useWorkflow: vi.fn(),
  useTransitionWorkflow: vi.fn(),
}))

vi.mock('@/components/Workflow/WorkflowWizard', () => ({
  WorkflowWizard: () => <div data-testid="workflow-wizard" />,
}))

vi.mock('@/services/pdfExport', () => ({
  exportWorkflowPdf: vi.fn(),
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

const MOCK_WF: Workflow = {
  id: 'wf1',
  organizationId: 'org1',
  title: 'My Workflow',
  description: '',
  status: 'draft',
  currentStep: 1,
  step1Data: null,
  step2Data: null,
  step3Data: null,
  step4Data: null,
  version: 1,
  statusHistory: [{ from: null, to: 'draft', timestamp: new Date().toISOString() }],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  createdBy: 'u1',
}

const mockTransitionMutate = vi.fn()

describe('WorkflowDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useTransitionWorkflow).mockReturnValue({
      mutate: mockTransitionMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useTransitionWorkflow>)
  })

  function renderDetail(id = 'wf1') {
    return render(
      <MemoryRouter initialEntries={[`/workflows/${id}`]}>
        <Routes>
          <Route path="/workflows/:id" element={<WorkflowDetail />} />
        </Routes>
      </MemoryRouter>
    )
  }

  it('shows loading state', () => {
    vi.mocked(useWorkflow).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useWorkflow>)
    renderDetail()
    expect(screen.getByText(/loading workflow/i)).toBeInTheDocument()
  })

  it('shows error state with detail message', () => {
    vi.mocked(useWorkflow).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new ApiError({ type: 't', title: 'Not Found', status: 404, detail: 'Workflow not found' }),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useWorkflow>)
    renderDetail()
    expect(screen.getByText(/workflow not found/i)).toBeInTheDocument()
  })

  it('renders workflow title and wizard when loaded', () => {
    vi.mocked(useWorkflow).mockReturnValue({
      data: MOCK_WF,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useWorkflow>)
    renderDetail()
    expect(screen.getByText('My Workflow')).toBeInTheDocument()
    expect(screen.getByTestId('workflow-wizard')).toBeInTheDocument()
  })

  it('shows Retry button only for failed workflows', () => {
    const failedWf: Workflow = { ...MOCK_WF, status: 'failed', version: 4 }
    vi.mocked(useWorkflow).mockReturnValue({
      data: failedWf,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useWorkflow>)
    renderDetail()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('does not show Retry button for draft workflows', () => {
    vi.mocked(useWorkflow).mockReturnValue({
      data: MOCK_WF,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useWorkflow>)
    renderDetail()
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
  })

  it('calls transition mutation on Retry click', async () => {
    const failedWf: Workflow = { ...MOCK_WF, status: 'failed', version: 4 }
    vi.mocked(useWorkflow).mockReturnValue({
      data: failedWf,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useWorkflow>)

    const user = userEvent.setup()
    renderDetail()
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(mockTransitionMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'wf1',
        input: { status: 'draft', reason: 'Retry after failure' },
      }),
      expect.anything()
    )
  })

  it('shows PDF Export button', () => {
    vi.mocked(useWorkflow).mockReturnValue({
      data: MOCK_WF,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useWorkflow>)
    renderDetail()
    expect(screen.getByRole('button', { name: /export pdf/i })).toBeInTheDocument()
  })
})
