import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Workflow } from '@/types/workflow'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  completed: 'Completed',
  failed: 'Failed',
}

/**
 * Export a workflow summary as a PDF and trigger a browser download.
 */
export function exportWorkflowPdf(workflow: Workflow): void {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Workflow Calibration Report', pageWidth / 2, 20, { align: 'center' })

  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(workflow.title, pageWidth / 2, 30, { align: 'center' })

  // ── Summary table ─────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: 40,
    head: [['Field', 'Value']],
    body: [
      ['Status', STATUS_LABELS[workflow.status] ?? workflow.status],
      ['Current Step', String(workflow.currentStep)],
      ['Created', new Date(workflow.createdAt).toLocaleString()],
      ['Last Updated', new Date(workflow.updatedAt).toLocaleString()],
      ['Description', workflow.description || '—'],
    ],
    headStyles: { fillColor: [59, 130, 246] },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  })

  // ── Step 1 ────────────────────────────────────────────────────────────────
  if (workflow.step1Data) {
    const s1 = workflow.step1Data
    const yAfterSummary = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Step 1: Organisation Profile', 14, yAfterSummary)

    autoTable(doc, {
      startY: yAfterSummary + 6,
      body: [
        ['Organisation Name', s1.organizationName],
        ['Contact Name', s1.contactName],
        ['Contact Email', s1.contactEmail],
        ['Reporting Period', s1.reportingPeriod],
        ['Description', s1.description ?? '—'],
      ],
    })
  }

  // ── Step 2 ────────────────────────────────────────────────────────────────
  if (workflow.step2Data && workflow.step2Data.dataPoints.length > 0) {
    const yAfterStep1 = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Step 2: Data Points', 14, yAfterStep1)

    autoTable(doc, {
      startY: yAfterStep1 + 6,
      head: [['Name', 'Value', 'Unit', 'Source']],
      body: workflow.step2Data.dataPoints.map((dp) => [dp.name, String(dp.value), dp.unit, dp.source]),
      headStyles: { fillColor: [59, 130, 246] },
    })
  }

  // ── Step 3 ────────────────────────────────────────────────────────────────
  if (workflow.step3Data && workflow.step3Data.corrections.length > 0) {
    const yAfterStep2 = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Step 3: Review & Calibration', 14, yAfterStep2)

    autoTable(doc, {
      startY: yAfterStep2 + 6,
      head: [['Data Point ID', 'Original', 'Corrected', 'Reason']],
      body: workflow.step3Data.corrections.map((c) => [
        c.dataPointId,
        String(c.originalValue),
        String(c.correctedValue),
        c.reason,
      ]),
      headStyles: { fillColor: [59, 130, 246] },
    })
  }

  // ── Status history ────────────────────────────────────────────────────────
  if (workflow.statusHistory.length > 0) {
    const yAfterPrev = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Status History', 14, yAfterPrev)

    autoTable(doc, {
      startY: yAfterPrev + 6,
      head: [['From', 'To', 'Timestamp', 'Reason']],
      body: workflow.statusHistory.map((h) => [
        h.from ?? '—',
        h.to,
        new Date(h.timestamp).toLocaleString(),
        h.reason ?? '—',
      ]),
      headStyles: { fillColor: [59, 130, 246] },
    })
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, {
      align: 'center',
    })
  }

  doc.save(`workflow-${workflow.id.slice(0, 8)}-report.pdf`)
}
