import { useEffect } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import type { Step3Data, DataPoint } from '@/types/workflow'

const correctionSchema = z.object({
  id: z.string().min(1),
  dataPointId: z.string().min(1, 'Required'),
  originalValue: z.coerce.number(),
  correctedValue: z.coerce.number(),
  reason: z.string().min(1, 'Required').max(500),
})

const schema = z.object({
  corrections: z.array(correctionSchema).max(50),
  reviewNotes: z.string().max(1000).optional(),
})

type FormValues = z.infer<typeof schema>

interface Step3FormProps {
  defaultValues?: Step3Data
  dataPoints: DataPoint[]
  readOnly?: boolean
  onChange: (data: Step3Data) => void
}

export function Step3Form({ defaultValues, dataPoints, readOnly, onChange }: Step3FormProps) {
  const {
    register,
    control,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      corrections: defaultValues?.corrections ?? [],
      reviewNotes: defaultValues?.reviewNotes ?? '',
    },
    mode: 'onChange',
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'corrections' })
  const values = watch()

  useEffect(() => {
    onChange(values as Step3Data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values)])

  function addCorrection() {
    append({ id: crypto.randomUUID().slice(0, 8), dataPointId: '', originalValue: 0, correctedValue: 0, reason: '' })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="reviewNotes">Review Notes (optional)</Label>
        <textarea
          id="reviewNotes"
          rows={3}
          disabled={readOnly}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          {...register('reviewNotes')}
        />
      </div>

      <div>
        <p className="text-sm font-medium mb-2">Corrections</p>
        {fields.length === 0 && (
          <p className="text-sm text-muted-foreground">No corrections added.</p>
        )}

        {fields.map((field, idx) => (
          <div key={field.id} className="border rounded-lg p-4 space-y-3 mb-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-muted-foreground">Correction {idx + 1}</span>
              {!readOnly && (
                <Button type="button" variant="ghost" size="sm" onClick={() => remove(idx)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label>Data Point</Label>
                <select
                  disabled={readOnly}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  {...register(`corrections.${idx}.dataPointId`)}
                >
                  <option value="">Select data point…</option>
                  {dataPoints.map((dp) => (
                    <option key={dp.id} value={dp.id}>{dp.name}</option>
                  ))}
                </select>
                {errors.corrections?.[idx]?.dataPointId && (
                  <p className="text-xs text-destructive">{errors.corrections[idx].dataPointId?.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Original Value</Label>
                <Input type="number" step="any" disabled={readOnly} {...register(`corrections.${idx}.originalValue`)} />
              </div>
              <div className="space-y-1">
                <Label>Corrected Value</Label>
                <Input type="number" step="any" disabled={readOnly} {...register(`corrections.${idx}.correctedValue`)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Reason</Label>
                <Input disabled={readOnly} {...register(`corrections.${idx}.reason`)} />
                {errors.corrections?.[idx]?.reason && (
                  <p className="text-xs text-destructive">{errors.corrections[idx].reason?.message}</p>
                )}
              </div>
            </div>
          </div>
        ))}

        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={addCorrection}>
            <Plus className="h-4 w-4 mr-1" /> Add Correction
          </Button>
        )}
      </div>
    </div>
  )
}
