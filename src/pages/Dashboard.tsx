import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, FileText, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useWorkflows, useCreateWorkflow } from '@/hooks/useWorkflows'
import { useAuth } from '@/contexts/AuthContext'
import { StatusChart } from '@/components/Dashboard/StatusChart'
import { ApiError } from '@/types/api'
import type { Workflow } from '@/types/workflow'

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  in_progress: 'default',
  submitted: 'outline',
  completed: 'default',
  failed: 'destructive',
}

function WorkflowRow({ workflow }: { workflow: Workflow }) {
  return (
    <Link
      to={`/workflows/${workflow.id}`}
      className="flex items-center justify-between p-4 hover:bg-muted/40 rounded-lg transition-colors"
    >
      <div className="flex items-center gap-3">
        <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        <div>
          <p className="text-sm font-medium leading-none">{workflow.title}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Updated {new Date(workflow.updatedAt).toLocaleDateString()}
          </p>
        </div>
      </div>
      <Badge variant={STATUS_VARIANT[workflow.status]}>
        {workflow.status.replace('_', ' ')}
      </Badge>
    </Link>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: workflows, isLoading, error } = useWorkflows()
  const { mutate: createWorkflow, isPending: creating } = useCreateWorkflow()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  function handleCreate() {
    setCreateError(null)
    createWorkflow(
      { title: newTitle.trim(), description: newDesc.trim() },
      {
        onSuccess: (w) => {
          setDialogOpen(false)
          setNewTitle('')
          setNewDesc('')
          navigate(`/workflows/${w.id}`)
        },
        onError: (err) => {
          setCreateError(err instanceof ApiError ? err.problem.detail : err.message)
        },
      }
    )
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {user?.name} &mdash; {user?.organizationId}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Workflow
        </Button>
      </div>

      {/* Stats + chart */}
      {workflows && workflows.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Status Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <StatusChart workflows={workflows} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(['draft', 'in_progress', 'submitted', 'completed', 'failed'] as const).map((s) => {
                const count = workflows.filter((w) => w.status === s).length
                return (
                  <div key={s} className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground capitalize">{s.replace('_', ' ')}</span>
                    <Badge variant={STATUS_VARIANT[s]}>{count}</Badge>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Workflow list */}
      <Card>
        <CardHeader>
          <CardTitle>Workflows</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-destructive py-4">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">
                {error instanceof ApiError ? error.problem.detail : 'Failed to load workflows'}
              </span>
            </div>
          )}

          {!isLoading && !error && workflows?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No workflows yet. Create one to get started.
            </p>
          )}

          {workflows && workflows.length > 0 && (
            <div className="divide-y">
              {workflows.map((w) => (
                <WorkflowRow key={w.id} workflow={w} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Workflow</DialogTitle>
            <DialogDescription>Give your workflow a name to get started.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="newTitle">Title</Label>
              <Input
                id="newTitle"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Q1 2025 Calibration"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newDesc">Description (optional)</Label>
              <Input
                id="newDesc"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>

            {createError && (
              <p className="text-sm text-destructive">{createError}</p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                disabled={!newTitle.trim() || creating}
                onClick={handleCreate}
              >
                {creating ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
