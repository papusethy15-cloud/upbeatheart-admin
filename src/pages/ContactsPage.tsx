/**
 * UpBeat Heart — Admin Dashboard
 * ContactsPage.tsx — Full Contact Enquiry Manager
 *
 * Features:
 *  • Real-time Firestore listener (onSnapshot) — new enquiries appear instantly
 *  • Stats strip: Total / New / Read / Replied / Archived
 *  • Tab filter: All | New | Read | Replied | Archived
 *  • Search by name, phone, email, or message content
 *  • Subject filter dropdown
 *  • Sortable table: newest first by default
 *  • Row click → full detail view modal
 *  • Status transitions: New → Read → Replied → Archived (+ reopen)
 *  • Reply note field — saved to Firestore (for internal tracking)
 *  • One-click mailto / tel / WhatsApp shortcuts
 *  • Hard delete with confirmation dialog
 *  • Responsive: table collapses to card list on mobile
 *  • "Mark all as read" bulk action
 */

import { useEffect, useState, useMemo } from 'react'
import {
  collection, onSnapshot, orderBy, query,
  doc, updateDoc, deleteDoc, serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import {
  MessageSquare, Search, Phone, Mail, MessageCircle,
  X, Trash2, CheckCircle, Archive,
  RefreshCw, Send, Loader2, Filter,
  ChevronDown, MailOpen, Tag,
  InboxIcon,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface ContactEnquiry {
  id:         string
  name:       string
  phone:      string
  email:      string
  subject:    string
  subjectKey: string
  message:    string
  status:     'new' | 'read' | 'replied' | 'archived'
  replyNote:  string
  createdAt:  any
  updatedAt:  any
}

type StatusType = 'new' | 'read' | 'replied' | 'archived'
type TabType    = 'all' | StatusType

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(raw: unknown, compact = false) {
  if (!raw) return '—'
  try {
    let d: Date
    if (raw && typeof raw === 'object' && 'seconds' in raw)
      d = new Date((raw as { seconds: number }).seconds * 1000)
    else d = new Date(raw as string)
    if (isNaN(d.getTime())) return '—'
    if (compact) {
      const now = new Date()
      const diff = now.getTime() - d.getTime()
      const mins = Math.floor(diff / 60000)
      const hrs  = Math.floor(diff / 3600000)
      const days = Math.floor(diff / 86400000)
      if (mins < 1)   return 'Just now'
      if (mins < 60)  return `${mins}m ago`
      if (hrs  < 24)  return `${hrs}h ago`
      if (days < 7)   return `${days}d ago`
    }
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return '—' }
}

function initials(name: string) {
  return name.trim().split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?'
}

const STATUS_CONFIG: Record<StatusType, { label: string; color: string; dot: string; icon: any }> = {
  new:      { label: 'New',      color: 'bg-blue-100 text-blue-700 border-blue-200',    dot: 'bg-blue-500',   icon: InboxIcon   },
  read:     { label: 'Read',     color: 'bg-gray-100 text-gray-600 border-gray-200',    dot: 'bg-gray-400',   icon: MailOpen    },
  replied:  { label: 'Replied',  color: 'bg-green-100 text-green-700 border-green-200', dot: 'bg-green-500',  icon: CheckCircle },
  archived: { label: 'Archived', color: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500',  icon: Archive     },
}

const SUBJECT_LABELS: Record<string, string> = {
  appointment: 'Appointment Enquiry',
  report:      'Report / Second Opinion',
  assistance:  'Patient Assistance',
  ngo:         'NGO Partnership',
  other:       'Other',
  '':          'General',
}

const avatarColors = [
  'bg-primary/10 text-primary',
  'bg-[#18B55A]/10 text-[#18B55A]',
  'bg-[#18B8E6]/10 text-[#18B8E6]',
  'bg-purple-100 text-purple-600',
  'bg-amber-100 text-amber-600',
]
function avatarColor(name: string) {
  const code = name.charCodeAt(0) % avatarColors.length
  return avatarColors[code]
}

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────
function DeleteDialog({
  enquiry, onConfirm, onCancel, deleting,
}: {
  enquiry: ContactEnquiry; onConfirm: () => void; onCancel: () => void; deleting: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto">
          <Trash2 className="w-6 h-6 text-red-500" />
        </div>
        <div className="text-center">
          <h3 className="font-bold text-gray-900">Delete Enquiry?</h3>
          <p className="text-sm text-gray-500 mt-1">
            Permanently delete the message from <strong>{enquiry.name}</strong>. This cannot be undone.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={deleting}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition disabled:opacity-60 flex items-center justify-center gap-2">
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function DetailModal({
  enquiry, onClose, onStatusChange, onDelete: _onDelete,
}: {
  enquiry: ContactEnquiry
  onClose: () => void
  onStatusChange: (id: string, status: StatusType, replyNote?: string) => Promise<void>
  onDelete: (enquiry: ContactEnquiry) => void
}) {
  const [replyNote, setReplyNote]   = useState(enquiry.replyNote ?? '')
  const [saving,    setSaving]      = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting,   setDeleting]   = useState(false)

  const cfg = STATUS_CONFIG[enquiry.status]

  async function handleStatus(s: StatusType) {
    setSaving(true)
    await onStatusChange(enquiry.id, s, s === 'replied' ? replyNote : undefined)
    setSaving(false)
  }

  async function handleSaveNote() {
    setSaving(true)
    await onStatusChange(enquiry.id, enquiry.status, replyNote)
    setSaving(false)
    toast.success('Note saved')
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteDoc(doc(db, 'contacts', enquiry.id))
      toast.success('Enquiry deleted')
      onClose()
    } catch {
      toast.error('Delete failed')
    }
    setDeleting(false)
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${avatarColor(enquiry.name)}`}>
                {initials(enquiry.name)}
              </div>
              <div>
                <h2 className="font-bold text-gray-900 text-sm">{enquiry.name}</h2>
                <p className="text-xs text-gray-400">{fmtDate(enquiry.createdAt)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${cfg.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                {cfg.label}
              </span>
              <button onClick={onClose} className="w-8 h-8 rounded-xl hover:bg-gray-100 flex items-center justify-center text-gray-400 transition">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">

            {/* Contact info row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {enquiry.phone && (
                <a href={`tel:${enquiry.phone}`}
                  className="flex items-center gap-2.5 p-3.5 rounded-xl border border-gray-100 bg-gray-50 hover:border-primary/30 hover:bg-primary/4 transition group">
                  <div className="w-8 h-8 rounded-lg bg-[#18B55A]/10 flex items-center justify-center shrink-0">
                    <Phone className="w-3.5 h-3.5 text-[#18B55A]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Phone</p>
                    <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-primary transition">{enquiry.phone}</p>
                  </div>
                </a>
              )}
              {enquiry.email && (
                <a href={`mailto:${enquiry.email}`}
                  className="flex items-center gap-2.5 p-3.5 rounded-xl border border-gray-100 bg-gray-50 hover:border-primary/30 hover:bg-primary/4 transition group">
                  <div className="w-8 h-8 rounded-lg bg-[#18B8E6]/10 flex items-center justify-center shrink-0">
                    <Mail className="w-3.5 h-3.5 text-[#18B8E6]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Email</p>
                    <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-primary transition">{enquiry.email}</p>
                  </div>
                </a>
              )}
              {enquiry.phone && (
                <a href={`https://wa.me/${enquiry.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2.5 p-3.5 rounded-xl border border-gray-100 bg-gray-50 hover:border-[#18B55A]/30 hover:bg-[#18B55A]/4 transition group">
                  <div className="w-8 h-8 rounded-lg bg-[#18B55A]/10 flex items-center justify-center shrink-0">
                    <MessageCircle className="w-3.5 h-3.5 text-[#18B55A]" />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">WhatsApp</p>
                    <p className="text-sm font-semibold text-gray-800 group-hover:text-[#18B55A] transition">Chat now</p>
                  </div>
                </a>
              )}
            </div>

            {/* Subject */}
            {enquiry.subject && (
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-primary/5 border border-primary/10">
                <Tag className="w-4 h-4 text-primary shrink-0" />
                <div>
                  <span className="text-[10px] text-primary/60 font-bold uppercase tracking-wide mr-2">Subject</span>
                  <span className="text-sm font-semibold text-primary">{enquiry.subject}</span>
                </div>
              </div>
            )}

            {/* Message */}
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Message</p>
              <div className="bg-gray-50 rounded-xl border border-gray-100 px-5 py-4">
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{enquiry.message}</p>
              </div>
            </div>

            {/* Internal reply note */}
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Internal Reply Note</p>
              <textarea
                value={replyNote}
                onChange={e => setReplyNote(e.target.value)}
                rows={3}
                placeholder="Add an internal note about how this was resolved…"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none placeholder:text-gray-300"
              />
              <button
                onClick={handleSaveNote}
                disabled={saving}
                className="mt-1.5 text-xs font-semibold text-primary hover:underline disabled:opacity-50 flex items-center gap-1"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Save note
              </button>
            </div>
          </div>

          {/* Footer actions */}
          <div className="border-t border-gray-100 px-6 py-4 flex flex-wrap items-center gap-2 shrink-0 bg-gray-50/50">

            {/* Status buttons */}
            {enquiry.status !== 'read' && (
              <button onClick={() => handleStatus('read')} disabled={saving}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-100 transition disabled:opacity-50">
                <MailOpen className="w-3.5 h-3.5" /> Mark Read
              </button>
            )}
            {enquiry.status !== 'replied' && (
              <button onClick={() => handleStatus('replied')} disabled={saving}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 transition disabled:opacity-50">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Mark Replied
              </button>
            )}
            {enquiry.status !== 'archived' && (
              <button onClick={() => handleStatus('archived')} disabled={saving}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition disabled:opacity-50">
                <Archive className="w-3.5 h-3.5" /> Archive
              </button>
            )}
            {enquiry.status === 'archived' && (
              <button onClick={() => handleStatus('new')} disabled={saving}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition disabled:opacity-50">
                <RefreshCw className="w-3.5 h-3.5" /> Reopen
              </button>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Delete */}
            <button onClick={() => setShowDelete(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-red-500 border border-red-100 hover:bg-red-50 transition">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </div>
      </div>

      {showDelete && (
        <DeleteDialog
          enquiry={enquiry}
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
          deleting={deleting}
        />
      )}
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ContactsPage() {
  const [enquiries, setEnquiries] = useState<ContactEnquiry[]>([])
  const [loading,   setLoading]   = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [search,    setSearch]    = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [selected,  setSelected]  = useState<ContactEnquiry | null>(null)
  const [markingAll, setMarkingAll] = useState(false)

  // Real-time listener
  useEffect(() => {
    const q = query(collection(db, 'contacts'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setEnquiries(snap.docs.map(d => ({ id: d.id, ...d.data() } as ContactEnquiry)))
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [])

  // Auto-mark as "read" when modal opens (if currently "new")
  async function openEnquiry(e: ContactEnquiry) {
    setSelected(e)
    if (e.status === 'new') {
      await updateDoc(doc(db, 'contacts', e.id), { status: 'read', updatedAt: serverTimestamp() })
    }
  }

  async function handleStatusChange(id: string, status: StatusType, replyNote?: string) {
    const patch: Record<string, any> = { status, updatedAt: serverTimestamp() }
    if (replyNote !== undefined) patch.replyNote = replyNote
    await updateDoc(doc(db, 'contacts', id), patch)
    // Update selected if open
    setSelected(prev => prev?.id === id ? { ...prev, status, replyNote: replyNote ?? prev.replyNote } : prev)
    toast.success(`Marked as ${status}`)
  }

  async function markAllRead() {
    const newOnes = enquiries.filter(e => e.status === 'new')
    if (!newOnes.length) return
    setMarkingAll(true)
    try {
      const batch = writeBatch(db)
      newOnes.forEach(e => batch.update(doc(db, 'contacts', e.id), { status: 'read', updatedAt: serverTimestamp() }))
      await batch.commit()
      toast.success(`${newOnes.length} enquiries marked as read`)
    } catch { toast.error('Failed') }
    setMarkingAll(false)
  }

  // Stats
  const stats = useMemo(() => ({
    total:    enquiries.length,
    new:      enquiries.filter(e => e.status === 'new').length,
    read:     enquiries.filter(e => e.status === 'read').length,
    replied:  enquiries.filter(e => e.status === 'replied').length,
    archived: enquiries.filter(e => e.status === 'archived').length,
  }), [enquiries])

  // Unique subjects for filter
  const subjects = useMemo(() => {
    const set = new Set(enquiries.map(e => e.subjectKey ?? ''))
    return [...set].filter(Boolean)
  }, [enquiries])

  // Filtered list
  const filtered = useMemo(() => {
    let list = enquiries
    if (activeTab !== 'all') list = list.filter(e => e.status === activeTab)
    if (subjectFilter)       list = list.filter(e => e.subjectKey === subjectFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.phone.includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.message.toLowerCase().includes(q) ||
        e.subject.toLowerCase().includes(q)
      )
    }
    return list
  }, [enquiries, activeTab, subjectFilter, search])

  const TABS: { id: TabType; label: string; count: number }[] = [
    { id: 'all',      label: 'All',      count: stats.total    },
    { id: 'new',      label: 'New',      count: stats.new      },
    { id: 'read',     label: 'Read',     count: stats.read     },
    { id: 'replied',  label: 'Replied',  count: stats.replied  },
    { id: 'archived', label: 'Archived', count: stats.archived },
  ]

  return (
    <div className="max-w-6xl mx-auto pb-16">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contact Enquiries</h1>
          <p className="text-gray-400 text-sm mt-1">Messages submitted via the website contact form.</p>
        </div>
        {stats.new > 0 && (
          <button
            onClick={markAllRead}
            disabled={markingAll}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition disabled:opacity-60"
          >
            {markingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <MailOpen className="w-4 h-4" />}
            Mark all read ({stats.new})
          </button>
        )}
      </div>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Total',    value: stats.total,    color: 'text-gray-700',   bg: 'bg-gray-50',    icon: MessageSquare },
          { label: 'New',      value: stats.new,      color: 'text-blue-600',   bg: 'bg-blue-50',    icon: InboxIcon    },
          { label: 'Read',     value: stats.read,     color: 'text-gray-500',   bg: 'bg-gray-50',    icon: MailOpen     },
          { label: 'Replied',  value: stats.replied,  color: 'text-green-600',  bg: 'bg-green-50',   icon: CheckCircle  },
          { label: 'Archived', value: stats.archived, color: 'text-amber-600',  bg: 'bg-amber-50',   icon: Archive      },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} className={`rounded-2xl border border-gray-100 shadow-sm p-4 ${bg}`}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Tabs + Filters ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

        {/* Tab bar */}
        <div className="flex items-center border-b border-gray-100 px-4 gap-1 overflow-x-auto">
          {TABS.map(({ id, label, count }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={clsx(
                'flex items-center gap-2 px-3 py-3.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors',
                activeTab === id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-400 hover:text-gray-700'
              )}
            >
              {label}
              {count > 0 && (
                <span className={clsx(
                  'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                  id === 'new' && count > 0
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-500'
                )}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search + subject filter */}
        <div className="flex flex-col sm:flex-row gap-3 p-4 border-b border-gray-50">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, phone, email or message…"
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-gray-300"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <select
              value={subjectFilter}
              onChange={e => setSubjectFilter(e.target.value)}
              className="pl-9 pr-8 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none bg-white"
            >
              <option value="">All Subjects</option>
              {subjects.map(s => (
                <option key={s} value={s}>{SUBJECT_LABELS[s] ?? s}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Table / list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-300">
            <MessageSquare className="w-12 h-12" />
            <p className="text-sm font-medium text-gray-400">
              {search || subjectFilter ? 'No enquiries match your search' : 'No enquiries yet'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(e => {
              const cfg = STATUS_CONFIG[e.status]
              const StatusIcon = cfg.icon
              return (
                <div
                  key={e.id}
                  onClick={() => openEnquiry(e)}
                  className={clsx(
                    'flex items-start gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50/70 transition-colors group',
                    e.status === 'new' && 'bg-blue-50/40'
                  )}
                >
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${avatarColor(e.name)}`}>
                    {initials(e.name)}
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-bold ${e.status === 'new' ? 'text-gray-900' : 'text-gray-700'}`}>
                        {e.name}
                      </span>
                      {e.status === 'new' && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" title="New" />
                      )}
                      {e.subject && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/8 text-primary border border-primary/15">
                          {e.subject}
                        </span>
                      )}
                    </div>
                    <p className={`text-xs mt-0.5 ${e.status === 'new' ? 'text-gray-600' : 'text-gray-400'} line-clamp-1`}>
                      {e.message}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {e.phone && (
                        <span className="flex items-center gap-1 text-[11px] text-gray-400">
                          <Phone className="w-3 h-3" /> {e.phone}
                        </span>
                      )}
                      {e.email && (
                        <span className="flex items-center gap-1 text-[11px] text-gray-400">
                          <Mail className="w-3 h-3" /> {e.email}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: status + time */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="text-[11px] text-gray-400">{fmtDate(e.createdAt, true)}</span>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${cfg.color}`}>
                      <StatusIcon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Detail Modal ── */}
      {selected && (
        <DetailModal
          enquiry={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
          onDelete={() => { setSelected(null) }}
        />
      )}
    </div>
  )
}
