// ─── Step data ───────────────────────────────────────────────────────────────

export interface DataPoint {
  id: string
  name: string
  value: number
  unit: string
  source: string
  notes?: string
}

export interface Correction {
  id: string
  dataPointId: string
  originalValue: number
  correctedValue: number
  reason: string
}

export interface Step1Data {
  organizationName: string
  contactName: string
  contactEmail: string
  reportingPeriod: string
  description?: string
}

export interface Step2Data {
  dataPoints: DataPoint[]
}

export interface Step3Data {
  corrections: Correction[]
  reviewNotes?: string
}

export interface Step4Data {
  reviewerNotes?: string
  confirmAccuracy: boolean
  submitterName: string
}

// ─── Status ───────────────────────────────────────────────────────────────────

export type WorkflowStatus = 'draft' | 'in_progress' | 'submitted' | 'completed' | 'failed'

export interface StatusHistoryEntry {
  from: WorkflowStatus | null
  to: WorkflowStatus
  timestamp: string
  reason?: string
}

// ─── Workflow entity ──────────────────────────────────────────────────────────

export interface Workflow {
  id: string
  organizationId: string
  title: string
  description: string
  status: WorkflowStatus
  currentStep: number
  step1Data: Step1Data | null
  step2Data: Step2Data | null
  step3Data: Step3Data | null
  step4Data: Step4Data | null
  version: number
  statusHistory: StatusHistoryEntry[]
  createdAt: string
  updatedAt: string
  createdBy: string
}

// ─── API input types ──────────────────────────────────────────────────────────

export interface CreateWorkflowInput {
  title: string
  description?: string
}

export interface UpdateWorkflowInput {
  title?: string
  description?: string
  currentStep?: number
  step1Data?: Step1Data
  step2Data?: Step2Data
  step3Data?: Step3Data
  step4Data?: Step4Data
}

export interface TransitionWorkflowInput {
  status: WorkflowStatus
  reason?: string
}

// ─── Audit ────────────────────────────────────────────────────────────────────

/**
 * Audit entry as returned by the server.
 * Admins receive correlationId and actorId; reviewers receive a redacted
 * view where those fields are absent. Both shapes satisfy this interface
 * because the sensitive fields are optional here — the server enforces what
 * is actually populated per role.
 */
export interface AuditEntry {
  /** Only present for admin callers */
  correlationId?: string
  workflowId: string
  timestamp: string
  /** Only present for admin callers */
  actorId?: string
  actorRole: 'admin' | 'reviewer'
  /** null for the initial creation entry (no prior state) */
  oldState: WorkflowStatus | null
  newState: WorkflowStatus
  reason?: string
}
