import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { WorkflowStatus } from '@/types/workflow'

interface StatusChartProps {
  workflows: Array<{ status: WorkflowStatus }>
}

const STATUS_COLORS: Record<WorkflowStatus, string> = {
  draft: '#94a3b8',
  in_progress: '#3b82f6',
  submitted: '#f59e0b',
  completed: '#22c55e',
  failed: '#ef4444',
}

const STATUS_LABELS: Record<WorkflowStatus, string> = {
  draft: 'Draft',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  completed: 'Completed',
  failed: 'Failed',
}

export function StatusChart({ workflows }: StatusChartProps) {
  const counts = workflows.reduce<Record<string, number>>((acc, w) => {
    acc[w.status] = (acc[w.status] ?? 0) + 1
    return acc
  }, {})

  const data = Object.entries(counts).map(([status, count]) => ({
    name: STATUS_LABELS[status as WorkflowStatus] ?? status,
    value: count,
    color: STATUS_COLORS[status as WorkflowStatus] ?? '#6b7280',
  }))

  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
        No workflows yet
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          outerRadius={80}
          dataKey="value"
          label={({ name, value }) => `${name}: ${value}`}
          labelLine={false}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => [value, 'Workflows']} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}
