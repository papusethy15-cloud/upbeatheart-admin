import { useEffect, useState, useMemo } from 'react'
import {
  collection, getDocs, orderBy, query,
  doc, updateDoc, addDoc, serverTimestamp, arrayUnion, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { NGO, MeetingRequest } from '@/types'
import NGOMediaUploader, { type NGOMediaState } from '@/components/ngos/NGOMediaUploader'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import {
  Plus, X, Search, Building2, Mail, Phone, Globe,
  MapPin, ChevronDown, ChevronUp, Calendar, MessageSquare,
  CheckCircle, Clock, XCircle, Filter,
  Users, Activity, AlertCircle,
} from 'lucide-react'

/* ─── helpers ─────────────────────────────────────────── */
const STATUS_CFG = {
  pending:  { label: 'Pending',  cls: 'bg-yellow-50 text-yellow-700 border-yellow-200',  dot: 'bg-yellow-400' },
  approved: { label: 'Approved', cls: 'bg-blue-50   text-blue-700   border-blue-200',    dot: 'bg-blue-500'   },
  active:   { label: 'Active',   cls: 'bg-green-50  text-green-700  border-green-200',   dot: 'bg-green-500'  },
  inactive: { label: 'Inactive', cls: 'bg-gray-50   text-gray-500   border-gray-200',    dot: 'bg-gray-400'   },
} as const

const MTG_CFG = {
  pending:   { icon: Clock,        cls: 'text-yellow-600 bg-yellow-50',  label: 'Pending'   },
  scheduled: { icon: Calendar,     cls: 'text-blue-600   bg-blue-50',    label: 'Scheduled' },
  completed: { icon: CheckCircle,  cls: 'text-green-600  bg-green-50',   label: 'Completed' },
  cancelled: { icon: XCircle,      cls: 'text-red-500    bg-red-50',     label: 'Cancelled' },
} as const

const fmt = (ts: string) => {
  try { return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return ts }
}

const BLANK_FORM = {
  name: '', contactPerson: '', email: '', phone: '',
  address: '', description: '', website: '',
}

/* ─── sub-components ───────────────────────────────────── */
function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-5 flex items-center gap-4">
      <div className={clsx('w-11 h-11 rounded-xl flex items-center justify-center', color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: NGO['status'] }) {
  const cfg = STATUS_CFG[status]
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border capitalize', cfg.cls)}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  )
}

function MeetingBadge({ status }: { status: MeetingRequest['status'] }) {
  const cfg = MTG_CFG[status]
  const Icon = cfg.icon
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium', cfg.cls)}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

/* ─── meeting panel inside expanded row ────────────────── */
function MeetingsPanel({ ngo, onUpdate }: { ngo: NGO; onUpdate: (id: string, requests: MeetingRequest[]) => void }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ date: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const requests = ngo.meetingRequests ?? []

  const handleAdd = async () => {
    if (!form.date) return toast.error('Select a date')
    setSaving(true)
    const newReq: MeetingRequest = { date: form.date, notes: form.notes, status: 'pending' }
    await updateDoc(doc(db, 'ngos', ngo.id), { meetingRequests: arrayUnion(newReq) })
    const updated = [...requests, newReq]
    onUpdate(ngo.id, updated)
    setForm({ date: '', notes: '' })
    setAdding(false)
    setSaving(false)
    toast.success('Meeting request added')
  }

  const updateMtgStatus = async (idx: number, status: MeetingRequest['status']) => {
    const updated = requests.map((r, i) => i === idx ? { ...r, status } : r)
    await updateDoc(doc(db, 'ngos', ngo.id), { meetingRequests: updated })
    onUpdate(ngo.id, updated)
    toast.success('Meeting updated')
  }

  return (
    <div className="px-6 pb-6 pt-1">
      <div className="border-t border-gray-100 pt-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            Meeting Requests
            <span className="ml-1 bg-primary-50 text-primary text-xs font-bold px-2 py-0.5 rounded-full">{requests.length}</span>
          </h3>
          <button
            onClick={() => setAdding(a => !a)}
            className="text-xs text-primary font-medium flex items-center gap-1 hover:underline"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Request
          </button>
        </div>

        {adding && (
          <div className="bg-primary-50/50 border border-primary/20 rounded-xl p-4 mb-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Preferred Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Notes</label>
                <input
                  placeholder="Purpose of meeting…"
                  value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={saving}
                className="bg-primary text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-primary-dark disabled:opacity-60 transition"
              >
                {saving ? 'Saving…' : 'Save Request'}
              </button>
              <button
                onClick={() => setAdding(false)}
                className="text-xs text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {requests.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No meeting requests yet.</p>
        ) : (
          <div className="space-y-2">
            {requests.map((r, i) => (
              <div key={i} className="flex items-start justify-between gap-4 bg-gray-50 rounded-xl px-4 py-3">
                <div className="flex items-start gap-3">
                  <Calendar className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{fmt(r.date)}</p>
                    {r.notes && <p className="text-xs text-gray-500 mt-0.5">{r.notes}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <MeetingBadge status={r.status} />
                  <select
                    value={r.status}
                    onChange={e => updateMtgStatus(i, e.target.value as MeetingRequest['status'])}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none"
                  >
                    <option value="pending">Pending</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── NGO row card ─────────────────────────────────────── */
function NGOCard({
  ngo,
  onStatusChange,
  onMeetingsUpdate,
  onMediaUpdate,
}: {
  ngo: NGO
  onStatusChange: (id: string, status: NGO['status']) => void
  onMeetingsUpdate: (id: string, requests: MeetingRequest[]) => void
  onMediaUpdate: (id: string, media: Partial<Pick<NGO, 'logoUrl' | 'photos' | 'documents'>>) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [mediaTab, setMediaTab] = useState(false)
  const mtgCount = ngo.meetingRequests?.length ?? 0
  const pendingMtg = ngo.meetingRequests?.filter(r => r.status === 'pending').length ?? 0

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden transition-all">
      {/* header row */}
      <div className="flex items-center gap-4 px-5 py-4">
        {/* avatar / logo */}
        <div className="w-10 h-10 rounded-xl overflow-hidden bg-primary-50 flex items-center justify-center shrink-0">
          {ngo.logoUrl
            ? <img src={ngo.logoUrl} alt="" className="w-full h-full object-cover" />
            : <Building2 className="w-5 h-5 text-primary" />}
        </div>

        {/* name + person */}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 text-sm truncate">{ngo.name}</p>
          <p className="text-xs text-gray-500 truncate flex items-center gap-1 mt-0.5">
            <Users className="w-3 h-3" /> {ngo.contactPerson}
          </p>
        </div>

        {/* contact chips */}
        <div className="hidden md:flex items-center gap-3 text-xs text-gray-500">
          {ngo.email && (
            <a href={`mailto:${ngo.email}`} className="flex items-center gap-1 hover:text-primary transition">
              <Mail className="w-3.5 h-3.5" /> {ngo.email}
            </a>
          )}
          {ngo.phone && (
            <a href={`tel:${ngo.phone}`} className="flex items-center gap-1 hover:text-primary transition">
              <Phone className="w-3.5 h-3.5" /> {ngo.phone}
            </a>
          )}
          {ngo.website && (
            <a href={ngo.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary transition">
              <Globe className="w-3.5 h-3.5" /> Website
            </a>
          )}
        </div>

        {/* status badge */}
        <div className="shrink-0">
          <StatusBadge status={ngo.status} />
        </div>

        {/* meeting count */}
        {mtgCount > 0 && (
          <div className="hidden sm:flex items-center gap-1 text-xs text-gray-500 shrink-0">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{mtgCount}</span>
            {pendingMtg > 0 && (
              <span className="ml-1 bg-yellow-100 text-yellow-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {pendingMtg} pending
              </span>
            )}
          </div>
        )}

        {/* status changer */}
        <select
          value={ngo.status}
          onChange={e => onStatusChange(ngo.id, e.target.value as NGO['status'])}
          onClick={e => e.stopPropagation()}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none shrink-0"
        >
          <option value="pending">Pending</option>
          <option value="approved">Approve</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        {/* expand toggle */}
        <button
          onClick={() => setExpanded(p => !p)}
          className="text-gray-400 hover:text-primary transition shrink-0"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* expanded body */}
      {expanded && (
        <div>
          {/* details row */}
          <div className="px-6 pb-4 grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-gray-50 pt-4">
            {ngo.description && (
              <div className="md:col-span-2">
                <p className="text-xs font-medium text-gray-400 mb-1 uppercase tracking-wide">Description</p>
                <p className="text-sm text-gray-700">{ngo.description}</p>
              </div>
            )}
            {ngo.address && (
              <div>
                <p className="text-xs font-medium text-gray-400 mb-1 uppercase tracking-wide">Address</p>
                <p className="text-sm text-gray-700 flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 mt-0.5 text-gray-400 shrink-0" /> {ngo.address}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-gray-400 mb-1 uppercase tracking-wide">Registered</p>
              <p className="text-sm text-gray-700">{fmt(ngo.createdAt)}</p>
            </div>
          </div>

          {/* meetings panel */}
          <MeetingsPanel ngo={ngo} onUpdate={onMeetingsUpdate} />

          {/* ── Media / Documents panel ── */}
          <div className="px-6 pb-6">
            <div className="border-t border-gray-100 pt-5">
              <button
                onClick={() => setMediaTab(m => !m)}
                className="flex items-center justify-between w-full text-left"
              >
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <span>📁</span>
                  Logo, Photos & Documents
                  {((ngo.documents?.length ?? 0) + (ngo.photos?.length ?? 0) + (ngo.logoUrl ? 1 : 0)) > 0 && (
                    <span className="ml-1 bg-primary-50 text-primary text-xs font-bold px-2 py-0.5 rounded-full">
                      {(ngo.documents?.length ?? 0) + (ngo.photos?.length ?? 0) + (ngo.logoUrl ? 1 : 0)}
                    </span>
                  )}
                </h3>
                <span className="text-xs text-gray-400">{mediaTab ? 'Hide' : 'Manage'}</span>
              </button>

              {mediaTab && (
                <div className="mt-4">
                  <NGOMediaUploader
                    value={{
                      logoUrl: ngo.logoUrl ?? '',
                      photos: ngo.photos ?? [],
                      documents: ngo.documents ?? [],
                    }}
                    onChange={async (next) => {
                      await updateDoc(doc(db, 'ngos', ngo.id), {
                        logoUrl: next.logoUrl,
                        photos: next.photos,
                        documents: next.documents,
                      })
                      onMediaUpdate(ngo.id, {
                        logoUrl: next.logoUrl,
                        photos: next.photos,
                        documents: next.documents,
                      })
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── ADD NGO DRAWER ───────────────────────────────────── */
function AddNGODrawer({
  onClose,
  onAdded,
}: {
  onClose: () => void
  onAdded: (ngo: NGO) => void
}) {
  const [form, setForm] = useState(BLANK_FORM)
  const [saving, setSaving] = useState(false)
  const [media, setMedia] = useState<NGOMediaState>({ logoUrl: '', photos: [], documents: [] })

  const set = (key: keyof typeof BLANK_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [key]: e.target.value }))

  const handleCreate = async () => {
    if (!form.name.trim()) return toast.error('NGO name is required')
    setSaving(true)
    try {
      const ref = await addDoc(collection(db, 'ngos'), {
        ...form,
        status: 'pending',
        meetingRequests: [],
        logoUrl: media.logoUrl || null,
        photos: media.photos,
        documents: media.documents,
        createdAt: serverTimestamp(),
      })
      const newNGO: NGO = {
        id: ref.id,
        ...form,
        status: 'pending',
        meetingRequests: [],
        logoUrl: media.logoUrl || undefined,
        photos: media.photos,
        documents: media.documents,
        createdAt: new Date().toISOString(),
      }
      onAdded(newNGO)
      toast.success('NGO added successfully')
      onClose()
    } catch {
      toast.error('Failed to add NGO')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* backdrop */}
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      {/* drawer */}
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">Add NGO Partner</h2>
            <p className="text-xs text-gray-500 mt-0.5">New NGO starts as pending review</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* fields */}
          {([
            { label: 'NGO Name *', key: 'name', placeholder: 'Heart Care Foundation' },
            { label: 'Contact Person', key: 'contactPerson', placeholder: 'Full name' },
            { label: 'Email Address', key: 'email', placeholder: 'contact@ngo.org' },
            { label: 'Phone Number', key: 'phone', placeholder: '+91 9876543210' },
            { label: 'Website', key: 'website', placeholder: 'https://ngo.org' },
          ] as { label: string; key: keyof typeof BLANK_FORM; placeholder: string }[]).map(f => (
            <div key={f.key}>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">{f.label}</label>
              <input
                placeholder={f.placeholder}
                value={form[f.key]}
                onChange={set(f.key)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
              />
            </div>
          ))}

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Address</label>
            <input
              placeholder="City, State"
              value={form.address}
              onChange={set('address')}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Description</label>
            <textarea
              placeholder="Brief description of the NGO and their work…"
              value={form.description}
              onChange={set('description')}
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none transition"
            />
          </div>

          {/* media upload section */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-600 mb-3 flex items-center gap-1.5">
              <span>📁</span> Logo, Photos & Documents
              <span className="font-normal text-gray-400">(optional)</span>
            </p>
            <NGOMediaUploader value={media} onChange={setMedia} />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={handleCreate}
            disabled={saving}
            className="flex-1 bg-primary text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-dark disabled:opacity-60 transition"
          >
            {saving ? 'Adding…' : 'Add NGO Partner'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── MAIN PAGE ────────────────────────────────────────── */
export default function NGOsPage() {
  const [ngos, setNgos] = useState<NGO[]>([])
  const [loading, setLoading] = useState(true)
  const [showDrawer, setShowDrawer] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<NGO['status'] | 'all'>('all')

  /* fetch */
  useEffect(() => {
    async function load() {
      const q = query(collection(db, 'ngos'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      setNgos(snap.docs.map(d => {
        const data = d.data()
        // normalize Firestore Timestamp to ISO string
        const createdAt = data.createdAt instanceof Timestamp
          ? data.createdAt.toDate().toISOString()
          : (data.createdAt ?? '')
        return { id: d.id, ...data, createdAt } as NGO
      }))
      setLoading(false)
    }
    load()
  }, [])

  /* derived stats */
  const stats = useMemo(() => ({
    total:    ngos.length,
    active:   ngos.filter(n => n.status === 'active').length,
    pending:  ngos.filter(n => n.status === 'pending').length,
    meetings: ngos.reduce((acc, n) => acc + (n.meetingRequests?.filter(r => r.status === 'pending').length ?? 0), 0),
  }), [ngos])

  /* filtered list */
  const filtered = useMemo(() => {
    return ngos.filter(n => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        n.name.toLowerCase().includes(q) ||
        n.contactPerson?.toLowerCase().includes(q) ||
        n.email?.toLowerCase().includes(q)
      const matchStatus = filterStatus === 'all' || n.status === filterStatus
      return matchSearch && matchStatus
    })
  }, [ngos, search, filterStatus])

  /* handlers */
  const updateStatus = async (id: string, status: NGO['status']) => {
    await updateDoc(doc(db, 'ngos', id), { status })
    setNgos(prev => prev.map(n => n.id === id ? { ...n, status } : n))
    toast.success(`NGO marked as ${status}`)
  }

  const updateMeetings = (id: string, requests: MeetingRequest[]) => {
    setNgos(prev => prev.map(n => n.id === id ? { ...n, meetingRequests: requests } : n))
  }

  const updateMedia = (id: string, media: Partial<Pick<NGO, 'logoUrl' | 'photos' | 'documents'>>) => {
    setNgos(prev => prev.map(n => n.id === id ? { ...n, ...media } : n))
    toast.success('Media saved')
  }

  return (
    <div className="space-y-6">
      {/* page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">NGO Partners</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage NGO registrations, approvals, and meeting requests</p>
        </div>
        <button
          onClick={() => setShowDrawer(true)}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-dark transition shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add NGO
        </button>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Building2}   label="Total NGOs"       value={stats.total}    color="bg-primary-50 text-primary" />
        <StatCard icon={Activity}    label="Active Partners"  value={stats.active}   color="bg-green-50 text-green-600" />
        <StatCard icon={AlertCircle} label="Pending Review"   value={stats.pending}  color="bg-yellow-50 text-yellow-600" />
        <StatCard icon={Calendar}    label="Pending Meetings" value={stats.meetings} color="bg-accent/10 text-accent" />
      </div>

      {/* filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            placeholder="Search by name, contact, or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white transition"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          {(['all', 'pending', 'approved', 'active', 'inactive'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={clsx(
                'px-3 py-2 rounded-xl text-xs font-medium transition capitalize',
                filterStatus === s
                  ? 'bg-primary text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-primary/40'
              )}
            >
              {s === 'all' ? 'All' : STATUS_CFG[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm gap-2">
          <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          Loading NGOs…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Building2 className="w-12 h-12 text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium">
            {search || filterStatus !== 'all' ? 'No NGOs match your filters' : 'No NGOs registered yet'}
          </p>
          <p className="text-gray-400 text-sm mt-1">
            {search || filterStatus !== 'all' ? 'Try adjusting your search or filter' : 'Click "Add NGO" to register the first partner'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(ngo => (
            <NGOCard
              key={ngo.id}
              ngo={ngo}
              onStatusChange={updateStatus}
              onMeetingsUpdate={updateMeetings}
              onMediaUpdate={updateMedia}
            />
          ))}
          <p className="text-xs text-gray-400 text-center pt-1">
            Showing {filtered.length} of {ngos.length} NGOs
          </p>
        </div>
      )}

      {/* drawer */}
      {showDrawer && (
        <AddNGODrawer
          onClose={() => setShowDrawer(false)}
          onAdded={ngo => setNgos(prev => [ngo, ...prev])}
        />
      )}
    </div>
  )
}
