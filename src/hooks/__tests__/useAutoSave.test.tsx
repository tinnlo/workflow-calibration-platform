import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAutoSave } from '@/hooks/useAutoSave'

// Mock useUpdateWorkflow so useAutoSave doesn't need QueryClientProvider
const mockMutate = vi.fn()

vi.mock('@/hooks/useWorkflows', () => ({
  useUpdateWorkflow: () => ({ mutate: mockMutate }),
  workflowKeys: {
    all: ['workflows'] as const,
    detail: (id: string) => ['workflows', id] as const,
  },
}))

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not call mutate immediately after save()', () => {
    const { result } = renderHook(() =>
      useAutoSave({ workflowId: 'wf1', etag: 'W/"1"' })
    )
    act(() => result.current.save({ title: 'Draft' }))
    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('calls mutate after the debounce delay (1500ms)', () => {
    const { result } = renderHook(() =>
      useAutoSave({ workflowId: 'wf1', etag: 'W/"1"' })
    )
    act(() => result.current.save({ title: 'Debounced' }))
    act(() => vi.advanceTimersByTime(1600))
    expect(mockMutate).toHaveBeenCalledWith({
      id: 'wf1',
      input: { title: 'Debounced' },
      etag: 'W/"1"',
    })
  })

  it('only fires once for rapid consecutive saves (debounce reset)', () => {
    const { result } = renderHook(() =>
      useAutoSave({ workflowId: 'wf1', etag: 'W/"1"' })
    )
    act(() => {
      result.current.save({ title: 'First' })
      result.current.save({ title: 'Second' })
      result.current.save({ title: 'Third' })
    })
    act(() => vi.advanceTimersByTime(1600))
    expect(mockMutate).toHaveBeenCalledTimes(1)
    expect(mockMutate).toHaveBeenCalledWith({
      id: 'wf1',
      input: { title: 'Third' },
      etag: 'W/"1"',
    })
  })

  it('flush() fires pending save immediately without waiting', () => {
    const { result } = renderHook(() =>
      useAutoSave({ workflowId: 'wf1', etag: 'W/"1"' })
    )
    act(() => result.current.save({ title: 'Flush Me' }))
    act(() => result.current.flush())
    expect(mockMutate).toHaveBeenCalledWith({
      id: 'wf1',
      input: { title: 'Flush Me' },
      etag: 'W/"1"',
    })
  })

  it('does not call mutate when enabled is false', () => {
    const { result } = renderHook(() =>
      useAutoSave({ workflowId: 'wf1', etag: 'W/"1"', enabled: false })
    )
    act(() => result.current.save({ title: 'Disabled' }))
    act(() => vi.advanceTimersByTime(1600))
    expect(mockMutate).not.toHaveBeenCalled()
  })
})
