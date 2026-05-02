import { type AuditEntry } from '@/types/workflow.js'

/**
 * Append-only in-memory audit log.
 *
 * Entries are keyed by workflowId and ordered by insertion time (which
 * matches transition order). Entries are deep-cloned and frozen on write so
 * that no in-process code can mutate past records. Callers receive a fresh
 * array of frozen DTOs on read.
 */
const log = new Map<string, Readonly<AuditEntry>[]>()

export function appendAuditEntry(entry: AuditEntry): void {
  const frozen = Object.freeze(structuredClone(entry)) as Readonly<AuditEntry>
  // Build a new array (never mutate the existing one) then swap atomically so
  // the stored reference is always a consistent snapshot.
  const existing = log.get(entry.workflowId) ?? []
  log.set(entry.workflowId, [...existing, frozen])
}

/**
 * Return the ordered audit history for a workflow.
 * Returns an empty array if no entries exist (e.g. seeded workflows that
 * have not yet been transitioned via the API).
 * Each returned entry is a frozen clone — safe for the caller to spread
 * or serialise but not to mutate.
 */
export function getAuditLog(workflowId: string): Readonly<AuditEntry>[] {
  return (log.get(workflowId) ?? []).map((e) => Object.freeze({ ...e }))
}

/** Reset all audit state — only used in test teardown. */
export function reset(): void {
  log.clear()
}

/**
 * Restore the audit log for a specific workflow to a prior snapshot.
 * Used only for transactional rollback in store.ts — not exposed as API.
 *
 * IMPORTANT: This is safe only because the in-memory store processes requests
 * synchronously within a single Node.js event-loop tick. If this ever moves to
 * an async/persistent backend, this pattern must be replaced with a proper
 * two-phase commit or saga, since concurrent requests could append newer audit
 * entries between the snapshot and the rollback, and those entries would be
 * silently erased.
 */
export function restoreAuditLog(workflowId: string, snapshot: Readonly<AuditEntry>[]): void {
  log.set(workflowId, snapshot)
}
