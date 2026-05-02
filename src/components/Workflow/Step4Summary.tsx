import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import type { Workflow, Step4Data } from '@/types/workflow'

const schema = z.object({
  reviewerNotes: z.string().max(1000).optional(),
  confirmAccuracy: z.boolean(),
  submitterName: z.string().min(1, 'Required').max(100),
})

type FormValues = z.infer<typeof schema>

const STATUS_BADGES: Record<string, string> = {
  draft: 'secondary',
  in_progress: 'default',
  submitted: 'outline',
  completed: 'default',
  failed: 'destructive',
}

interface Step4FormProps {
  workflow: Workflow
  readOnly?: boolean
  onChange: (data: Step4Data) => void
}

export function Step4Form({ workflow, readOnly, onChange }: Step4FormProps) {
  const {
    register,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: workflow.step4Data ?? { confirmAccuracy: false, submitterName: '' },
    mode: 'onChange',
  })

  const values = watch()

  // Guard that prevents the watch() → onChange effect from firing during a
  // programmatic reset(). Without this, resetting to server data after a
  // conflict would immediately re-schedule an autosave of that server data.
  const resettingRef = useRef(false)

  // When workflow.id changes (navigation) or step4Data changes (conflict
  // refetch) reset the form so users see the correct workflow's server state.
  useEffect(() => {
    resettingRef.current = true
    reset(workflow.step4Data ?? { confirmAccuracy: false, submitterName: '' })
    Promise.resolve().then(() => { resettingRef.current = false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow.id, JSON.stringify(workflow.step4Data)])

  useEffect(() => {
    if (resettingRef.current) return
    onChange(values as Step4Data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values)])

  return (
    <div className="space-y-6">
      {/* Workflow summary */}
      <div className="bg-muted/40 rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{workflow.title}</span>
          <Badge variant={STATUS_BADGES[workflow.status] as 'default' | 'secondary' | 'outline' | 'destructive' | undefined}>
            {workflow.status.replace('_', ' ')}
          </Badge>
        </div>
        {workflow.step1Data && (
          <p className="text-xs text-muted-foreground">
            {workflow.step1Data.organizationName} — {workflow.step1Data.reportingPeriod}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Step 2: {workflow.step2Data?.dataPoints.length ?? 0} data point(s) &nbsp;|&nbsp;
          Step 3: {workflow.step3Data?.corrections.length ?? 0} correction(s)
        </p>
      </div>

      {/* Reviewer notes */}
      <div className="space-y-1.5">
        <Label htmlFor="reviewerNotes">Reviewer Notes (optional)</Label>
        <textarea
          id="reviewerNotes"
          rows={3}
          disabled={readOnly}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          {...register('reviewerNotes')}
        />
      </div>

      {/* Submitter name */}
      <div className="space-y-1.5">
        <Label htmlFor="submitterName">Submitter Name</Label>
        <Input id="submitterName" disabled={readOnly} {...register('submitterName')} />
        {errors.submitterName && (
          <p className="text-xs text-destructive">{errors.submitterName.message}</p>
        )}
      </div>

      {/* Confirm accuracy */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          disabled={readOnly}
          className="h-4 w-4 rounded border-input"
          {...register('confirmAccuracy')}
        />
        <span className="text-sm">
          I confirm that the data provided is accurate and complete to the best of my knowledge.
        </span>
      </label>

      {workflow.status === 'completed' && (
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle className="h-5 w-5" />
          <span className="text-sm font-medium">This workflow has been completed.</span>
        </div>
      )}
    </div>
  )
}
