import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkflowWizard } from '@/components/Workflow/WorkflowWizard'
import type { Workflow } from '@/types/workflow'

vi.mock('@/hooks/useAutoSave', () => ({
  useAutoSave: () => ({ save: vi.fn(), flush: vi.fn() }),
}))

const mockTransitionMutate = vi.fn()
vi.mock('@/hooks/useWorkflows', () => ({
  useTransitionWorkflow: () => ({ mutate: mockTransitionMutate, isPending: false }),
  workflowKeys: {
    all: ['workflows'] as const,
    detail: (id: string) => ['workflows', id] as const,
  },
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

// Stub step form components to keep tests simple and fast
vi.mock('@/components/Workflow/Step1OrganizationProfile', () => ({
  Step1Form: ({ readOnly }: { readOnly: boolean }) => (
    <div data-testid="step1" data-readonly={String(readOnly)} />
  ),
}))
vi.mock('@/components/Workflow/Step2DataCollection', () => ({
  Step2Form: () => <div data-testid="step2" />,
}))
vi.mock('@/components/Workflow/Step3ReviewCalibration', () => ({
  Step3Form: () => <div data-testid="step3" />,
}))
vi.mock('@/components/Workflow/Step4Summary', () => ({
  Step4Form: () => <div data-testid="step4" />,
}))

const MOCK_WF: Workflow = {
  id: 'wf1',
  organizationId: 'org1',
  title: 'Test',
  description: '',
  status: 'draft',
  currentStep: 1,
  step1Data: null,
  step2Data: null,
  step3Data: null,
  step4Data: null,
  version: 1,
  statusHistory: [],
  createdAt: '',
  updatedAt: '',
  createdBy: 'u1',
}

describe('WorkflowWizard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders step 1 content by default', () => {
    render(<WorkflowWizard workflow={MOCK_WF} etag='W/"1"' onETagChange={vi.fn()} />)
    expect(screen.getByTestId('step1')).toBeInTheDocument()
    expect(screen.queryByTestId('step2')).not.toBeInTheDocument()
  })

  it('navigates to step 2 when Next is clicked', async () => {
    const user = userEvent.setup()
    render(<WorkflowWizard workflow={MOCK_WF} etag='W/"1"' onETagChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByTestId('step2')).toBeInTheDocument()
  })

  it('Previous button is disabled on step 1', () => {
    render(<WorkflowWizard workflow={MOCK_WF} etag='W/"1"' onETagChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
  })

  it('shows "Submit Workflow" button on last step (step 4)', () => {
    const wf: Workflow = { ...MOCK_WF, currentStep: 4 }
    render(<WorkflowWizard workflow={wf} etag='W/"1"' onETagChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /submit workflow/i })).toBeInTheDocument()
  })

  it('Submit Workflow button is disabled for read-only (submitted) workflows', () => {
    const wf: Workflow = { ...MOCK_WF, status: 'submitted', currentStep: 4 }
    render(<WorkflowWizard workflow={wf} etag='W/"3"' onETagChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /submit workflow/i })).toBeDisabled()
  })

  it('passes readOnly=true to step forms for submitted workflows', () => {
    const wf: Workflow = { ...MOCK_WF, status: 'submitted' }
    render(<WorkflowWizard workflow={wf} etag='W/"3"' onETagChange={vi.fn()} />)
    expect(screen.getByTestId('step1')).toHaveAttribute('data-readonly', 'true')
  })

  it('passes readOnly=false to step forms for draft workflows', () => {
    render(<WorkflowWizard workflow={MOCK_WF} etag='W/"1"' onETagChange={vi.fn()} />)
    expect(screen.getByTestId('step1')).toHaveAttribute('data-readonly', 'false')
  })
})
