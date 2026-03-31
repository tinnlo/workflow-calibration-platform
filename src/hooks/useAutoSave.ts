import { useRef, useEffect, useCallback } from 'react'
import { useUpdateWorkflow } from '@/hooks/useWorkflows'
import type { UpdateWorkflowInput } from '@/types/workflow'

const DEBOUNCE_MS = 1500

interface UseAutoSaveOptions {
  workflowId: string
  etag: string | undefined
  enabled?: boolean
}

/**
 * Debounced auto-save hook.
 *
 * Usage:
 *   const save = useAutoSave({ workflowId: id, etag })
 *   // call save(data) any time form values change
 *
 * Flushes pending saves on beforeunload and visibilitychange.
 */
export function useAutoSave({ workflowId, etag, enabled = true }: UseAutoSaveOptions) {
  const { mutate } = useUpdateWorkflow()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<UpdateWorkflowInput | null>(null)

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (pendingRef.current && enabled) {
      mutate({ id: workflowId, input: pendingRef.current, etag })
      pendingRef.current = null
    }
  }, [workflowId, etag, enabled, mutate])

  // Flush on page hide / unload
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const save = useCallback(
    (data: UpdateWorkflowInput) => {
      if (!enabled) return
      pendingRef.current = data

      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        if (pendingRef.current) {
          mutate({ id: workflowId, input: pendingRef.current, etag })
          pendingRef.current = null
        }
        timerRef.current = null
      }, DEBOUNCE_MS)
    },
    [workflowId, etag, enabled, mutate]
  )

  return { save, flush }
}
