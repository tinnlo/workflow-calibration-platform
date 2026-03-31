import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Download, AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useWorkflow, useTransitionWorkflow } from '@/hooks/useWorkflows'
import { WorkflowWizard } from '@/components/Workflow/WorkflowWizard'
import { exportWorkflowPdf } from '@/services/pdfExport'
import { ApiError } from '@/types/api'
import { useToast } from '@/hooks/use-toast'

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  in_progress: 'default',
  submitted: 'outline',
  completed: 'default',
  failed: 'destructive',
}

export default function WorkflowDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()

  const { data: workflow, isLoading, error, refetch } = useWorkflow(id ?? '')
  const { mutate: transition, isPending: transitioning } = useTransitionWorkflow()

  // Track the current ETag for conditional requests
  const [etag, setEtag] = useState<string | undefined>(
    workflow ? `W/"${workflow.version}"` : undefined
  )

  if (!id) {
    navigate('/dashboard')
    return null
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading workflow…</span>
      </div>
    )
  }

  if (error || !workflow) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">
            {error instanceof ApiError ? error.problem.detail : 'Failed to load workflow'}
          </span>
        </div>
      </div>
    )
  }

  // Sync ETag from loaded workflow
  const currentEtag = etag ?? `W/"${workflow.version}"`

  function handleRetry() {
    transition(
      { id: workflow!.id, input: { status: 'draft', reason: 'Retry after failure' }, etag: currentEtag },
      {
        onSuccess: (updated) => {
          setEtag(`W/"${updated.version}"`)
          toast({ title: 'Workflow reset to draft' })
          refetch()
        },
        onError: (err) => {
          const detail = err instanceof ApiError ? err.problem.detail : err.message
          if (err instanceof ApiError && err.status === 412) {
            toast({
              title: 'Conflict detected',
              description: 'The workflow was updated elsewhere. Refreshing…',
              variant: 'destructive',
            })
            refetch()
          } else {
            toast({ title: 'Error', description: detail, variant: 'destructive' })
          }
        },
      }
    )
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">{workflow.title}</span>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[workflow.status]}>
            {workflow.status.replace('_', ' ')}
          </Badge>

          <Button
            variant="outline"
            size="sm"
            onClick={() => exportWorkflowPdf(workflow)}
          >
            <Download className="h-4 w-4 mr-1" /> Export PDF
          </Button>

          {workflow.status === 'failed' && (
            <Button
              variant="outline"
              size="sm"
              disabled={transitioning}
              onClick={handleRetry}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              {transitioning ? 'Resetting…' : 'Retry'}
            </Button>
          )}
        </div>
      </div>

      {/* Status history (collapsed) */}
      {workflow.statusHistory.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Status History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {workflow.statusHistory.map((entry, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{new Date(entry.timestamp).toLocaleString()}</span>
                  <span>&rarr;</span>
                  <span className="capitalize">{entry.to.replace('_', ' ')}</span>
                  {entry.reason && <span className="italic">({entry.reason})</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Wizard */}
      <WorkflowWizard
        workflow={workflow}
        etag={currentEtag}
        onETagChange={setEtag}
      />
    </div>
  )
}
