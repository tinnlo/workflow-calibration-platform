import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusChart } from '@/components/Dashboard/StatusChart'

// Mock Recharts to avoid SVG/canvas issues in jsdom
vi.mock('recharts', () => ({
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: ({ data }: { data: Array<{ name: string; value: number }> }) => (
    <div data-testid="pie">
      {data.map((d) => (
        <span key={d.name}>{`${d.name}:${d.value}`}</span>
      ))}
    </div>
  ),
  Cell: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}))

describe('StatusChart', () => {
  it('renders empty state when workflows array is empty', () => {
    render(<StatusChart workflows={[]} />)
    expect(screen.getByText(/no workflows yet/i)).toBeInTheDocument()
    expect(screen.queryByTestId('pie-chart')).not.toBeInTheDocument()
  })

  it('renders pie chart when workflows exist', () => {
    render(<StatusChart workflows={[{ status: 'draft' }, { status: 'completed' }]} />)
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
  })

  it('aggregates counts correctly by status', () => {
    render(
      <StatusChart
        workflows={[
          { status: 'draft' },
          { status: 'draft' },
          { status: 'completed' },
          { status: 'failed' },
        ]}
      />
    )
    expect(screen.getByText('Draft:2')).toBeInTheDocument()
    expect(screen.getByText('Completed:1')).toBeInTheDocument()
    expect(screen.getByText('Failed:1')).toBeInTheDocument()
  })

  it('maps status labels correctly (in_progress → In Progress)', () => {
    render(<StatusChart workflows={[{ status: 'in_progress' }]} />)
    expect(screen.getByText('In Progress:1')).toBeInTheDocument()
  })
})
