import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/services/api'
import type { Workflow, AuditEntry, CreateWorkflowInput, UpdateWorkflowInput, TransitionWorkflowInput } from '@/types/workflow'

// ─── Query keys ───────────────────────────────────────────────────────────────

export const workflowKeys = {
  all: ['workflows'] as const,
  detail: (id: string) => ['workflows', id] as const,
  audit: (id: string) => ['workflows', id, 'audit'] as const,
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useWorkflows() {
  return useQuery<Workflow[]>({
    queryKey: workflowKeys.all,
    queryFn: () => apiFetch<Workflow[]>('/workflows'),
  })
}

export function useWorkflow(id: string) {
  return useQuery<Workflow>({
    queryKey: workflowKeys.detail(id),
    queryFn: () => apiFetch<Workflow>(`/workflows/${id}`),
    enabled: !!id,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateWorkflow() {
  const qc = useQueryClient()
  return useMutation<Workflow, Error, CreateWorkflowInput>({
    mutationFn: (input) =>
      apiFetch<Workflow>('/workflows', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workflowKeys.all })
    },
  })
}

export interface UpdateWorkflowArgs {
  id: string
  input: UpdateWorkflowInput
  etag?: string
}

export function useUpdateWorkflow() {
  const qc = useQueryClient()
  return useMutation<Workflow, Error, UpdateWorkflowArgs>({
    mutationFn: ({ id, input, etag }) =>
      apiFetch<Workflow>(`/workflows/${id}`, { method: 'PATCH', body: input, etag }),
    onSuccess: (updated) => {
      qc.setQueryData(workflowKeys.detail(updated.id), updated)
      qc.invalidateQueries({ queryKey: workflowKeys.all })
    },
  })
}

export interface TransitionWorkflowArgs {
  id: string
  input: TransitionWorkflowInput
  etag?: string
}

export function useTransitionWorkflow() {
  const qc = useQueryClient()
  return useMutation<Workflow, Error, TransitionWorkflowArgs>({
    mutationFn: ({ id, input, etag }) =>
      apiFetch<Workflow>(`/workflows/${id}/transition`, { method: 'POST', body: input, etag }),
    onSuccess: (updated) => {
      qc.setQueryData(workflowKeys.detail(updated.id), updated)
      qc.invalidateQueries({ queryKey: workflowKeys.all })
      // Invalidate audit log so it refreshes after each transition
      qc.invalidateQueries({ queryKey: workflowKeys.audit(updated.id) })
    },
  })
}

export function useAuditLog(workflowId: string) {
  return useQuery<AuditEntry[]>({
    queryKey: workflowKeys.audit(workflowId),
    queryFn: () => apiFetch<AuditEntry[]>(`/workflows/${workflowId}/audit`),
    enabled: !!workflowId,
  })
}
