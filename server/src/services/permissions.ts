import { type WorkflowStatus } from '@/types/workflow.js'
import { ForbiddenError } from '@/errors.js'

/**
 * Role-action matrix for workflow transitions.
 *
 * reviewer — may advance work through the normal path:
 *   draft → in_progress → submitted
 *
 * admin — superset of reviewer; additionally controls final disposition
 * and the recovery path:
 *   submitted → completed
 *   submitted → failed
 *   failed    → draft
 */
const REVIEWER_TRANSITIONS = new Set<string>([
  'draft→in_progress',
  'in_progress→submitted',
])

const ADMIN_TRANSITIONS = new Set<string>([
  ...REVIEWER_TRANSITIONS,
  'submitted→completed',
  'submitted→failed',
  'failed→draft',
])

/**
 * Assert that the caller's role is permitted to perform the given transition.
 * Throws ForbiddenError (403) if not allowed.
 *
 * Note: this check is intentionally separate from state-machine validity
 * (validateTransition). Both must pass: the transition must be structurally
 * valid AND the actor must have the required role.
 */
export function assertTransitionPermission(
  role: 'admin' | 'reviewer',
  from: WorkflowStatus,
  to: WorkflowStatus
): void {
  const key = `${from}→${to}`
  const allowed = role === 'admin' ? ADMIN_TRANSITIONS : REVIEWER_TRANSITIONS
  if (!allowed.has(key)) {
    throw new ForbiddenError(
      `Role '${role}' is not permitted to transition from '${from}' to '${to}'`
    )
  }
}
