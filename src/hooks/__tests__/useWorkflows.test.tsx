import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useWorkflows, useCreateWorkflow, useUpdateWorkflow, useTransitionWorkflow } from '@/hooks/useWorkflows'
import { apiFetch } from '@/services/api'

vi.mock('@/services/api', () => ({ apiFetch: vi.fn() }))

const mockApiFetch = vi.mocked(apiFetch)

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

const MOCK_WF = {
  id: 'wf1',
  organizationId: 'org1',
  title: 'Test Workflow',
  status: 'draft',
  version: 1,
}

describe('useWorkflows', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches and returns workflow list', async () => {
    mockApiFetch.mockResolvedValue([MOCK_WF])
    const { result } = renderHook(() => useWorkflows(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([MOCK_WF])
    expect(mockApiFetch).toHaveBeenCalledWith('/workflows')
  })

  it('reports error when fetch fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useWorkflows(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Network error')
  })
})

describe('useCreateWorkflow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls POST /workflows with input', async () => {
    mockApiFetch.mockResolvedValue(MOCK_WF)
    const { result } = renderHook(() => useCreateWorkflow(), { wrapper: makeWrapper() })
    result.current.mutate({ title: 'New WF', description: '' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApiFetch).toHaveBeenCalledWith('/workflows', {
      method: 'POST',
      body: { title: 'New WF', description: '' },
    })
  })
})

describe('useUpdateWorkflow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls PATCH with id, body, and etag', async () => {
    const updated = { ...MOCK_WF, version: 2, title: 'Updated' }
    mockApiFetch.mockResolvedValue(updated)
    const { result } = renderHook(() => useUpdateWorkflow(), { wrapper: makeWrapper() })
    result.current.mutate({ id: 'wf1', input: { title: 'Updated' }, etag: 'W/"1"' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApiFetch).toHaveBeenCalledWith('/workflows/wf1', {
      method: 'PATCH',
      body: { title: 'Updated' },
      etag: 'W/"1"',
    })
  })
})

describe('useTransitionWorkflow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls POST /workflows/:id/transition', async () => {
    const updated = { ...MOCK_WF, status: 'in_progress', version: 2 }
    mockApiFetch.mockResolvedValue(updated)
    const { result } = renderHook(() => useTransitionWorkflow(), { wrapper: makeWrapper() })
    result.current.mutate({ id: 'wf1', input: { status: 'in_progress' }, etag: 'W/"1"' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApiFetch).toHaveBeenCalledWith('/workflows/wf1/transition', {
      method: 'POST',
      body: { status: 'in_progress' },
      etag: 'W/"1"',
    })
  })
})
