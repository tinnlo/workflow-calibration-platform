import { z } from 'zod'

// ─── Step schemas ─────────────────────────────────────────────────────────────

export const Step1Schema = z.object({
  organizationName: z.string().min(1).max(100),
  contactName: z.string().min(1).max(100),
  contactEmail: z.string().email().max(200),
  reportingPeriod: z.string().min(1).max(50),
  description: z.string().max(500).optional(),
})
export type Step1Data = z.infer<typeof Step1Schema>

export const DataPointSchema = z.object({
  id: z.string().max(50),
  name: z.string().min(1).max(100),
  value: z.number(),
  unit: z.string().max(50),
  source: z.string().max(200),
  notes: z.string().max(500).optional(),
})
export type DataPoint = z.infer<typeof DataPointSchema>

export const Step2Schema = z.object({
  dataPoints: z.array(DataPointSchema).max(50),
})
export type Step2Data = z.infer<typeof Step2Schema>

export const CorrectionSchema = z.object({
  id: z.string().max(50),
  dataPointId: z.string().max(50),
  originalValue: z.number(),
  correctedValue: z.number(),
  reason: z.string().min(1).max(500),
})
export type Correction = z.infer<typeof CorrectionSchema>

export const Step3Schema = z.object({
  corrections: z.array(CorrectionSchema).max(50),
  reviewNotes: z.string().max(1000).optional(),
})
export type Step3Data = z.infer<typeof Step3Schema>

export const Step4Schema = z.object({
  reviewerNotes: z.string().max(1000).optional(),
  confirmAccuracy: z.boolean(),
  submitterName: z.string().min(1).max(100),
})
export type Step4Data = z.infer<typeof Step4Schema>

// ─── Status ───────────────────────────────────────────────────────────────────

export const WorkflowStatusValues = ['draft', 'in_progress', 'submitted', 'completed', 'failed'] as const
export const WorkflowStatusSchema = z.enum(WorkflowStatusValues)
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>

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

// ─── API input schemas ────────────────────────────────────────────────────────

export const CreateWorkflowSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
})
export type CreateWorkflowInput = z.infer<typeof CreateWorkflowSchema>

export const UpdateWorkflowSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  currentStep: z.number().int().min(1).max(4).optional(),
  step1Data: Step1Schema.optional(),
  step2Data: Step2Schema.optional(),
  step3Data: Step3Schema.optional(),
  step4Data: Step4Schema.optional(),
})
export type UpdateWorkflowInput = z.infer<typeof UpdateWorkflowSchema>

export const TransitionWorkflowSchema = z.object({
  status: z.enum(['draft', 'in_progress', 'submitted', 'completed', 'failed']),
  reason: z.string().max(500).optional(),
})
export type TransitionWorkflowInput = z.infer<typeof TransitionWorkflowSchema>

// ─── Auth input schemas ───────────────────────────────────────────────────────

export const LoginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
})
export type LoginInput = z.infer<typeof LoginSchema>
