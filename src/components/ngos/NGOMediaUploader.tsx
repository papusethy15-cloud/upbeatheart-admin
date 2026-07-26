/**
 * NGOMediaUploader
 * Handles logo, gallery photos, and proof documents for NGO partners.
 *
 * Cloudinary config (same cloud as rest of project):
 *   Preset : upbeat_public (unsigned)
 *   Folders:
 *     upbeatheart/ngos/logos     → NGO logo / profile image
 *     upbeatheart/ngos/photos    → gallery / activity photos
 *     upbeatheart/ngos/documents → registration cert, MoU, proof PDFs
 */
import { useState, useRef } from 'react'
import {
  Upload, X, Image as ImageIcon, FileText, Loader2,
  CheckCircle, AlertCircle, Trash2, Eye, Plus, Star,
} from 'lucide-react'
import clsx from 'clsx'
import type { NGODocument } from '@/types'

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'boc8bvoc'
const PRESET = 'upbeat_public'

/* ── types ─────────────────────────────────────────────── */
type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'

interface QueueItem {
  uid: string
  file: File
  status: UploadStatus
  progress: number
  result?: NGODocument
  error?: string
}

export interface NGOMediaState {
  logoUrl: string
  photos: string[]
  documents: NGODocument[]
}

interface Props {
  value: NGOMediaState
  onChange: (next: NGOMediaState) => void
  compact?: boolean   // when true: collapsed inside NGO card
}

