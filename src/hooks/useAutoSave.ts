import { useRef, useEffect, useCallback } from 'react'
import { useUpdateWorkflow } from '@/hooks/useWorkflows'
import type { Workflow, UpdateWorkflowInput } from '@/types/workflow'

const DEBOUNCE_MS = 1500

interface UseAutoSaveOptions {
  workflowId: string
  etag: string | undefined
  enabled?: boolean
  /**
   * Called when the server returns 412 Precondition Failed, meaning another
   * actor updated the workflow before this autosave landed. The pending save
   * is cancelled and the caller should prompt the user to reload and re-apply
   * their changes.
   *
   * Omitting this callback is a programming error: a console.warn is emitted
   * in development so the omission is visible during testing.
   */
  onConflict?: () => void
}

/** Pending save: data + the ETag that was current when the user made the edit. */
interface PendingSave {
  input: UpdateWorkflowInput
  /**
   * ETag captured at save() call time — sent as If-Match so the server can
   * detect if another actor has since updated the record.
   */
  etag: string | undefined
}

/**
 * Debounced auto-save hook.
 *
 * Usage:
 *   const { save, flush } = useAutoSave({ workflowId: id, etag, onConflict })
 *   // call save(data) any time form values change
 *   // await flush() before navigation or submit to ensure data is persisted
 *
 * Flushes pending saves on beforeunload and visibilitychange.
 *
 * ETag / concurrency contract:
 *   - The etag is captured at save() call time.
 *   - Saves are serialised: the debounce timer is blocked while a save is
 *     in-flight (inFlightRef). When it settles the queued edit is re-armed
 *     with a fresh ETag from the result — no parent-rerender race.
 *   - Cross-workflow safety: all refs are cleared when workflowId changes.
 *     In-flight callbacks check workflowIdRef before acting so stale W1
 *     responses cannot corrupt a newly-loaded W2.
 *   - On non-412 error the debounce is re-armed so the queued edit is retried.
 *   - On 412 the queue is dropped and onConflict() notifies the user.
 *
 * flush() returns a Promise<void> that resolves when:
 *   - The in-flight save (whether started by debounce or flush) has settled, OR
 *   - There was nothing pending (resolves immediately).
 * On 412 it calls onConflict() and resolves.
 * On other errors it rejects — callers should catch and surface to the user.
 */
