import { useState } from 'react'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { useAutoSave } from '@/hooks/useAutoSave'
import { useTransitionWorkflow } from '@/hooks/useWorkflows'
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
  onETagChange: (etag: string) => void
}

const STEPS = [
  { label: 'Organisation', title: 'Step 1: Organisation Profile' },
  { label: 'Data', title: 'Step 2: Data Collection' },
  { label: 'Review', title: 'Step 3: Review & Calibration' },
  { label: 'Summary', title: 'Step 4: Summary & Submit' },
]

export function WorkflowWizard({ workflow, etag, onETagChange }: WorkflowWizardProps) {
  const [currentStep, setCurrentStep] = useState(workflow.currentStep ?? 1)
  const { toast } = useToast()
  const { save } = useAutoSave({
    workflowId: workflow.id,
    etag,
    enabled: workflow.status === 'draft' || workflow.status === 'in_progress',
  })
  const { mutate: transition, isPending: transitioning } = useTransitionWorkflow()

  const isReadOnly = workflow.status === 'submitted' || workflow.status === 'completed' || workflow.status === 'failed'
  const progress = ((currentStep - 1) / (STEPS.length - 1)) * 100

  function handleStepChange(step: number) {
    setCurrentStep(step)
    save({ currentStep: step })
  }

  function handleSubmit() {
    transition(
      { id: workflow.id, input: { status: 'submitted' }, etag },
      {
        onSuccess: (updated) => {
          onETagChange(`W/"${updated.version}"`)
          toast({ title: 'Workflow submitted successfully' })
        },
        onError: (err) => {
          const msg = err instanceof ApiError ? err.problem.detail : err.message
          toast({ title: 'Submission failed', description: msg, variant: 'destructive' })
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
            defaultValues={workflow.step1Data ?? undefined}
            readOnly={isReadOnly}
            onChange={(data) => save({ step1Data: data, currentStep: 1 })}
          />
        )}
        {currentStep === 2 && (
          <Step2Form
            defaultValues={workflow.step2Data ?? undefined}
            readOnly={isReadOnly}
            onChange={(data) => save({ step2Data: data, currentStep: 2 })}
          />
        )}
        {currentStep === 3 && (
          <Step3Form
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
          disabled={currentStep === 1}
          onClick={() => handleStepChange(currentStep - 1)}
        >
          Previous
        </Button>

        {currentStep < STEPS.length ? (
          <Button onClick={() => handleStepChange(currentStep + 1)}>Next</Button>
        ) : (
          <Button
            disabled={isReadOnly || transitioning}
            onClick={handleSubmit}
          >
            {transitioning ? 'Submitting...' : 'Submit Workflow'}
          </Button>
        )}
      </div>
    </div>
  )
}
