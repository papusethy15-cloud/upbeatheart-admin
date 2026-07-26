/**
 * ReviewsPage — Advanced Reviews Manager
 * Features:
 *  • Modal-based Add/Edit form with real Cloudinary uploads (photo + video)
 *  • Drag-and-drop + click-to-browse for both photo and video
 *  • DropZone: Replace button re-opens file picker without clearing preview first
 *  • Live upload progress bars
 *  • Stats row (total · pending · published · avg rating)
 *  • Rating distribution bars (clickable filter)
 *  • Tab filter (All / Pending / Published / Archived) with counts
 *  • Search by name or text
 *  • Review cards: patient avatar photo, star row, video inline player
 *  • Contextual quick-action buttons (Publish / Pending / Archive)
 *  • Hard Delete with confirmation dialog
 *  • Inline lightbox for photo and video preview
 *  • Firestore Timestamp-safe date formatting
 */

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import {
  collection, getDocs, orderBy, query,
  doc, updateDoc, addDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Review } from '@/types'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import ImageCropUpload from '@/components/upload/ImageCropUpload'
import {
  Plus, X, Star, Search, MessageSquare,
  CheckCircle, Clock, Archive, ExternalLink,
  Play, ThumbsUp, Filter, BarChart2,
  Loader2, AlertCircle, Image as ImageIcon,
  Video, Trash2, Eye, Pencil, RefreshCw,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════
   CLOUDINARY
═══════════════════════════════════════════════════════════ */
const CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'boc8bvoc'
const IMG_PRESET = 'upbeat_public'
const VID_PRESET = 'upbeat_public'

type UpState = 'idle' | 'uploading' | 'done' | 'error'
interface UpItem { id: string; file: File; status: UpState; progress: number; url?: string; error?: string }

async function uploadCloudinary(
  file: File,
  type: 'image' | 'video',
  onProgress: (p: number) => void,
): Promise<string> {
  const preset = type === 'image' ? IMG_PRESET : VID_PRESET
  const folder = type === 'image' ? 'upbeatheart/reviews' : 'upbeatheart/review-videos'
  const fd = new FormData()
  fd.append('file', file)
  fd.append('upload_preset', preset)
  fd.append('folder', folder)
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD}/${type}/upload`)
    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    })
    xhr.addEventListener('load', () => {
      try {
        const d = JSON.parse(xhr.responseText)
        if (d.error) return reject(new Error(d.error.message))
        resolve(d.secure_url as string)
      } catch { reject(new Error('Parse error')) }
    })
    xhr.addEventListener('error', () => reject(new Error('Network error')))
    xhr.send(fd)
  })
}

/* ═══════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════ */
function fmtDate(raw: unknown) {
  if (!raw) return '—'
  try {
    let d: Date
    if (raw && typeof raw === 'object' && 'seconds' in raw)
      d = new Date((raw as { seconds: number }).seconds * 1000)
    else d = new Date(raw as string)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return '—' }
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
}

function avatarBg(r: number) {
  return r >= 4 ? 'bg-green-100 text-green-700' : r === 3 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
}

/* ═══════════════════════════════════════════════════════════
   DELETE CONFIRMATION DIALOG
═══════════════════════════════════════════════════════════ */
function DeleteConfirmDialog({
  review,
  onConfirm,
  onCancel,
  deleting,
}: {
  review: Review
  onConfirm: () => void
  onCancel: () => void
  deleting: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        {/* icon */}
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto">
          <Trash2 className="w-6 h-6 text-red-500" />
        </div>

        {/* text */}
        <div className="text-center space-y-1">
          <h3 className="text-base font-bold text-gray-900">Delete Review?</h3>
          <p className="text-sm text-gray-500">
            This will permanently remove the review by{' '}
            <span className="font-semibold text-gray-700">{review.patientName}</span>.
            This action cannot be undone.
          </p>
        </div>

        {/* warning note */}
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-xs text-red-600 leading-relaxed">
          ⚠️ The review will be deleted from Firestore. Cloudinary media files (photo/video) are
          NOT deleted automatically — remove them from the Cloudinary dashboard if needed.
        </div>

        {/* actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {deleting ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</> : 'Yes, Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   SUB-COMPONENTS
═══════════════════════════════════════════════════════════ */

/* Star row display */
function StarRow({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5'
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={clsx(cls, i < rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200')} />
      ))}
    </div>
  )
}

/* Interactive star picker */
function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => {
        const n = i + 1
        return (
          <button key={n} type="button"
            onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
            onClick={() => onChange(n)}
            className="focus:outline-none transition-transform hover:scale-110">
            <Star className={clsx('w-7 h-7 transition-colors',
              n <= (hover || value) ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'
            )} />
          </button>
        )
      })}
      <span className="ml-2 text-sm text-gray-500 font-semibold">{value} / 5</span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   DROP ZONE — fixed Replace flow
═══════════════════════════════════════════════════════════ */
function DropZone({
  type, currentUrl, onUpload, onClear,
}: {
  type: 'image' | 'video'
  currentUrl: string
  onUpload: (url: string) => void
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [item, setItem] = useState<UpItem | null>(null)
  const [dragging, setDragging] = useState(false)

  const processFile = useCallback(async (file: File) => {
    // Clear the old URL first so the UI shows we're replacing
    onClear()
    const id = `${Date.now()}`
    const newItem: UpItem = { id, file, status: 'uploading', progress: 0 }
    setItem(newItem)
    try {
      const url = await uploadCloudinary(file, type, pct =>
        setItem(prev => prev ? { ...prev, progress: pct } : prev)
      )
      setItem(prev => prev ? { ...prev, status: 'done', url } : prev)
      onUpload(url)
      toast.success(`${type === 'image' ? 'Photo' : 'Video'} uploaded`)
      setTimeout(() => setItem(null), 2500)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setItem(prev => prev ? { ...prev, status: 'error', error: msg } : prev)
      toast.error(msg)
    }
  }, [type, onUpload, onClear])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  // "Replace" — open picker directly without clearing preview yet
  const triggerReplace = () => inputRef.current?.click()

  const isImg = type === 'image'
  const accentBorder = isImg ? 'border-primary/40' : 'border-purple-400/40'
  const accentBg    = isImg ? 'bg-primary/5'      : 'bg-purple-50/50'
  const icon = isImg ? <ImageIcon className="w-7 h-7" /> : <Video className="w-7 h-7" />
  const accept = isImg ? 'image/*' : 'video/*'
  const hint = isImg ? 'JPG · PNG · WebP' : 'MP4 · MOV · WebM'

  return (
    <div className="space-y-3">

      {/* ── hidden file input (shared by both drop-zone and Replace button) ── */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) processFile(f)
          e.target.value = ''
        }}
      />

      {/* ── preview of existing / just-uploaded media ── */}
      {currentUrl && !item && (
        <div className="relative group rounded-xl overflow-hidden border border-gray-100 bg-gray-50">
          {isImg ? (
            <img src={currentUrl} alt="" className="w-full h-40 object-cover" />
          ) : (
            <video src={currentUrl} className="w-full h-40 object-cover bg-black" controls />
          )}

          {/* top-left: open in new tab */}
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-2 left-2 p-1.5 bg-black/50 text-white rounded-lg opacity-0 group-hover:opacity-100 transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          {/* top-right: remove entirely */}
          <button
            onClick={onClear}
            className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition shadow"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* bottom-right: replace without losing preview first */}
          <button
            onClick={triggerReplace}
            className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2.5 py-1 bg-black/60 text-white text-[11px] font-medium rounded-lg opacity-0 group-hover:opacity-100 transition"
          >
            <RefreshCw className="w-3 h-3" />
            Replace
          </button>
        </div>
      )}

      {/* ── drop zone — only shown when no current media and not uploading ── */}
      {!currentUrl && !item && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={clsx(
            'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition group',
            dragging
              ? `${accentBorder} ${accentBg}`
              : `border-gray-200 hover:${accentBorder} hover:${accentBg}`
          )}
        >
          <div className={clsx(
            'mx-auto mb-2 transition',
            isImg ? 'text-gray-300 group-hover:text-primary/50' : 'text-gray-300 group-hover:text-purple-400'
          )}>
            {icon}
          </div>
          <p className="text-sm font-medium text-gray-500">
            Drop {isImg ? 'a photo' : 'a video'} or{' '}
            <span className={isImg ? 'text-primary' : 'text-purple-500'}>browse</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">{hint}</p>
        </div>
      )}

      {/* ── upload progress ── */}
      {item && (
        <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span className="truncate max-w-[200px] font-medium">{item.file.name}</span>
            <span className="flex-shrink-0 ml-2">
              {item.status === 'uploading' && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
              {item.status === 'done'      && <CheckCircle className="w-4 h-4 text-emerald-500" />}
              {item.status === 'error'     && <AlertCircle className="w-4 h-4 text-red-500" />}
            </span>
          </div>
          {item.status === 'uploading' && (
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${item.progress}%` }} />
            </div>
          )}
          {item.status === 'error' && <p className="text-[11px] text-red-500">{item.error}</p>}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   REVIEW MODAL (Add / Edit)