export function useAutoSave({ workflowId, etag, enabled = true, onConflict }: UseAutoSaveOptions) {
  const { mutateAsync } = useUpdateWorkflow()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<PendingSave | null>(null)
  /** True while a mutateAsync() call is in-flight; blocks the debounce from firing. */
  const inFlightRef = useRef(false)
  /**
   * Promise for any currently-in-flight startFire() call, regardless of whether
   * it was started by the debounce timer or by flush(). flush() joins this
   * promise instead of starting a second concurrent request.
   */
  const inFlightPromiseRef = useRef<Promise<void> | null>(null)
  /**
   * Tracks the workflowId that was active when startFire() was called. Async
   * callbacks check this before acting so that a slow W1 response cannot
   * mutate state that now belongs to W2.
   */
  const workflowIdRef = useRef(workflowId)

  // ─── Stable refs for mutable values ────────────────────────────────────────
  // Kept in refs so startFire / armDebounce never need to be recreated when
  // these values change, avoiding the circular-dep / forward-ref problem.

  const onConflictRef = useRef(onConflict)
  useEffect(() => { onConflictRef.current = onConflict }, [onConflict])

  const mutateAsyncRef = useRef(mutateAsync)
  useEffect(() => { mutateAsyncRef.current = mutateAsync }, [mutateAsync])

  // ─── Stable function refs (break the circular dependency) ──────────────────
  // startFire calls armDebounce and vice-versa. Instead of forward declarations
  // or lint suppressions, each function is stored in a ref and the other reads
  // from that ref. Both refs are populated before any call can occur.
  const startFireRef = useRef<((payload: PendingSave) => Promise<void>) | null>(null)
  const armDebounceRef = useRef<(() => void) | null>(null)

  // ─── workflowId change — cancel all in-flight state ────────────────────────
  useEffect(() => {
    if (workflowIdRef.current === workflowId) return
    workflowIdRef.current = workflowId
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    pendingRef.current = null
    inFlightRef.current = false
    inFlightPromiseRef.current = null
  }, [workflowId])

  // ─── handleConflict ────────────────────────────────────────────────────────
  const handleConflict = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    pendingRef.current = null
    inFlightRef.current = false
    inFlightPromiseRef.current = null
    if (onConflictRef.current) {
      onConflictRef.current()
    } else if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[useAutoSave] 412 Precondition Failed: workflow was updated by another actor. ' +
        'Provide an onConflict callback to surface this to the user.'
      )
    }
  }, [])

  // ─── startFire ─────────────────────────────────────────────────────────────
  /**
   * Core execution path. Fires mutateAsync() for the given payload.
   *
   * - Sets inFlightPromiseRef immediately so flush() can join it even when
   *   the call was started by the debounce timer.
   * - Clears inFlightPromiseRef in finally so stale refs don't linger.
   * - On success: updates pendingRef.etag and re-arms debounce if needed.
   * - On 412: calls handleConflict() — resolves (conflict surfaced via callback).
   * - On non-412 error: re-arms debounce for retry, then rejects.
   * - Cross-workflow: bails silently if workflowId changed mid-flight.
   *
   * Uses armDebounceRef to call armDebounce without a forward reference.
   */
  const startFire = useCallback((payload: PendingSave): Promise<void> => {
    const firedForWorkflow = workflowIdRef.current
    inFlightRef.current = true

    const p = (async () => {
      try {
        const updated: Workflow = await mutateAsyncRef.current({
          id: firedForWorkflow,
          input: payload.input,
          etag: payload.etag,
        })
        if (workflowIdRef.current !== firedForWorkflow) return
        inFlightRef.current = false
        if (pendingRef.current) {
          pendingRef.current = { ...pendingRef.current, etag: `W/"${updated.version}"` }
          armDebounceRef.current?.()
        }
      } catch (err: unknown) {
        if (workflowIdRef.current !== firedForWorkflow) return
        const status = (err as { status?: number })?.status
        if (status === 412) {
          handleConflict()
        } else {
          inFlightRef.current = false
          if (pendingRef.current) {
            armDebounceRef.current?.()
          }
          throw err
        }
      } finally {
        if (inFlightPromiseRef.current === p) {
          inFlightPromiseRef.current = null
        }
      }
    })()

    inFlightPromiseRef.current = p
    return p
  }, [handleConflict])

  // Store in ref so armDebounce can call it without being in its dep array.
  useEffect(() => { startFireRef.current = startFire }, [startFire])

  // ─── armDebounce ──────────────────────────────────────────────────────────
  /**
   * Arms (or re-arms) the debounce timer. When it fires, calls startFire()
   * via startFireRef so there is no forward-reference or circular dep.
   * Errors are swallowed — fire-and-forget path; use flush() for awaitable errors.
   */
  const armDebounce = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      if (pendingRef.current && !inFlightRef.current) {
        const payload = pendingRef.current
        pendingRef.current = null
        startFireRef.current?.(payload).catch(() => {})
      }
    }, DEBOUNCE_MS)
  }, []) // no deps — reads everything through stable refs

  // Store in ref so startFire can call it without being in its dep array.
  useEffect(() => { armDebounceRef.current = armDebounce }, [armDebounce])

  // ─── flush ────────────────────────────────────────────────────────────────
  /**
   * Immediately fires any pending save, cancelling the debounce timer, and
   * returns a Promise<void> that resolves when the save settles.
   *
   * - Joins any in-flight save already started by the debounce timer.
   * - Resolves immediately when nothing is pending and nothing is in-flight.
   * - On 412: resolves (conflict surfaced via onConflict callback).
   * - On non-412 error: rejects — callers must catch and surface to the user.
   */
  const flush = useCallback((): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (pendingRef.current && enabled && !inFlightRef.current) {
      const payload = pendingRef.current
      pendingRef.current = null
      return startFire(payload)
    }
    if (inFlightRef.current && inFlightPromiseRef.current) {
      return inFlightPromiseRef.current
    }
    return Promise.resolve()
  }, [enabled, startFire])

  // ─── page-hide / unload flush ─────────────────────────────────────────────
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    const onBeforeUnload = () => flush()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [flush])

  // ─── cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // ─── save ─────────────────────────────────────────────────────────────────
  const save = useCallback(
    (data: UpdateWorkflowInput) => {
      if (!enabled) return
      pendingRef.current = { input: data, etag }
      if (inFlightRef.current) return
      armDebounce()
    },
    [etag, enabled, armDebounce] // workflowId intentionally omitted — read via workflowIdRef in startFire
  )

  return { save, flush }
}
