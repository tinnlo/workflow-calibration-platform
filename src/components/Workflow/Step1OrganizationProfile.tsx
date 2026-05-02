import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Step1Data } from '@/types/workflow'

const schema = z.object({
  organizationName: z.string().min(1, 'Required').max(100),
  contactName: z.string().min(1, 'Required').max(100),
  contactEmail: z.string().email('Invalid email').max(200),
  reportingPeriod: z.string().min(1, 'Required').max(50),
  description: z.string().max(500).optional(),
})

type FormValues = z.infer<typeof schema>

interface Step1FormProps {
  workflowId: string
  defaultValues?: Step1Data
  readOnly?: boolean
  onChange: (data: Step1Data) => void
}

export function Step1Form({ workflowId, defaultValues, readOnly, onChange }: Step1FormProps) {
  const {
    register,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues ?? {},
    mode: 'onChange',
  })

  // Guard that prevents the watch() → onChange effect from firing during a
  // programmatic reset(). Without this, resetting to server data after a
  // conflict would immediately re-schedule an autosave of that server data.
  const resettingRef = useRef(false)

  // When workflowId changes (navigation) or defaultValues change (conflict
  // refetch) reset the form so users see the correct workflow's server state.
  useEffect(() => {
    resettingRef.current = true
    reset(defaultValues ?? {})
    Promise.resolve().then(() => { resettingRef.current = false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId, JSON.stringify(defaultValues)])

  const values = watch()

  useEffect(() => {
    if (resettingRef.current) return
    const { organizationName, contactName, contactEmail, reportingPeriod } = values
    if (organizationName && contactName && contactEmail && reportingPeriod) {
      onChange(values as Step1Data)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values)])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="organizationName">Organisation Name</Label>
          <Input
            id="organizationName"
            disabled={readOnly}
            {...register('organizationName')}
          />
          {errors.organizationName && (
            <p className="text-xs text-destructive">{errors.organizationName.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reportingPeriod">Reporting Period</Label>
          <Input
            id="reportingPeriod"
            placeholder="e.g. Q1 2025"
            disabled={readOnly}
            {...register('reportingPeriod')}
          />
          {errors.reportingPeriod && (
            <p className="text-xs text-destructive">{errors.reportingPeriod.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contactName">Contact Name</Label>
          <Input
            id="contactName"
            disabled={readOnly}
            {...register('contactName')}
          />
          {errors.contactName && (
            <p className="text-xs text-destructive">{errors.contactName.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contactEmail">Contact Email</Label>
          <Input
            id="contactEmail"
            type="email"
            disabled={readOnly}
            {...register('contactEmail')}
          />
          {errors.contactEmail && (
            <p className="text-xs text-destructive">{errors.contactEmail.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description (optional)</Label>
        <textarea
          id="description"
          rows={3}
          disabled={readOnly}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          {...register('description')}
        />
      </div>
    </div>
  )
}