/* ── helpers ────────────────────────────────────────────── */
function fmtBytes(b: number) {
  if (!b) return ''
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function isImage(file: File) {
  return file.type.startsWith('image/')
}



async function cloudinaryUpload(
  file: File,
  folder: string,
  onProgress: (pct: number) => void,
): Promise<{ url: string; publicId: string; bytes: number }> {
  const resourceType = isImage(file) ? 'image' : 'raw'
  const fd = new FormData()
  fd.append('file', file)
  fd.append('upload_preset', PRESET)
  fd.append('folder', folder)

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`)
    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    })
    xhr.addEventListener('load', () => {
      try {
        const d = JSON.parse(xhr.responseText)
        if (d.error) return reject(new Error(d.error.message))
        resolve({ url: d.secure_url, publicId: d.public_id, bytes: d.bytes ?? file.size })
      } catch { reject(new Error('Parse error')) }
    })
    xhr.addEventListener('error', () => reject(new Error('Network error')))
    xhr.send(fd)
  })
}

/* ── UploadZone ─────────────────────────────────────────── */
function UploadZone({
  label, hint, accept, onFiles, color = 'blue',
}: {
  label: string
  hint: string
  accept: string
  onFiles: (files: FileList) => void
  color?: 'blue' | 'orange' | 'teal'
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const colors = {
    blue:   { border: 'border-blue-200 hover:border-blue-400',   bg: 'hover:bg-blue-50',   icon: 'text-blue-300 group-hover:text-blue-400',   text: 'text-blue-500' },
    orange: { border: 'border-orange-200 hover:border-orange-400', bg: 'hover:bg-orange-50', icon: 'text-orange-300 group-hover:text-orange-400', text: 'text-orange-500' },
    teal:   { border: 'border-teal-200 hover:border-teal-400',   bg: 'hover:bg-teal-50',   icon: 'text-teal-300 group-hover:text-teal-400',   text: 'text-teal-500' },
  }[color]

  return (
    <div>
      <input ref={ref} type="file" multiple accept={accept} className="hidden"
        onChange={e => { if (e.target.files) { onFiles(e.target.files); e.target.value = '' } }} />
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files) onFiles(e.dataTransfer.files) }}
        onClick={() => ref.current?.click()}
        className={clsx(
          'group border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition',
          colors.border, colors.bg,
          dragging && 'scale-[1.01] shadow-inner',
        )}
      >
        <Upload className={clsx('w-6 h-6 mx-auto mb-1.5 transition', colors.icon)} />
        <p className="text-sm font-medium text-gray-600">
          {label} or <span className={colors.text}>browse</span>
        </p>
        <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
      </div>
    </div>
  )
}

/* ── QueueRow ────────────────────────────────────────────── */
function QueueRow({ item }: { item: QueueItem }) {
  return (
    <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
      <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center shrink-0">
        {isImage(item.file)
          ? <ImageIcon className="w-4 h-4 text-gray-400" />
          : <FileText className="w-4 h-4 text-gray-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-700 truncate">{item.file.name}</p>
        {item.status === 'uploading' && (
          <div className="mt-1 w-full bg-gray-200 rounded-full h-1">
            <div className="bg-primary h-1 rounded-full transition-all duration-300"
              style={{ width: `${item.progress}%` }} />
          </div>
        )}
        {item.status === 'error' && (
          <p className="text-[10px] text-red-500 mt-0.5">{item.error}</p>
        )}
      </div>
      <div className="shrink-0">
        {item.status === 'uploading' && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
        {item.status === 'done' && <CheckCircle className="w-4 h-4 text-emerald-500" />}
        {item.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
      </div>
    </div>
  )
}

/* ── Main component ─────────────────────────────────────── */
export default function NGOMediaUploader({ value, onChange }: Props) {
  const [tab, setTab] = useState<'logo' | 'photos' | 'docs'>('logo')
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [preview, setPreview] = useState<{ url: string; type: 'image' | 'pdf' } | null>(null)
  const [docLabel, setDocLabel] = useState('')

  const isUploading = queue.some(q => q.status === 'uploading')

  /* ── upload driver ── */
  const enqueue = async (files: FileList, kind: 'logo' | 'photo' | 'doc') => {
    const folder =
      kind === 'logo'  ? 'upbeatheart/ngos/logos'     :
      kind === 'photo' ? 'upbeatheart/ngos/photos'    :
                         'upbeatheart/ngos/documents'

    const arr = Array.from(files)
    const items: QueueItem[] = arr.map(f => ({
      uid: `${Date.now()}-${Math.random()}`, file: f, status: 'idle', progress: 0,
    }))
    setQueue(prev => [...prev, ...items])

    for (const item of items) {
      setQueue(prev => prev.map(q => q.uid === item.uid ? { ...q, status: 'uploading' } : q))
      try {
        const { url, publicId, bytes } = await cloudinaryUpload(
          item.file, folder,
          pct => setQueue(prev => prev.map(q => q.uid === item.uid ? { ...q, progress: pct } : q)),
        )

        const ngoDoc: NGODocument = {
          url, publicId, bytes,
          name: item.file.name,
          type: isImage(item.file) ? 'image' : 'document',
          label: docLabel || undefined,
          uploadedAt: new Date().toISOString(),
        }

        setQueue(prev => prev.map(q => q.uid === item.uid ? { ...q, status: 'done', result: ngoDoc } : q))

        if (kind === 'logo') {
          onChange({ ...value, logoUrl: url })
        } else if (kind === 'photo') {
          onChange({ ...value, photos: [...value.photos, url] })
        } else {
          onChange({ ...value, documents: [...value.documents, ngoDoc] })
        }
      } catch (err: any) {
        setQueue(prev => prev.map(q => q.uid === item.uid ? { ...q, status: 'error', error: err.message } : q))
      }
    }

    // clear done items after 4s
    setTimeout(() => setQueue(prev => prev.filter(q => q.status !== 'done')), 4000)
  }

  const removePhoto = (url: string) =>
    onChange({ ...value, photos: value.photos.filter(u => u !== url) })

  const removeDoc = (publicId: string) =>
    onChange({ ...value, documents: value.documents.filter(d => d.publicId !== publicId) })

  const removeLogo = () => onChange({ ...value, logoUrl: '' })

  const tabs = [
    { key: 'logo'   as const, label: 'Logo',      count: value.logoUrl ? 1 : 0 },
    { key: 'photos' as const, label: 'Photos',    count: value.photos.length },
    { key: 'docs'   as const, label: 'Documents', count: value.documents.length },
  ]

  return (
    <div className="space-y-4">
      {/* tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={clsx(
              'flex-1 py-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5',
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
            )}>
            {t.label}
            {t.count > 0 && (
              <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                tab === t.key ? 'bg-primary text-white' : 'bg-gray-300 text-gray-600')}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── LOGO TAB ── */}
      {tab === 'logo' && (
        <div className="space-y-3">
          {value.logoUrl ? (
            <div className="relative w-32 h-32 mx-auto">
              <img
                src={value.logoUrl}
                alt="NGO Logo"
                className="w-32 h-32 rounded-2xl object-cover border-2 border-gray-100 shadow-sm"
              />
              <div className="absolute inset-0 rounded-2xl bg-black/0 hover:bg-black/50 transition flex items-center justify-center gap-2 opacity-0 hover:opacity-100 group">
                <button
                  onClick={() => setPreview({ url: value.logoUrl, type: 'image' })}
                  className="p-1.5 bg-white/90 rounded-lg"
                >
                  <Eye className="w-3.5 h-3.5 text-gray-700" />
                </button>
                <button onClick={removeLogo} className="p-1.5 bg-red-500 rounded-lg">
                  <Trash2 className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
              <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-1">
                <Star className="w-3 h-3 text-white" fill="white" />
              </div>
            </div>
          ) : (
            <UploadZone
              label="Drop logo"
              hint="PNG · SVG · JPG — square preferred"
              accept="image/*"
              onFiles={f => enqueue(f, 'logo')}
              color="teal"
            />
          )}
          {value.logoUrl && (
            <p className="text-xs text-center text-gray-400">
              Logo uploaded — <button onClick={removeLogo} className="text-red-400 hover:underline">remove</button>
            </p>
          )}
        </div>
      )}

      {/* ── PHOTOS TAB ── */}
      {tab === 'photos' && (
        <div className="space-y-3">
          <UploadZone
            label="Drop NGO photos"
            hint="Activity photos, health camps, events — JPG · PNG · WebP"
            accept="image/*"
            onFiles={f => enqueue(f, 'photo')}
            color="blue"
          />
          {value.photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {value.photos.map((url, i) => (
                <div key={url + i} className="group relative aspect-square rounded-xl overflow-hidden border border-gray-100 bg-gray-50">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <button onClick={() => setPreview({ url, type: 'image' })}
                      className="p-1.5 bg-white/90 rounded-lg">
                      <Eye className="w-3.5 h-3.5 text-gray-700" />
                    </button>
                    <button onClick={() => removePhoto(url)}
                      className="p-1.5 bg-red-500 rounded-lg">
                      <Trash2 className="w-3.5 h-3.5 text-white" />
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={() => {}}
                className="aspect-square border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center hover:border-blue-300 hover:bg-blue-50/50 transition cursor-pointer"
                // clicking the UploadZone above is enough; this is just visual
              >
                <Plus className="w-5 h-5 text-gray-300" />
                <p className="text-xs text-gray-400 mt-1">Add</p>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── DOCUMENTS TAB ── */}
      {tab === 'docs' && (
        <div className="space-y-3">
          {/* optional label for next upload */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">
              Document label <span className="font-normal text-gray-400">(optional — e.g. "Registration Certificate")</span>
            </label>
            <input
              placeholder="What is this document?"
              value={docLabel}
              onChange={e => setDocLabel(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <UploadZone
            label="Drop proof documents"
            hint="Registration cert · MoU · ID proof — PDF · JPG · PNG"
            accept="image/*,application/pdf,.pdf,.doc,.docx"
            onFiles={f => enqueue(f, 'doc')}
            color="orange"
          />

          {value.documents.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Uploaded ({value.documents.length})
              </p>
              {value.documents.map((doc, i) => (
                <div key={doc.publicId + i}
                  className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 group">
                  <div className="w-9 h-9 rounded-lg bg-white border border-gray-100 flex items-center justify-center shrink-0 shadow-sm">
                    {doc.type === 'image'
                      ? <ImageIcon className="w-4 h-4 text-blue-500" />
                      : <FileText className="w-4 h-4 text-orange-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {doc.label || doc.name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {doc.label && <span className="mr-2 text-gray-500">{doc.name}</span>}
                      {fmtBytes(doc.bytes)}
                      {doc.uploadedAt && (
                        <span className="ml-2">
                          {new Date(doc.uploadedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {doc.type === 'image' && (
                      <button
                        onClick={() => setPreview({ url: doc.url, type: 'image' })}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition opacity-0 group-hover:opacity-100"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                    <a href={doc.url} target="_blank" rel="noreferrer"
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-blue-50 hover:text-blue-500 transition opacity-0 group-hover:opacity-100">
                      <Eye className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => removeDoc(doc.publicId)}
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* upload queue */}
      {queue.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            {isUploading ? 'Uploading to Cloudinary…' : 'Upload complete'}
          </p>
          {queue.map(item => <QueueRow key={item.uid} item={item} />)}
        </div>
      )}

      {/* lightbox */}
      {preview && (
        <div
          className="fixed inset-0 bg-black/85 z-[600] flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 bg-white/10 rounded-xl hover:bg-white/20 transition"
            onClick={() => setPreview(null)}
          >
            <X className="w-5 h-5 text-white" />
          </button>
          <div onClick={e => e.stopPropagation()} className="max-w-3xl w-full">
            <img
              src={preview.url}
              alt=""
              className="w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  )
}
