import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkflowWizard } from '@/components/Workflow/WorkflowWizard'
import type { Workflow } from '@/types/workflow'

// Capture onConflict, save, and flush so tests can invoke / assert them
let capturedOnConflict: (() => void) | undefined
let capturedSave: ReturnType<typeof vi.fn>
let capturedFlush: ReturnType<typeof vi.fn>

vi.mock('@/hooks/useAutoSave', () => ({
  useAutoSave: ({ onConflict }: { onConflict?: () => void }) => {
    capturedOnConflict = onConflict
    capturedSave = vi.fn()
    // flush() now returns Promise<void> — mock must match
    capturedFlush = vi.fn().mockResolvedValue(undefined)
    return { save: capturedSave, flush: capturedFlush }
  },
}))

const mockTransitionMutate = vi.fn()
vi.mock('@/hooks/useWorkflows', () => ({
  useTransitionWorkflow: () => ({ mutate: mockTransitionMutate, isPending: false }),
  workflowKeys: {
    all: ['workflows'] as const,
    detail: (id: string) => ['workflows', id] as const,
    audit: (id: string) => ['workflows', id, 'audit'] as const,
  },
}))

const mockToast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

const mockInvalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return { ...actual, useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }) }
})

// Stub step form components to keep tests simple and fast
vi.mock('@/components/Workflow/Step1OrganizationProfile', () => ({
  Step1Form: ({ readOnly }: { workflowId: string; readOnly: boolean }) => (
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
  beforeEach(() => {
    vi.clearAllMocks()
    capturedOnConflict = undefined
  })

  it('renders step 1 content by default', () => {
    render(<WorkflowWizard workflow={MOCK_WF} etag='W/"1"' />)
    expect(screen.getByTestId('step1')).toBeInTheDocument()
    expect(screen.queryByTestId('step2')).not.toBeInTheDocument()
  })

  it('navigates to step 2 when Next is clicked', async () => {
    const user = userEvent.setup()
    render(<WorkflowWizard workflow={MOCK_WF} etag='W/"1"' />)
    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByTestId('step2')).toBeInTheDocument()
  })

  it('Previous button is disabled on step 1', () => {
    render(<WorkflowWizard workflow={MOCK_WF} etag='W/"1"' />)
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
  })

  it('shows "Submit Workflow" button on last step (step 4)', () => {
    const wf: Workflow = { ...MOCK_WF, currentStep: 4 }
    render(<WorkflowWizard workflow={wf} etag='W/"1"' />)
    expect(screen.getByRole('button', { name: /submit workflow/i })).toBeInTheDocument()
  })

  it('Submit Workflow button is disabled for read-only (submitted) workflows', () => {
    const wf: Workflow = { ...MOCK_WF, status: 'submitted', currentStep: 4 }
    render(<WorkflowWizard workflow={wf} etag='W/"3"' />)
    expect(screen.getByRole('button', { name: /submit workflow/i })).toBeDisabled()
  })

  it('passes readOnly=true to step forms for submitted workflows', () => {
    const wf: Workflow = { ...MOCK_WF, status: 'submitted' }
    render(<WorkflowWizard workflow={wf} etag='W/"3"' />)
    expect(screen.getByTestId('step1')).toHaveAttribute('data-readonly', 'true')
  })

  it('passes readOnly=false to step forms for draft workflows', () => {
    render(<WorkflowWizard workflow={MOCK_WF} etag='W/"1"' />)
    expect(screen.getByTestId('step1')).toHaveAttribute('data-readonly', 'false')
  })

  it('onConflict shows destructive toast and invalidates workflow + audit queries', () => {
    render(<WorkflowWizard workflow={MOCK_WF} etag='W/"1"' />)
    expect(capturedOnConflict).toBeDefined()
    act(() => capturedOnConflict!())
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' })
    )
    expect(mockInvalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['workflows', 'wf1'] })
    )
    expect(mockInvalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['workflows', 'wf1', 'audit'] })
    )
  })

  it('awaits flush() before navigating so pending edits are not lost', async () => {
    // flush() returns a Promise — handleStepChange must await it so that form
    // edits reach the server before the step changes.
    const user = userEvent.setup()
    render(<WorkflowWizard workflow={MOCK_WF} etag='W/"1"' />)
    // Capture the spy before clicking (click re-renders and reassigns it)
    const flushBeforeClick = capturedFlush
    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(flushBeforeClick).toHaveBeenCalledTimes(1)
  })

  it('saves currentStep after flush() when navigating to next step', async () => {
    // After flushing form edits, a save({ currentStep }) must be issued so
    // the server always has the latest step even when no form fields changed.
    const user = userEvent.setup()
    render(<WorkflowWizard workflow={MOCK_WF} etag='W/"1"' />)
    const saveBeforeClick = capturedSave
    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(saveBeforeClick).toHaveBeenCalledWith({ currentStep: 2 })
  })

  it('awaits flush() before submitting so latest edits reach server first', async () => {
    // handleSubmit must await flush() before calling transition(). Without
    // await, transition can race ahead of the save, causing 412s or missing
    // edits in the submitted workflow.
    const user = userEvent.setup()
    const wf: Workflow = { ...MOCK_WF, currentStep: 4 }
    render(<WorkflowWizard workflow={wf} etag='W/"1"' />)

    // Make flush() a deferred promise so we can verify transition() hasn't
    // fired until flush resolves.
    let resolveFlush!: () => void
    const flushPromise = new Promise<void>((res) => { resolveFlush = res })
    capturedFlush.mockReturnValue(flushPromise)

    await user.click(screen.getByRole('button', { name: /submit workflow/i }))

    // While flush is pending the button must be disabled (isFlushing=true)
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled()

    // transition must NOT have been called yet — flush is still pending
    expect(mockTransitionMutate).not.toHaveBeenCalled()

    // Resolve flush — transition should now fire
    await act(async () => { resolveFlush() })
    expect(mockTransitionMutate).toHaveBeenCalledTimes(1)
  })

  it('Next button is disabled while flush is in-progress (isFlushing)', async () => {
    render(<WorkflowWizard workflow={MOCK_WF} etag='W/"1"' />)

    let resolveFlush!: () => void
    const flushPromise = new Promise<void>((res) => { resolveFlush = res })
    capturedFlush.mockReturnValue(flushPromise)

    // Fire click without awaiting — lets us inspect mid-flush state
    screen.getByRole('button', { name: /next/i }).click()

    // Give React a tick to process the click and set isFlushing=true
    await act(async () => {})
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()

    // Resolve flush and finish
    await act(async () => { resolveFlush() })
    // After flush, navigation proceeds and the Next button is re-enabled (or replaced)
    expect(screen.getByTestId('step2')).toBeInTheDocument()
  })

  it('Previous button is disabled while flush is in-progress (isFlushing)', async () => {
    const wf: Workflow = { ...MOCK_WF, currentStep: 2 }
    render(<WorkflowWizard workflow={wf} etag='W/"1"' />)

    let resolveFlush!: () => void
    const flushPromise = new Promise<void>((res) => { resolveFlush = res })
    capturedFlush.mockReturnValue(flushPromise)

    screen.getByRole('button', { name: /previous/i }).click()

    await act(async () => {})
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()

    await act(async () => { resolveFlush() })
    expect(screen.getByTestId('step1')).toBeInTheDocument()
  })

  it('shows save-failed toast and does not navigate when flush() rejects on step change', async () => {
    const user = userEvent.setup()
    render(<WorkflowWizard workflow={MOCK_WF} etag='W/"1"' />)

    capturedFlush.mockRejectedValue(new Error('Network error'))

    await user.click(screen.getByRole('button', { name: /next/i }))

    // Still on step 1 — navigation must be aborted
    expect(screen.getByTestId('step1')).toBeInTheDocument()
    expect(screen.queryByTestId('step2')).not.toBeInTheDocument()

    // Destructive toast must be shown
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Save failed' })
    )
  })

  it('shows save-failed toast and does not submit when flush() rejects on submit', async () => {
    const user = userEvent.setup()
    const wf: Workflow = { ...MOCK_WF, currentStep: 4 }
    render(<WorkflowWizard workflow={wf} etag='W/"1"' />)

    capturedFlush.mockRejectedValue(new Error('Network error'))

    await user.click(screen.getByRole('button', { name: /submit workflow/i }))

    // transition must NOT have been called
    expect(mockTransitionMutate).not.toHaveBeenCalled()

    // Destructive toast must be shown
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Save failed' })
    )
  })
})
