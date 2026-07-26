// ── pages/diseases/DiseasesListPage.tsx ───────────────────────────────────
import { useEffect, useState } from 'react'
import {
  collection, getDocs, orderBy, query,
  doc, updateDoc, deleteDoc, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { format } from 'date-fns'
import {
  Plus, Search, Stethoscope, Eye, Pencil, Trash2,
  CheckCircle, Send,
  BarChart2, Image, Video,
} from 'lucide-react'
import DiseaseStatusBadge, { type DiseaseStatus } from '@/components/diseases/DiseaseStatusBadge'

interface Disease {
  id:          string
  title:       string
  slug:        string
  tagline:     string
  category:    string
  icdCode?:    string
  status:      DiseaseStatus
  visitCount:  number
  images:      unknown[]
  videos:      unknown[]
  updatedAt?:  Timestamp | string
  publishedAt?: Timestamp | string
}

const CATEGORIES = [
  'All', 'Heart Conditions', 'Arrhythmia', 'Valvular Heart Disease',
  'Vascular Conditions', 'Congenital Heart Disease', 'Lifestyle & Prevention', 'Cardiac Investigations',
]

const STATUSES: (DiseaseStatus | 'all')[] = ['all', 'draft', 'pending_approval', 'changes_requested', 'published', 'archived']
const STATUS_LABELS: Record<DiseaseStatus | 'all', string> = {
  all: 'All', draft: 'Draft', pending_approval: 'Pending', changes_requested: 'Changes Req.', published: 'Published', archived: 'Archived',
}

function fmtDate(v?: Timestamp | string) {
  if (!v) return '—'
  const d = v instanceof Timestamp ? v.toDate() : new Date(v as string)
  return format(d, 'dd MMM yyyy')
}

export default function DiseasesListPage() {
  const [diseases, setDiseases]         = useState<Disease[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [filterStatus, setFilterStatus] = useState<DiseaseStatus | 'all'>('all')
  const [filterCat, setFilterCat]       = useState('All')
  const [sortBy, setSortBy]             = useState<'date' | 'visits'>('date')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const q    = query(collection(db, 'diseases'), orderBy('updatedAt', 'desc'))
    const snap = await getDocs(q)
    setDiseases(snap.docs.map(d => ({ id: d.id, images: [], videos: [], visitCount: 0, ...d.data() } as unknown as Disease)))
    setLoading(false)
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
    await deleteDoc(doc(db, 'diseases', id))
    setDiseases(prev => prev.filter(d => d.id !== id))
    toast.success('Disease article deleted')
  }

  async function submitForApproval(id: string) {
    await updateDoc(doc(db, 'diseases', id), {
      status:      'pending_approval',
      submittedAt: new Date().toISOString(),
    })
    setDiseases(prev => prev.map(d => d.id === id ? { ...d, status: 'pending_approval' } : d))
    toast.success('Submitted for doctor approval')
  }

  const counts = STATUSES.reduce((acc, s) => {
    acc[s] = s === 'all' ? diseases.length : diseases.filter(d => d.status === s).length
    return acc
  }, {} as Record<string, number>)

  let visible = diseases
  if (filterStatus !== 'all') visible = visible.filter(d => d.status === filterStatus)
  if (filterCat !== 'All')    visible = visible.filter(d => d.category === filterCat)
  if (search)                 visible = visible.filter(d =>
    d.title.toLowerCase().includes(search.toLowerCase()) ||
    (d.tagline || '').toLowerCase().includes(search.toLowerCase())
  )
  if (sortBy === 'visits') visible = [...visible].sort((a, b) => (b.visitCount ?? 0) - (a.visitCount ?? 0))

  const totalVisits = diseases.reduce((s, d) => s + (d.visitCount ?? 0), 0)

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Diseases Education</h1>
          <p className="text-sm text-gray-500 mt-0.5">Patient-first disease articles with doctor approval workflow</p>
        </div>
        <Link to="/diseases/new"
          className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" /> Add Disease Article
        </Link>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Articles', value: diseases.length,                                          icon: Stethoscope, color: 'text-primary bg-primary/10' },
          { label: 'Published',      value: diseases.filter(d => d.status === 'published').length,    icon: CheckCircle, color: 'text-green-600 bg-green-50' },
          { label: 'Pending',        value: diseases.filter(d => d.status === 'pending_approval').length, icon: Send, color: 'text-yellow-600 bg-yellow-50' },
          { label: 'Total Visits',   value: totalVisits.toLocaleString(),                             icon: BarChart2,   color: 'text-blue-600 bg-blue-50' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-3">
            <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', s.color)}>
              <s.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className="text-lg font-bold text-gray-900">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              placeholder="Search by title or tagline…"
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-white">
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as 'date' | 'visits')}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-white">
            <option value="date">Sort: Latest</option>
            <option value="visits">Sort: Most Visited</option>
          </select>
        </div>

        {/* Status tabs */}
        <div className="flex flex-wrap gap-1">
          {STATUSES.map(s => (
            <button key={s} type="button"
              onClick={() => setFilterStatus(s)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                filterStatus === s ? 'bg-primary text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
              )}>
              {STATUS_LABELS[s]} ({counts[s] ?? 0})
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : visible.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Stethoscope className="w-7 h-7 text-primary" />
            </div>
            <p className="text-sm font-medium text-gray-700">No disease articles found</p>
            <p className="text-xs text-gray-400 mt-1">Create your first disease article to get started</p>
            <Link to="/diseases/new"
              className="mt-4 inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-medium">
              <Plus className="w-4 h-4" /> Add Disease Article
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Article</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Category</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Media</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Visits</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Updated</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visible.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{d.title}</p>
                      {d.tagline && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{d.tagline}</p>}
                      {d.icdCode && <span className="text-[10px] text-gray-400 font-mono">ICD: {d.icdCode}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-medium">
                        {d.category || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <DiseaseStatusBadge status={d.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><Image className="w-3 h-3" />{(d.images ?? []).length}</span>
                        <span className="flex items-center gap-1"><Video className="w-3 h-3" />{(d.videos ?? []).length}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-700">
                      {(d.visitCount ?? 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(d.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {d.status === 'draft' || d.status === 'changes_requested' ? (
                          <button onClick={() => submitForApproval(d.id)} title="Submit for approval"
                            className="p-1.5 rounded-lg hover:bg-yellow-50 text-yellow-600 transition-colors">
                            <Send className="w-4 h-4" />
                          </button>
                        ) : null}
                        {d.status === 'published' && (
                          <a href={`https://upbeatheart.com/diseases/${d.slug}`} target="_blank" rel="noopener"
                            className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors" title="View live">
                            <Eye className="w-4 h-4" />
                          </a>
                        )}
                        <Link to={`/diseases/${d.id}/edit`}
                          className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors" title="Edit">
                          <Pencil className="w-4 h-4" />
                        </Link>
                        <button onClick={() => handleDelete(d.id, d.title)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition-colors" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
