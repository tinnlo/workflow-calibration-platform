import { type WorkflowStatus } from '@/types/workflow.js'
import { UnprocessableEntityError } from '@/errors.js'

/**
 * Valid transitions:
 *   draft        → in_progress
 *   in_progress  → submitted
 *   submitted    → completed
 *   submitted    → failed   (rejection path)
 *   failed       → draft    (retry path)
 *
 * `completed` is terminal — no transitions out.
 */
const ALLOWED: Record<WorkflowStatus, WorkflowStatus[]> = {
  draft: ['in_progress'],
  in_progress: ['submitted'],
  submitted: ['completed', 'failed'],
  completed: [],
  failed: ['draft'],
}

/**
 * Validate a status transition.
 * Throws UnprocessableEntityError (422) if the transition is not allowed.
 */
export function validateTransition(from: WorkflowStatus, to: WorkflowStatus): void {
  const allowed = ALLOWED[from]
  if (!allowed.includes(to)) {
    throw new UnprocessableEntityError(
      `Transition from '${from}' to '${to}' is not allowed. ` +
        `Valid transitions from '${from}': [${allowed.join(', ') || 'none'}]`
    )
  }
}
