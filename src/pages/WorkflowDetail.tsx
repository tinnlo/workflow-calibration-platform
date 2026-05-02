import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Download, AlertCircle, Loader2, RefreshCw, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useWorkflow, useTransitionWorkflow, useAuditLog, workflowKeys } from '@/hooks/useWorkflows'
import { WorkflowWizard } from '@/components/Workflow/WorkflowWizard'
import { exportWorkflowPdf } from '@/services/pdfExport'
import { ApiError } from '@/types/api'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import { useQueryClient } from '@tanstack/react-query'

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
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const qc = useQueryClient()

  const { data: workflow, isLoading, error, refetch } = useWorkflow(id ?? '')
  const { mutate: transition, isPending: transitioning } = useTransitionWorkflow()
  // Only fetch the audit trail when the workflow id is known.
  // The server already redacts sensitive fields for non-admins, but we avoid
  // the round-trip entirely for reviewers since they only see public fields.
  const {
    data: auditEntries,
    isLoading: auditLoading,
    error: auditError,
  } = useAuditLog(id ?? '')

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

  // Always derive ETag from the server-confirmed workflow version so it
  // stays fresh after every refetch (including after a 412 conflict refresh).
  const currentEtag = `W/"${workflow.version}"`

  function handleRetry() {
    transition(
      { id: workflow!.id, input: { status: 'draft', reason: 'Retry after failure' }, etag: currentEtag },
      {
        onSuccess: () => {
          toast({ title: 'Workflow reset to draft' })
        },
        onError: (err) => {
          const detail = err instanceof ApiError ? err.problem.detail : err.message
          if (err instanceof ApiError && err.status === 403) {
            toast({
              title: 'Permission denied',
              description: 'Your role does not allow this transition.',
              variant: 'destructive',
            })
          } else if (err instanceof ApiError && err.status === 412) {
            toast({
              title: 'Conflict detected',
              description: 'The workflow was updated elsewhere. Refreshing…',
              variant: 'destructive',
            })
            // Refresh both workflow and audit so both are consistent after conflict recovery.
            refetch()
            qc.invalidateQueries({ queryKey: workflowKeys.audit(workflow!.id) })
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

      {/* Audit Trail */}
      {auditLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Loading audit trail…</span>
        </div>
      ) : auditError ? (
        <div className="flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" />
          <span>
            Audit trail unavailable:{' '}
            {auditError instanceof ApiError ? auditError.problem.detail : auditError.message}
          </span>
        </div>
      ) : auditEntries && auditEntries.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              Audit Trail
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {auditEntries.map((entry, i) => (
                <div key={entry.correlationId ?? `${entry.timestamp}-${i}`} className="flex flex-col gap-0.5 text-xs border-b border-border/40 pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>{new Date(entry.timestamp).toLocaleString()}</span>
                    <span className="capitalize font-medium text-foreground">
                      {entry.oldState !== null
                        ? `${entry.oldState.replace('_', ' ')} \u2192 ${entry.newState.replace('_', ' ')}`
                        : `created \u2192 ${entry.newState.replace('_', ' ')}`}
                    </span>
                    <Badge variant={entry.actorRole === 'admin' ? 'default' : 'secondary'} className="text-[10px] px-1 py-0 h-4">
                      {entry.actorRole}
                    </Badge>
                  </div>
                  {(isAdmin || entry.reason) && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      {isAdmin && <span>Actor: {entry.actorId}</span>}
                      {entry.reason && <span className="italic">— {entry.reason}</span>}
                    </div>
                  )}
                  {isAdmin && (
                    <div className="text-muted-foreground/60 font-mono">
                      corr: {entry.correlationId}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : workflow.statusHistory.length > 1 ? (
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
      ) : null}

      {/* Wizard */}
      <WorkflowWizard
        workflow={workflow}
        etag={currentEtag}
      />
    </div>
  )
}
