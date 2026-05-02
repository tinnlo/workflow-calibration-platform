import { useEffect, useRef } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import type { Step2Data } from '@/types/workflow'

const dataPointSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, 'Required').max(100),
  value: z.coerce.number(),
  unit: z.string().min(1, 'Required').max(50),
  source: z.string().min(1, 'Required').max(200),
  notes: z.string().max(500).optional(),
})

const schema = z.object({
  dataPoints: z.array(dataPointSchema).max(50),
})

type FormValues = z.infer<typeof schema>

interface Step2FormProps {
  workflowId: string
  defaultValues?: Step2Data
  readOnly?: boolean
  onChange: (data: Step2Data) => void
}

export function Step2Form({ workflowId, defaultValues, readOnly, onChange }: Step2FormProps) {
  const {
    register,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { dataPoints: defaultValues?.dataPoints ?? [] },
    mode: 'onChange',
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'dataPoints' })
  const values = watch()

  // Guard that prevents the watch() → onChange effect from firing during a
  // programmatic reset(). Without this, resetting to server data after a
  // conflict would immediately re-schedule an autosave of that server data.
  const resettingRef = useRef(false)

  // When workflowId changes (navigation) or defaultValues change (conflict
  // refetch) reset the form so users see the correct workflow's server state.
  useEffect(() => {
    resettingRef.current = true
    reset({ dataPoints: defaultValues?.dataPoints ?? [] })
    Promise.resolve().then(() => { resettingRef.current = false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId, JSON.stringify(defaultValues)])

  useEffect(() => {
    if (resettingRef.current) return
    onChange({ dataPoints: values.dataPoints as Step2Data['dataPoints'] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values.dataPoints)])

  function addDataPoint() {
    append({ id: crypto.randomUUID().slice(0, 8), name: '', value: 0, unit: '', source: '' })
  }

  return (
    <div className="space-y-4">
      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">No data points added yet.</p>
      )}

      {fields.map((field, idx) => (
        <div key={field.id} className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Data Point {idx + 1}</span>
            {!readOnly && (
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(idx)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input disabled={readOnly} {...register(`dataPoints.${idx}.name`)} />
              {errors.dataPoints?.[idx]?.name && (
                <p className="text-xs text-destructive">{errors.dataPoints[idx].name?.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Value</Label>
              <Input type="number" step="any" disabled={readOnly} {...register(`dataPoints.${idx}.value`)} />
            </div>
            <div className="space-y-1">
              <Label>Unit</Label>
              <Input placeholder="e.g. kg, MWh" disabled={readOnly} {...register(`dataPoints.${idx}.unit`)} />
            </div>
            <div className="space-y-1">
              <Label>Source</Label>
              <Input disabled={readOnly} {...register(`dataPoints.${idx}.source`)} />
            </div>
          </div>
        </div>
      ))}

      {!readOnly && fields.length < 50 && (
        <Button type="button" variant="outline" size="sm" onClick={addDataPoint}>
          <Plus className="h-4 w-4 mr-1" /> Add Data Point
        </Button>
      )}
    </div>
  )
}
