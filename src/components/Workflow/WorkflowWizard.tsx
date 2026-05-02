import { useState, useEffect } from 'react'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { useAutoSave } from '@/hooks/useAutoSave'
import { useTransitionWorkflow, workflowKeys } from '@/hooks/useWorkflows'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/types/api'
import { useToast } from '@/hooks/use-toast'
import type { Workflow } from '@/types/workflow'
import { Step1Form } from '@/components/Workflow/Step1OrganizationProfile'
import { Step2Form } from '@/components/Workflow/Step2DataCollection'
import { Step3Form } from '@/components/Workflow/Step3ReviewCalibration'
import { Step4Form } from '@/components/Workflow/Step4Summary'

interface WorkflowWizardProps {
  workflow: Workflow
  etag: string | undefined
}

const STEPS = [
  { label: 'Organisation', title: 'Step 1: Organisation Profile' },
  { label: 'Data', title: 'Step 2: Data Collection' },
  { label: 'Review', title: 'Step 3: Review & Calibration' },
  { label: 'Summary', title: 'Step 4: Summary & Submit' },
]

export function WorkflowWizard({ workflow, etag }: WorkflowWizardProps) {
  const [currentStep, setCurrentStep] = useState(workflow.currentStep ?? 1)
  /**
   * True while flush() is awaited inside handleStepChange or handleSubmit.
   * Disables all nav and submit buttons to prevent re-entrant clicks during
   * the async window between "button pressed" and "transition fires".
   */
  const [isFlushing, setIsFlushing] = useState(false)
  const { toast } = useToast()
  const qc = useQueryClient()

  // Resync local step whenever the server-side workflow changes (id change =
  // navigation to a different workflow; currentStep change = server update /
  // 412 refetch). Without the id dependency, navigating between two workflows
  // that share the same saved step value would keep the previous local state.
  useEffect(() => {
    setCurrentStep(workflow.currentStep ?? 1)
  }, [workflow.id, workflow.currentStep])
  const { save, flush } = useAutoSave({
    workflowId: workflow.id,
    etag,
    enabled: workflow.status === 'draft' || workflow.status === 'in_progress',
    onConflict: () => {
      toast({
        title: 'Conflict detected',
        description: 'The workflow was updated elsewhere. Your unsaved changes have been discarded — please review the latest version.',
        variant: 'destructive',
      })
      qc.invalidateQueries({ queryKey: workflowKeys.detail(workflow.id) })
      qc.invalidateQueries({ queryKey: workflowKeys.audit(workflow.id) })
    },
  })
  const { mutate: transition, isPending: transitioning } = useTransitionWorkflow()

  const isReadOnly = workflow.status === 'submitted' || workflow.status === 'completed' || workflow.status === 'failed'
  const progress = ((currentStep - 1) / (STEPS.length - 1)) * 100

  async function handleStepChange(step: number) {
    setIsFlushing(true)
    try {
      await flush()
    } catch {
      toast({
        title: 'Save failed',
        description: 'Your changes could not be saved. Please check your connection and try again.',
        variant: 'destructive',
      })
      return
    } finally {
      setIsFlushing(false)
    }
    setCurrentStep(step)
    save({ currentStep: step })
  }

  async function handleSubmit() {
    setIsFlushing(true)
    try {
      await flush()
    } catch {
      toast({
        title: 'Save failed',
        description: 'Your changes could not be saved. Please check your connection and try again.',
        variant: 'destructive',
      })
      return
    } finally {
      setIsFlushing(false)
    }
    transition(
      { id: workflow.id, input: { status: 'submitted' }, etag },
      {
        onSuccess: () => {
          toast({ title: 'Workflow submitted successfully' })
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 403) {
            toast({
              title: 'Permission denied',
              description: 'Your role does not allow this transition.',
              variant: 'destructive',
            })
          } else if (err instanceof ApiError && err.status === 412) {
            toast({
              title: 'Conflict detected',
              description: 'The workflow was updated elsewhere. Please retry.',
              variant: 'destructive',
            })
            // Refetch so the derived ETag in the parent updates immediately
            qc.invalidateQueries({ queryKey: workflowKeys.detail(workflow.id) })
            qc.invalidateQueries({ queryKey: workflowKeys.audit(workflow.id) })
          } else {
            const msg = err instanceof ApiError ? err.problem.detail : err.message
            toast({ title: 'Submission failed', description: msg, variant: 'destructive' })
          }
        },
      }
    )
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div>
        <div className="flex justify-between text-xs text-muted-foreground mb-2">
          {STEPS.map((s, i) => (
            <span
              key={s.label}
              className={i + 1 === currentStep ? 'text-primary font-medium' : ''}
            >
              {s.label}
            </span>
          ))}
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Step content */}
      <div className="bg-card border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">{STEPS[currentStep - 1].title}</h2>

        {currentStep === 1 && (
          <Step1Form
            workflowId={workflow.id}
            defaultValues={workflow.step1Data ?? undefined}
            readOnly={isReadOnly}
            onChange={(data) => save({ step1Data: data, currentStep: 1 })}
          />
        )}
        {currentStep === 2 && (
          <Step2Form
            workflowId={workflow.id}
            defaultValues={workflow.step2Data ?? undefined}
            readOnly={isReadOnly}
            onChange={(data) => save({ step2Data: data, currentStep: 2 })}
          />
        )}
        {currentStep === 3 && (
          <Step3Form
            workflowId={workflow.id}
            defaultValues={workflow.step3Data ?? undefined}
            dataPoints={workflow.step2Data?.dataPoints ?? []}
            readOnly={isReadOnly}
            onChange={(data) => save({ step3Data: data, currentStep: 3 })}
          />
        )}
        {currentStep === 4 && (
          <Step4Form
            workflow={workflow}
            readOnly={isReadOnly}
            onChange={(data) => save({ step4Data: data, currentStep: 4 })}
          />
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          disabled={currentStep === 1 || isFlushing}
          onClick={() => handleStepChange(currentStep - 1)}
        >
          Previous
        </Button>

        {currentStep < STEPS.length ? (
          <Button disabled={isFlushing} onClick={() => handleStepChange(currentStep + 1)}>Next</Button>
        ) : (
          <Button
            disabled={isReadOnly || transitioning || isFlushing}
            onClick={handleSubmit}
          >
            {isFlushing ? 'Saving...' : transitioning ? 'Submitting...' : 'Submit Workflow'}
          </Button>
        )}
      </div>
    </div>
  )
}
