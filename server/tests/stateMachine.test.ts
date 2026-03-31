import { describe, it, expect } from 'vitest'
import { validateTransition } from '../src/services/stateMachine.js'
import { UnprocessableEntityError } from '../src/errors.js'
import type { WorkflowStatus } from '../src/types/workflow.js'

describe('stateMachine.validateTransition', () => {
  // ── Valid transitions ──────────────────────────────────────────────────────
  it('allows draft → in_progress', () => {
    expect(() => validateTransition('draft', 'in_progress')).not.toThrow()
  })

  it('allows in_progress → submitted', () => {
    expect(() => validateTransition('in_progress', 'submitted')).not.toThrow()
  })

  it('allows submitted → completed', () => {
    expect(() => validateTransition('submitted', 'completed')).not.toThrow()
  })

  it('allows submitted → failed', () => {
    expect(() => validateTransition('submitted', 'failed')).not.toThrow()
  })

  it('allows failed → draft (retry)', () => {
    expect(() => validateTransition('failed', 'draft')).not.toThrow()
  })

  // ── Invalid transitions ────────────────────────────────────────────────────
  it('rejects draft → submitted (skip)', () => {
    expect(() => validateTransition('draft', 'submitted')).toThrow(UnprocessableEntityError)
  })

  it('rejects draft → completed (skip)', () => {
    expect(() => validateTransition('draft', 'completed')).toThrow(UnprocessableEntityError)
  })

  it('rejects completed → anything (terminal)', () => {
    const destinations: WorkflowStatus[] = ['draft', 'in_progress', 'submitted', 'failed']
    for (const to of destinations) {
      expect(() => validateTransition('completed', to)).toThrow(UnprocessableEntityError)
    }
  })

  it('rejects in_progress → draft (backwards)', () => {
    expect(() => validateTransition('in_progress', 'draft')).toThrow(UnprocessableEntityError)
  })

  it('rejects failed → completed (skip retry step)', () => {
    expect(() => validateTransition('failed', 'completed')).toThrow(UnprocessableEntityError)
  })

  // ── Error message contains both states ────────────────────────────────────
  it('error message names both from and to states', () => {
    try {
      validateTransition('draft', 'completed')
    } catch (err) {
      expect((err as UnprocessableEntityError).message).toContain('draft')
      expect((err as UnprocessableEntityError).message).toContain('completed')
    }
  })
})
