// ── components/diseases/DiseaseStatusBadge.tsx ────────────────────────────
import clsx from 'clsx'
import { Clock, Send, CheckCircle, Archive, AlertCircle } from 'lucide-react'

export type DiseaseStatus = 'draft' | 'pending_approval' | 'changes_requested' | 'published' | 'archived'

const META: Record<DiseaseStatus, { label: string; color: string; Icon: React.ElementType }> = {
  draft:             { label: 'Draft',             color: 'bg-gray-50 text-gray-600 border-gray-200',       Icon: Clock },
  pending_approval:  { label: 'Pending Approval',  color: 'bg-yellow-50 text-yellow-700 border-yellow-200', Icon: Send },
  changes_requested: { label: 'Changes Requested', color: 'bg-orange-50 text-orange-700 border-orange-200', Icon: AlertCircle },
  published:         { label: 'Published',          color: 'bg-green-50 text-green-700 border-green-200',   Icon: CheckCircle },
  archived:          { label: 'Archived',           color: 'bg-red-50 text-red-700 border-red-200',         Icon: Archive },
}

export default function DiseaseStatusBadge({ status }: { status: DiseaseStatus }) {
  const { label, color, Icon } = META[status] ?? META.draft
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-medium', color)}>
      <Icon className="w-3 h-3" /> {label}
    </span>
  )
}
