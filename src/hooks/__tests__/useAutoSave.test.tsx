import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAutoSave } from '@/hooks/useAutoSave'

// Mock useUpdateWorkflow so useAutoSave doesn't need QueryClientProvider.
// mutateAsync returns a Promise — tests control resolution via deferred helpers.
const mockMutateAsync = vi.fn()

vi.mock('@/hooks/useWorkflows', () => ({
  useUpdateWorkflow: () => ({ mutateAsync: mockMutateAsync }),
  workflowKeys: {
    all: ['workflows'] as const,
    detail: (id: string) => ['workflows', id] as const,
  },
}))

// ─── Deferred promise helper ──────────────────────────────────────────────────
// Lets tests control exactly when a mutateAsync call resolves or rejects.
interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  let reject!: (r: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

// Default mock: immediately resolves with version 1
const DEFAULT_RESULT = { id: 'wf1', version: 1 }

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockMutateAsync.mockResolvedValue(DEFAULT_RESULT)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not call mutateAsync immediately after save()', () => {
    const { result } = renderHook(() =>
      useAutoSave({ workflowId: 'wf1', etag: 'W/"1"' })
    )
    act(() => result.current.save({ title: 'Draft' }))
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('calls mutateAsync after the debounce delay (1500ms)', async () => {
    const { result } = renderHook(() =>
      useAutoSave({ workflowId: 'wf1', etag: 'W/"1"' })
    )
    act(() => result.current.save({ title: 'Debounced' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(1600) })
    expect(mockMutateAsync).toHaveBeenCalledWith(
      { id: 'wf1', input: { title: 'Debounced' }, etag: 'W/"1"' }
    )
  })

  it('only fires once for rapid consecutive saves (debounce reset)', async () => {
    const { result } = renderHook(() =>
      useAutoSave({ workflowId: 'wf1', etag: 'W/"1"' })
    )
    act(() => {
      result.current.save({ title: 'First' })
      result.current.save({ title: 'Second' })
      result.current.save({ title: 'Third' })
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(1600) })
    expect(mockMutateAsync).toHaveBeenCalledTimes(1)
    expect(mockMutateAsync).toHaveBeenCalledWith(
      { id: 'wf1', input: { title: 'Third' }, etag: 'W/"1"' }
    )
  })

  it('flush() fires pending save immediately without waiting for debounce', async () => {
    const { result } = renderHook(() =>
      useAutoSave({ workflowId: 'wf1', etag: 'W/"1"' })
    )
    act(() => result.current.save({ title: 'Flush Me' }))
    await act(async () => { await result.current.flush() })
    expect(mockMutateAsync).toHaveBeenCalledWith(
      { id: 'wf1', input: { title: 'Flush Me' }, etag: 'W/"1"' }
    )
  })

  it('flush() returns a Promise that resolves after the save completes', async () => {
    const d = deferred<typeof DEFAULT_RESULT>()
    mockMutateAsync.mockReturnValue(d.promise)

    const { result } = renderHook(() =>
      useAutoSave({ workflowId: 'wf1', etag: 'W/"1"' })
    )
    act(() => result.current.save({ title: 'Awaitable' }))

    let settled = false
    const flushPromise = result.current.flush().then(() => { settled = true })

    // Not yet settled — mutateAsync still pending
    expect(settled).toBe(false)

    // Resolve the save
    await act(async () => {
      d.resolve(DEFAULT_RESULT)
      await flushPromise
    })

    expect(settled).toBe(true)
    expect(mockMutateAsync).toHaveBeenCalledTimes(1)
  })

  it('flush() resolves immediately when nothing is pending', async () => {
    const { result } = renderHook(() =>
      useAutoSave({ workflowId: 'wf1', etag: 'W/"1"' })
    )
    // No save() called — flush should resolve right away
    await act(async () => { await result.current.flush() })
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('flush() joins a save already started by the debounce timer (HIGH fix)', async () => {
    // This tests the HIGH race: debounce fires first, then flush() is called
    // while the save is in-flight. flush() must join the in-flight promise and
    // NOT resolve before the save completes.
    const dA = deferred<{ id: string; version: number }>()
    mockMutateAsync.mockReturnValueOnce(dA.promise)

    const { result } = renderHook(() =>
      useAutoSave({ workflowId: 'wf1', etag: 'W/"1"' })
    )

    // save() queues an edit and arms the debounce
    act(() => result.current.save({ title: 'Debounce first' }))

    // Advance time so the debounce fires and starts the in-flight save
    await act(async () => { await vi.advanceTimersByTimeAsync(1600) })
    expect(mockMutateAsync).toHaveBeenCalledTimes(1)

    // Now call flush() while the save is already in-flight.
    // Capture the raw promise (outside act) so we can inspect its settled state.
    const flushP = result.current.flush()
    let flushSettled = false
    flushP.then(() => { flushSettled = true }, () => { flushSettled = true })

    // Yield to the microtask queue — flush must NOT have settled yet
    await Promise.resolve()
    expect(flushSettled).toBe(false)

    // Resolve the in-flight save — flush should now settle
    await act(async () => {
      dA.resolve({ id: 'wf1', version: 2 })
      await flushP
    })

    expect(flushSettled).toBe(true)
    expect(mockMutateAsync).toHaveBeenCalledTimes(1)
  })

  it('does not call mutateAsync when enabled is false', async () => {
    const { result } = renderHook(() =>
      useAutoSave({ workflowId: 'wf1', etag: 'W/"1"', enabled: false })
    )
    act(() => result.current.save({ title: 'Disabled' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(1600) })
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('sends save with the etag captured at save() call time, not the etag at fire time', async () => {
    let etag = 'W/"1"'
    const { result, rerender } = renderHook(() =>
      useAutoSave({ workflowId: 'wf1', etag })
    )
    act(() => result.current.save({ title: 'Pending edit' }))

    // External update bumps the etag prop before debounce fires
    etag = 'W/"2"'
    rerender()

    await act(async () => { await vi.advanceTimersByTimeAsync(1600) })
    // Must send W/"1" (captured at call time), not W/"2" (fire-time value)
    expect(mockMutateAsync).toHaveBeenCalledWith(
      { id: 'wf1', input: { title: 'Pending edit' }, etag: 'W/"1"' }
    )
  })

  it('holds edit B while A is in-flight, then fires B with correct ETag after A succeeds', async () => {
    const dA = deferred<{ id: string; version: number }>()
    let callCount = 0
    mockMutateAsync.mockImplementation(() => {
      callCount++
      if (callCount === 1) return dA.promise
      return Promise.resolve({ id: 'wf1', version: 3 })
    })

    const { result } = renderHook(() =>
      useAutoSave({ workflowId: 'wf1', etag: 'W/"1"' })
    )

    // Save A fires after debounce
    act(() => result.current.save({ title: 'Edit A' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(1600) })
    expect(mockMutateAsync).toHaveBeenCalledTimes(1)
    expect(mockMutateAsync).toHaveBeenLastCalledWith(
      { id: 'wf1', input: { title: 'Edit A' }, etag: 'W/"1"' }
    )

    // User makes edit B while A is still in-flight — timer must NOT fire yet
    act(() => result.current.save({ title: 'Edit B' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(1600) })
    // B must NOT have fired: inFlightRef blocks it
    expect(mockMutateAsync).toHaveBeenCalledTimes(1)

    // A succeeds — onSuccess re-arms debounce for B with W/"2"
    await act(async () => { dA.resolve({ id: 'wf1', version: 2 }) })

    // Debounce fires and B is sent with the correct ETag
    await act(async () => { await vi.advanceTimersByTimeAsync(1600) })
    expect(mockMutateAsync).toHaveBeenCalledTimes(2)
    expect(mockMutateAsync).toHaveBeenLastCalledWith(
      { id: 'wf1', input: { title: 'Edit B' }, etag: 'W/"2"' }
    )
  })

  it('calls onConflict and cancels pending save when mutateAsync rejects with 412', async () => {
    const onConflict = vi.fn()
    const conflictErr = Object.assign(new Error('Conflict'), { status: 412 })
    mockMutateAsync.mockImplementation(() => {
      const p = Promise.reject(conflictErr)
      p.catch(() => {})
      return p
    })

    const { result } = renderHook(() =>
      useAutoSave({ workflowId: 'wf1', etag: 'W/"1"', onConflict })
    )
    act(() => result.current.save({ title: 'Conflict' }))
    // Use advanceTimersByTimeAsync inside act so microtasks (promise reactions)
    // are flushed alongside the timer callback.
    await act(async () => { await vi.advanceTimersByTimeAsync(1600) })

    expect(onConflict).toHaveBeenCalledTimes(1)
  })

  it('does not call onConflict for non-412 errors', async () => {
    const onConflict = vi.fn()
    const serverErr = Object.assign(new Error('Server Error'), { status: 500 })
    // Attach no-op catch so the rejected mock promise isn't flagged as unhandled
    mockMutateAsync.mockImplementation(() => {
      const p = Promise.reject(serverErr)
      p.catch(() => {})
      return p
    })

    const { result } = renderHook(() =>
      useAutoSave({ workflowId: 'wf1', etag: 'W/"1"', onConflict })
    )
    act(() => result.current.save({ title: 'Server error' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(1600) })

    expect(onConflict).not.toHaveBeenCalled()
  })

  it('discards in-flight result when workflowId changes mid-flight (no cross-workflow corruption)', async () => {
    const dW1 = deferred<{ id: string; version: number }>()
    // First call (W1 save) uses the deferred; subsequent calls resolve immediately
    mockMutateAsync
      .mockImplementationOnce(() => dW1.promise)
      .mockResolvedValue({ id: 'wf2', version: 1 })

    let workflowId = 'wf1'
    const { result, rerender } = renderHook(() =>
      useAutoSave({ workflowId, etag: 'W/"1"' })
    )

    // Fire A for wf1
    act(() => result.current.save({ title: 'W1 edit' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(1600) })
    expect(mockMutateAsync).toHaveBeenCalledTimes(1)
    expect(mockMutateAsync).toHaveBeenLastCalledWith(
      { id: 'wf1', input: { title: 'W1 edit' }, etag: 'W/"1"' }
    )

    // Navigate to wf2 while A is in-flight — clears inFlightRef and refs
    workflowId = 'wf2'
    rerender()

    // Queue an edit on wf2 (inFlightRef cleared by workflowId useEffect)
    act(() => result.current.save({ title: 'W2 edit' }))

    // W1 result arrives — must be discarded; must NOT re-arm W2's debounce
    await act(async () => { dW1.resolve({ id: 'wf1', version: 2 }) })

    // Still only 1 mutateAsync call — stale result was ignored
    expect(mockMutateAsync).toHaveBeenCalledTimes(1)

    // W2's own debounce fires after its delay
    await act(async () => { await vi.advanceTimersByTimeAsync(1600) })
    expect(mockMutateAsync).toHaveBeenCalledTimes(2)
    expect(mockMutateAsync).toHaveBeenLastCalledWith(
      { id: 'wf2', input: { title: 'W2 edit' }, etag: 'W/"1"' }
    )
  })

  it('re-arms debounce for queued edit after non-412 error (no stall)', async () => {
    const dA = deferred<{ id: string; version: number }>()
    // Attach a no-op catch to dA.promise so Vitest doesn't flag the rejection
    // as unhandled — the actual error handling is verified via mock call counts.
    dA.promise.catch(() => {})
    mockMutateAsync
      .mockImplementationOnce(() => dA.promise)
      .mockResolvedValue({ id: 'wf1', version: 2 })

    const { result } = renderHook(() =>
      useAutoSave({ workflowId: 'wf1', etag: 'W/"1"' })
    )

    // Save A fires
    act(() => result.current.save({ title: 'Edit A' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(1600) })
    expect(mockMutateAsync).toHaveBeenCalledTimes(1)

    // Save B is queued while A is in-flight
    act(() => result.current.save({ title: 'Edit B' }))

    // A fails with 500 — fire() re-throws; dA.promise has a no-op .catch() so
    // the rejection doesn't leak as unhandled to Vitest.
    const serverErr = Object.assign(new Error('Server Error'), { status: 500 })
    await act(async () => { dA.reject(serverErr) })
    // Flush microtasks so the rejection handler inside fire() completes
    await act(async () => {})

    // B should be re-armed and fire after the debounce delay
    await act(async () => { await vi.advanceTimersByTimeAsync(1600) })
    expect(mockMutateAsync).toHaveBeenCalledTimes(2)
    expect(mockMutateAsync).toHaveBeenLastCalledWith(
      { id: 'wf1', input: { title: 'Edit B' }, etag: 'W/"1"' }
    )
  })

  it('emits a console.warn when 412 occurs and onConflict is not provided', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const conflictErr = Object.assign(new Error('Conflict'), { status: 412 })
    mockMutateAsync.mockImplementation(() => {
      const p = Promise.reject(conflictErr)
      p.catch(() => {})
      return p
    })

    const { result } = renderHook(() =>
      useAutoSave({ workflowId: 'wf1', etag: 'W/"1"' /* no onConflict */ })
    )
    act(() => result.current.save({ title: 'No handler' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(1600) })

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('412'))
    warnSpy.mockRestore()
  })
})