═══════════════════════════════════════════════════════════ */
type FormState = {
  patientName: string
  rating: number
  text: string
  photoURL: string
  videoURL: string
}

function ReviewModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: Review
  onSave: (data: Omit<Review, 'id' | 'createdAt' | 'source' | 'status'> & { id?: string }) => Promise<void>
  onClose: () => void
}) {
  const isEdit = !!initial
  const [form, setForm] = useState<FormState>({
    patientName: initial?.patientName ?? '',
    rating:      initial?.rating      ?? 5,
    text:        initial?.text        ?? '',
    photoURL:    initial?.photoURL    ?? '',
    videoURL:    initial?.videoURL    ?? '',
  })
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const handleSave = async () => {
    if (!form.patientName.trim()) return toast.error('Patient name is required')
    if (!form.text.trim())        return toast.error('Review text is required')
    setSaving(true)
    try {
      await onSave({ ...(isEdit ? { id: initial!.id } : {}), ...form })
      onClose()
    } finally { setSaving(false) }
  }

  const onBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onBackdrop}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col">

        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">{isEdit ? 'Edit Review' : 'Add Review'}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {isEdit ? `Editing review by ${initial!.patientName}` : 'New patient testimonial'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Patient name */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
              Patient Name <span className="text-red-400">*</span>
            </label>
            <input
              value={form.patientName}
              onChange={e => set('patientName', e.target.value)}
              placeholder="e.g. Ramesh Kumar"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Rating */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
              Rating <span className="text-red-400">*</span>
            </label>
            <StarPicker value={form.rating} onChange={n => set('rating', n)} />
          </div>

          {/* Review text */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
              Review Text <span className="text-red-400">*</span>
            </label>
            <textarea
              value={form.text}
              onChange={e => set('text', e.target.value)}
              placeholder="Patient's testimonial in their own words…"
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>

          {/* Patient Photo */}
          <div>
            <ImageCropUpload
              preset="upbeat_public"
              label="Patient Photo"
              hint="Optional avatar shown next to the review card on the website (44×44px circle)"
              targetW={200}
              targetH={200}
              aspectLabel="1:1"
              websiteUsage="Review card avatar (w-11 h-11 rounded-full)"
              value={form.photoURL}
              onChange={url => set('photoURL', url)}
              onRemove={() => set('photoURL', '')}
            />
          </div>

          {/* Video Testimonial */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
              Video Testimonial <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <DropZone
              type="video"
              currentUrl={form.videoURL}
              onUpload={url => set('videoURL', url)}
              onClear={() => set('videoURL', '')}
            />
          </div>

        </div>

        {/* footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/60 rounded-b-2xl flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-primary text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition flex items-center justify-center gap-2">
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : isEdit ? 'Save Changes' : 'Add Review'}
          </button>
          <button onClick={onClose}
            className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-100 transition">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   INLINE VIDEO PLAYER MODAL
═══════════════════════════════════════════════════════════ */
function VideoModal({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="max-w-2xl w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-white/80 text-sm font-medium truncate">{name}</p>
          <div className="flex items-center gap-2">
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="p-1.5 bg-white/10 rounded-lg hover:bg-white/20 transition text-white">
              <ExternalLink className="w-4 h-4" />
            </a>
            <button onClick={onClose} className="p-1.5 bg-white/10 rounded-lg hover:bg-white/20 transition text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <video src={url} controls autoPlay className="w-full max-h-[70vh] rounded-2xl bg-black shadow-2xl" />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════ */
type TabKey = 'all' | 'pending' | 'published' | 'archived'

const statusCls: Record<Review['status'], string> = {
  published: 'bg-green-50 text-green-700 border-green-200',
  pending:   'bg-amber-50 text-amber-700 border-amber-200',
  archived:  'bg-red-50 text-red-500 border-red-200',
}

export default function ReviewsPage() {
  const [reviews, setReviews]           = useState<Review[]>([])
  const [loading, setLoading]           = useState(true)
  const [tab, setTab]                   = useState<TabKey>('all')
  const [search, setSearch]             = useState('')
  const [ratingFilter, setRatingFilter] = useState(0)
  const [modalReview, setModalReview]   = useState<Review | 'new' | null>(null)
  const [videoPreview, setVideoPreview] = useState<{ url: string; name: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Review | null>(null)
  const [deleting, setDeleting]         = useState(false)

  useEffect(() => {
    async function load() {
      const q = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() } as Review)))
      setLoading(false)
    }
    load()
  }, [])

  /* stats */
  const stats = useMemo(() => {
    const pub = reviews.filter(r => r.status === 'published')
    const avg = pub.length
      ? (pub.reduce((s, r) => s + r.rating, 0) / pub.length).toFixed(1)
      : '—'
    const dist = [5, 4, 3, 2, 1].map(n => ({ star: n, count: pub.filter(r => r.rating === n).length }))
    return {
      total:     reviews.length,
      pending:   reviews.filter(r => r.status === 'pending').length,
      published: pub.length,
      archived:  reviews.filter(r => r.status === 'archived').length,
      avg, dist,
    }
  }, [reviews])

  /* filtered list */
  const visible = useMemo(() => reviews.filter(r => {
    if (tab !== 'all' && r.status !== tab) return false
    if (ratingFilter > 0 && r.rating !== ratingFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!r.patientName.toLowerCase().includes(q) && !r.text.toLowerCase().includes(q)) return false
    }
    return true
  }), [reviews, tab, search, ratingFilter])

  /* save (add / edit) */
  const handleSave = async (data: Omit<Review, 'id' | 'createdAt' | 'source' | 'status'> & { id?: string }) => {
    const { id, ...fields } = data
    if (id) {
      await updateDoc(doc(db, 'reviews', id), { ...fields })
      setReviews(prev => prev.map(r => r.id === id ? { ...r, ...fields } : r))
      toast.success('Review updated')
    } else {
      const ref = await addDoc(collection(db, 'reviews'), {
        ...fields,
        source: 'manual',
        status: 'pending',
        createdAt: serverTimestamp(),
      })
      setReviews(prev => [{
        id: ref.id, ...fields,
        source: 'manual', status: 'pending',
        createdAt: new Date().toISOString(),
      } as Review, ...prev])
      toast.success('Review added — pending approval')
    }
  }

  /* status change */
  const updateStatus = async (id: string, status: Review['status']) => {
    await updateDoc(doc(db, 'reviews', id), { status })
    setReviews(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    const labels: Record<Review['status'], string> = {
      published: 'Published ✓',
      archived:  'Archived',
      pending:   'Moved to Pending',
    }
    toast.success(labels[status])
  }

  /* hard delete */
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteDoc(doc(db, 'reviews', deleteTarget.id))
      setReviews(prev => prev.filter(r => r.id !== deleteTarget.id))
      toast.success(`Review by ${deleteTarget.patientName} deleted`)
      setDeleteTarget(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Delete failed'
      toast.error(msg)
    } finally {
      setDeleting(false)
    }
  }

  const TABS: { key: TabKey; label: string; count?: number }[] = [
    { key: 'all',       label: 'All' },
    { key: 'pending',   label: 'Pending',   count: stats.pending },
    { key: 'published', label: 'Published', count: stats.published },
    { key: 'archived',  label: 'Archived',  count: stats.archived },
  ]

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Patient Reviews</h1>
          <p className="text-gray-500 text-sm mt-0.5">Curate testimonials that appear on the public site</p>
        </div>
        <button
          onClick={() => setModalReview('new')}
          className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition shadow-sm">
          <Plus className="w-4 h-4" /> Add Review
        </button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total',      value: stats.total,     icon: <MessageSquare className="w-5 h-5" />,         cls: 'text-primary bg-blue-50' },
          { label: 'Pending',    value: stats.pending,   icon: <Clock className="w-5 h-5" />,                 cls: 'text-amber-600 bg-amber-50' },
          { label: 'Published',  value: stats.published, icon: <ThumbsUp className="w-5 h-5" />,              cls: 'text-green-600 bg-green-50' },
          { label: 'Avg Rating', value: stats.avg,       icon: <Star className="w-5 h-5 fill-current" />,     cls: 'text-amber-500 bg-amber-50' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', s.cls)}>{s.icon}</div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Rating Distribution ── */}
      {stats.published > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-gray-400" /> Rating Breakdown
            </h2>
            {ratingFilter > 0 && (
              <button onClick={() => setRatingFilter(0)}
                className="text-xs text-primary hover:underline">Clear filter</button>
            )}
          </div>
          <div className="space-y-1.5">
            {stats.dist.map(d => {
              const pct = stats.published ? Math.round((d.count / stats.published) * 100) : 0
              return (
                <button key={d.star} onClick={() => setRatingFilter(ratingFilter === d.star ? 0 : d.star)}
                  className={clsx('w-full flex items-center gap-3 rounded-xl p-1.5 transition',
                    ratingFilter === d.star ? 'bg-amber-50' : 'hover:bg-gray-50')}>
                  <span className="text-xs font-semibold text-gray-500 w-4">{d.star}</span>
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400 flex-shrink-0" />
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-400 w-5 text-right">{d.count}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* tab bar */}
        <div className="flex items-center bg-white border border-gray-100 rounded-xl p-1 shadow-sm gap-0.5 flex-shrink-0">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition',
                tab === t.key ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50')}>
              {t.label}
              {t.count !== undefined && (
                <span className={clsx('px-1.5 py-0.5 rounded-full text-[10px] font-bold',
                  tab === t.key ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-500')}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
        {/* search */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or text…"
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        {/* rating filter chip */}
        {ratingFilter > 0 && (
          <button onClick={() => setRatingFilter(0)}
            className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl hover:bg-amber-100 transition flex-shrink-0">
            <Filter className="w-3.5 h-3.5" /> {ratingFilter}★ only <X className="w-3 h-3 ml-0.5" />
          </button>
        )}
      </div>

      {/* ── Reviews List ── */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <MessageSquare className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No reviews match your filters.</p>
          {(tab !== 'all' || search || ratingFilter > 0) && (
            <button onClick={() => { setTab('all'); setSearch(''); setRatingFilter(0) }}
              className="mt-3 text-xs text-primary hover:underline">Clear all filters</button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {visible.map(r => (
            <div key={r.id}
              className={clsx(
                'bg-white rounded-2xl border border-gray-100 shadow-sm p-5 transition hover:shadow-md',
                r.status === 'archived' && 'opacity-60'
              )}>
              <div className="flex items-start gap-4">
                {/* avatar or photo */}
                {r.photoURL ? (
                  <img
                    src={r.photoURL} alt={r.patientName}
                    className="w-12 h-12 rounded-full object-cover flex-shrink-0 border-2 border-white shadow-sm cursor-pointer"
                    onClick={() => window.open(r.photoURL, '_blank')}
                  />
                ) : (
                  <div className={clsx('w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0', avatarBg(r.rating))}>
                    {initials(r.patientName)}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  {/* name + badges */}
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="font-semibold text-gray-900 text-sm">{r.patientName}</span>
                    <span className="inline-flex items-center text-[10px] font-semibold bg-gray-50 text-gray-500 border border-gray-100 px-2 py-0.5 rounded-full capitalize">
                      {r.source}
                    </span>
                    <span className={clsx('px-2.5 py-0.5 rounded-full text-[10px] font-semibold border capitalize', statusCls[r.status])}>
                      {r.status}
                    </span>
                    {r.videoURL && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-purple-50 text-purple-600 border border-purple-100 px-2 py-0.5 rounded-full">
                        <Video className="w-2.5 h-2.5" /> Video
                      </span>
                    )}
                    {r.photoURL && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full">
                        <ImageIcon className="w-2.5 h-2.5" /> Photo
                      </span>
                    )}
                  </div>

                  {/* stars + date */}
                  <div className="flex items-center gap-3 mb-2.5">
                    <StarRow rating={r.rating} size="md" />
                    <span className="text-xs text-gray-400">{fmtDate(r.createdAt)}</span>
                  </div>

                  {/* review text */}
                  <p className="text-gray-700 text-sm leading-relaxed mb-3">{r.text}</p>

                  {/* video preview button */}
                  {r.videoURL && (
                    <button
                      onClick={() => setVideoPreview({ url: r.videoURL!, name: r.patientName })}
                      className="mb-3 inline-flex items-center gap-1.5 text-xs text-purple-700 bg-purple-50 border border-purple-200 px-3 py-1.5 rounded-lg hover:bg-purple-100 transition font-medium">
                      <Play className="w-3.5 h-3.5 fill-purple-700" /> Play video testimonial
                    </button>
                  )}

                  {/* actions */}
                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-50">
                    {/* edit */}
                    <button onClick={() => setModalReview(r)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>

                    {/* publish */}
                    {r.status !== 'published' && (
                      <button onClick={() => updateStatus(r.id, 'published')}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100 transition">
                        <CheckCircle className="w-3.5 h-3.5" /> Publish
                      </button>
                    )}

                    {/* unpublish */}
                    {r.status === 'published' && (
                      <button onClick={() => updateStatus(r.id, 'pending')}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition">
                        <Clock className="w-3.5 h-3.5" /> Unpublish
                      </button>
                    )}

                    {/* archive */}
                    {r.status !== 'archived' && (
                      <button onClick={() => updateStatus(r.id, 'archived')}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition">
                        <Archive className="w-3.5 h-3.5" /> Archive
                      </button>
                    )}

                    {/* restore from archived */}
                    {r.status === 'archived' && (
                      <button onClick={() => updateStatus(r.id, 'pending')}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition">
                        <Eye className="w-3.5 h-3.5" /> Restore
                      </button>
                    )}

                    {/* hard delete — always visible, right-aligned */}
                    <button
                      onClick={() => setDeleteTarget(r)}
                      className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-red-500 bg-red-50 border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-100 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Review Modal ── */}
      {modalReview && (
        <ReviewModal
          initial={modalReview === 'new' ? undefined : modalReview}
          onSave={handleSave}
          onClose={() => setModalReview(null)}
        />
      )}

      {/* ── Video Player Modal ── */}
      {videoPreview && (
        <VideoModal
          url={videoPreview.url}
          name={videoPreview.name}
          onClose={() => setVideoPreview(null)}
        />
      )}

      {/* ── Delete Confirm Dialog ── */}
      {deleteTarget && (
        <DeleteConfirmDialog
          review={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}

    </div>
  )
}
