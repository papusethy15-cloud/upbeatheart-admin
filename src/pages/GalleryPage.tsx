import { useEffect, useState, useCallback, useRef } from 'react'
import {
  collection, getDocs, orderBy, query,
  doc, updateDoc, addDoc, deleteDoc, serverTimestamp
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import {
  Plus, X, Eye, Trash2, ImageIcon, Video,
  AlertTriangle, RefreshCw, Cloud, LayoutGrid,
  Calendar, HardDrive, Tag, Loader2, ExternalLink,
  Upload, CheckCircle2, Search, Globe, Lock,
  ZoomIn
} from 'lucide-react'
import { GalleryCropModal } from '@/components/upload/GalleryCropUpload'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GalleryItem {
  id: string
  type: 'photo' | 'video'
  url: string
  thumbnail?: string
  caption: string
  category: string
  status: 'draft' | 'published'
  createdAt?: { seconds: number }
}

interface CloudinaryAsset {
  public_id: string
  secure_url: string
  resource_type: 'image' | 'video'
  format: string
  width?: number
  height?: number
  bytes: number
  created_at: string
  folder: string
  tags: string[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CLOUD_NAME    = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME  || 'boc8bvoc'
const API_KEY       = import.meta.env.VITE_CLOUDINARY_API_KEY     || ''
const API_SECRET    = import.meta.env.VITE_CLOUDINARY_API_SECRET  || ''
const UPLOAD_PRESET = 'upbeat_public'
const VIDEO_PRESET  = import.meta.env.VITE_CLOUDINARY_PRESET_VIDEOS || 'upbeat_videos'

const CATEGORIES = [
  { value: 'clinic',      label: 'Clinic' },
  { value: 'health_camp', label: 'Health Camp' },
  { value: 'community',   label: 'Community' },
  { value: 'awards',      label: 'Awards' },
  { value: 'events',      label: 'Events' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(b: number) {
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1048576).toFixed(2) + ' MB'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Direct Cloudinary Admin API URL — works in both dev and production.
// The Vite proxy only worked during `vite dev`; in production (static build
// served by Nginx) it returns an HTML error page → "Unexpected token '<'" JSON parse failure.
function cloudinaryApiUrl(path: string) {
  return `https://api.cloudinary.com${path}`
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

interface UploadFile {
  file: File
  preview: string
  progress: number
  status: 'pending' | 'uploading' | 'done' | 'error'
  resultUrl?: string
  publicId?: string
}

interface AddGalleryModalProps {
  onClose: () => void
  onAdded: (item: GalleryItem) => void
}

function AddGalleryModal({ onClose, onAdded }: AddGalleryModalProps) {
  const [uploadTab, setUploadTab]   = useState<'upload' | 'url'>('upload')
  const [files, setFiles]           = useState<UploadFile[]>([])
  const [dragging, setDragging]     = useState(false)
  const [urlInput, setUrlInput]     = useState('')
  const [caption, setCaption]       = useState('')
  const [category, setCategory]     = useState('clinic')
  const [mediaType, setMediaType]   = useState<'photo' | 'video'>('photo')
  const [saving, setSaving]         = useState(false)
  const [uploadFolder, setUploadFolder] = useState('gallery')
  const fileRef = useRef<HTMLInputElement>(null)

  // Crop modal state — stores ONE pending image file waiting to be cropped
  const [cropPending, setCropPending] = useState<{ file: File; objectUrl: string } | null>(null)

  const addFiles = (incoming: File[]) => {
    // Separate photos (need crop) from videos (direct add)
    const photos = incoming.filter(f => f.type.startsWith('image/'))
    const videos = incoming.filter(f => f.type.startsWith('video/'))

    // Videos go straight in
    if (videos.length > 0) {
      const mapped: UploadFile[] = videos.map(f => ({
        file: f,
        preview: URL.createObjectURL(f),
        progress: 0,
        status: 'pending',
      }))
      setFiles(prev => [...prev, ...mapped])
    }

    // Photos — show crop modal for the first one; remaining queued after
    if (photos.length > 0) {
      // Queue all photos but open crop modal for index 0
      // We store the raw file list; after each crop we pop the next
      const objectUrl = URL.createObjectURL(photos[0])
      setCropPending({ file: photos[0], objectUrl })
      // If multiple photos, add subsequent ones directly (user cropped the main one)
      if (photos.length > 1) {
        // For simplicity, subsequent photos also go through crop one at a time
        // (each crop confirm triggers next via queue — simplified: add rest as pending)
        const rest: UploadFile[] = photos.slice(1).map(f => ({
          file: f,
          preview: URL.createObjectURL(f),
          progress: 0,
          status: 'pending' as const,
        }))
        setFiles(prev => [...prev, ...rest])
      }
    }
  }

  /** Called when admin confirms the crop — receives cropped blob */
  const handleCropConfirm = (blob: Blob) => {
    if (!cropPending) return
    const croppedFile = new File([blob], cropPending.file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
    const preview = URL.createObjectURL(blob)
    URL.revokeObjectURL(cropPending.objectUrl)
    setCropPending(null)
    setFiles(prev => [...prev, {
      file: croppedFile,
      preview,
      progress: 0,
      status: 'pending',
    }])
  }

  const handleCropCancel = () => {
    if (cropPending) {
      URL.revokeObjectURL(cropPending.objectUrl)
      setCropPending(null)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dropped = Array.from(e.dataTransfer.files).filter(
      f => f.type.startsWith('image/') || f.type.startsWith('video/')
    )
    addFiles(dropped)
  }

  const uploadFile = async (idx: number): Promise<string | null> => {
    const uf = files[idx]
    const isVideo = uf.file.type.startsWith('video/')
    // FIX 2: Use video-specific preset for video files.
    // upbeat_public is image-only; using it for videos caused the first-attempt
    // failure (Cloudinary returned an error) that cleared on retry because the
    // browser cached the connection. Now we correctly use VIDEO_PRESET for videos.
    const resourceType = isVideo ? 'video' : 'image'
    const preset = isVideo ? VIDEO_PRESET : UPLOAD_PRESET

    setFiles(prev => prev.map((f, i) => i === idx ? { ...f, status: 'uploading', progress: 0 } : f))

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest()
      const fd  = new FormData()
      fd.append('file', uf.file)
      fd.append('upload_preset', preset)
      fd.append('folder', uploadFolder)

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100)
          setFiles(prev => prev.map((f, i) => i === idx ? { ...f, progress: pct } : f))
        }
      }

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText)
          if (data.secure_url) {
            setFiles(prev => prev.map((f, i) => i === idx
              ? { ...f, status: 'done', progress: 100, resultUrl: data.secure_url, publicId: data.public_id }
              : f))
            resolve(data.secure_url)
          } else {
            setFiles(prev => prev.map((f, i) => i === idx ? { ...f, status: 'error' } : f))
            resolve(null)
          }
        } catch {
          setFiles(prev => prev.map((f, i) => i === idx ? { ...f, status: 'error' } : f))
          resolve(null)
        }
      }

      xhr.onerror = () => {
        setFiles(prev => prev.map((f, i) => i === idx ? { ...f, status: 'error' } : f))
        resolve(null)
      }

      xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`)
      xhr.send(fd)
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      let finalUrl = ''

      if (uploadTab === 'url') {
        finalUrl = urlInput.trim()
        if (!finalUrl) { toast.error('Please enter a URL'); setSaving(false); return }
      } else {
        // check for pending files
        if (files.length === 0) { toast.error('Please select a file'); setSaving(false); return }

        // Upload all pending
        for (let i = 0; i < files.length; i++) {
          if (files[i].status === 'pending') await uploadFile(i)
        }

        const done = files.filter(f => f.status === 'done')
        if (done.length === 0) { toast.error('Upload failed'); setSaving(false); return }
        finalUrl = done[0].resultUrl!

        // If multiple files, add each as separate gallery item
        if (done.length > 1) {
          for (const d of done) {
            const ref = await addDoc(collection(db, 'gallery'), {
              type: d.file.type.startsWith('video/') ? 'video' : 'photo',
              url: d.resultUrl!,
              caption: caption || d.file.name.replace(/\.[^/.]+$/, ''),
              category,
              status: 'draft',
              createdAt: serverTimestamp()
            })
            onAdded({ id: ref.id, type: d.file.type.startsWith('video/') ? 'video' : 'photo', url: d.resultUrl!, caption: caption, category, status: 'draft' })
          }
          toast.success(`${done.length} items added to gallery`)
          onClose()
          return
        }
      }

      const ref = await addDoc(collection(db, 'gallery'), {
        type: mediaType, url: finalUrl, caption, category, status: 'draft', createdAt: serverTimestamp()
      })
      onAdded({ id: ref.id, type: mediaType, url: finalUrl, caption, category, status: 'draft' })
      toast.success('Added to gallery')
      onClose()
    } catch {
      toast.error('Something went wrong')
    }
    setSaving(false)
  }

  // allUploaded computed if needed
  const anyUploading = files.some(f => f.status === 'uploading')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-[700px] max-w-full max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center">
                <ImageIcon className="w-4 h-4 text-primary" />
              </div>
              Add to Gallery
            </h2>
            <p className="text-xs text-gray-400 mt-0.5 ml-10">Upload files or add via URL</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab toggle */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mx-6 mt-5">
          {(['upload', 'url'] as const).map(t => (
            <button key={t} onClick={() => setUploadTab(t)}
              className={clsx('flex-1 py-2 rounded-lg text-sm font-medium transition',
                uploadTab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
              {t === 'upload' ? '⬆ Upload Files' : '🔗 Paste URL'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto px-6 py-5 space-y-5">

          {/* Upload tab */}
          {uploadTab === 'upload' && (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={clsx(
                  'border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition',
                  dragging
                    ? 'border-primary bg-primary/5 scale-[1.01]'
                    : 'border-gray-200 hover:border-primary/40 hover:bg-gray-50'
                )}
              >
                <input ref={fileRef} type="file" multiple accept="image/*,video/*" className="hidden"
                  onChange={e => e.target.files && addFiles(Array.from(e.target.files))} />
                <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-7 h-7 text-primary" />
                </div>
                <p className="text-sm font-semibold text-gray-700">Drop files here or click to browse</p>
                <p className="text-xs text-gray-400 mt-1.5">JPG, PNG, WebP, GIF, MP4, MOV · Multiple files supported</p>
              </div>

              {/* Folder selector */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Upload Folder</label>
                <select value={uploadFolder} onChange={e => setUploadFolder(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                  <option value="gallery">gallery (root)</option>
                  <option value="gallery/clinic">gallery/clinic</option>
                  <option value="gallery/health_camp">gallery/health_camp</option>
                  <option value="gallery/events">gallery/events</option>
                  <option value="gallery/awards">gallery/awards</option>
                </select>
              </div>

              {/* File list */}
              {files.length > 0 && (
                <div className="space-y-2">
                  {files.map((uf, i) => (
                    <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                        {uf.file.type.startsWith('image/')
                          ? <img src={uf.preview} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center"><Video className="w-5 h-5 text-gray-400" /></div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{uf.file.name}</p>
                        <p className="text-xs text-gray-400">{formatBytes(uf.file.size)}</p>
                        {uf.status === 'uploading' && (
                          <div className="mt-1.5 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${uf.progress}%` }} />
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        {uf.status === 'pending'    && <div className="w-5 h-5 rounded-full border-2 border-gray-300" />}
                        {uf.status === 'uploading'  && <Loader2 className="w-5 h-5 text-primary animate-spin" />}
                        {uf.status === 'done'       && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                        {uf.status === 'error'      && <AlertTriangle className="w-5 h-5 text-red-400" />}
                      </div>
                      {uf.status === 'pending' && (
                        <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                          className="p-1 rounded-lg hover:bg-gray-200 transition text-gray-400">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* URL tab */}
          {uploadTab === 'url' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Media URL</label>
                <input placeholder="https://res.cloudinary.com/..." value={urlInput}
                  onChange={e => {
                    const val = e.target.value
                    setUrlInput(val)
                    // FIX 3: Auto-detect media type from the URL so admin doesn't
                    // have to manually pick. Cloudinary video URLs contain /video/
                    // or common video extensions.
                    const lc = val.toLowerCase()
                    const isVid = lc.includes('/video/') ||
                      /\.(mp4|mov|webm|avi|mkv|m4v)(\?|$)/.test(lc)
                    setMediaType(isVid ? 'video' : 'photo')
                  }}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  Media Type
                  <span className="ml-2 text-gray-400 font-normal normal-case">(auto-detected · override if needed)</span>
                </label>
                <div className="flex gap-2">
                  {(['photo', 'video'] as const).map(t => (
                    <button key={t} onClick={() => setMediaType(t)}
                      className={clsx('flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition',
                        mediaType === t ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-500 hover:border-gray-300')}>
                      {t === 'photo' ? <ImageIcon className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                      {t === 'photo' ? 'Photo' : 'Video'}
                    </button>
                  ))}
                </div>
              </div>
              {urlInput && mediaType === 'photo' && (
                <div className="rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 h-40">
                  <img src={urlInput} alt="" className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3' }} />
                </div>
              )}
            </div>
          )}

          {/* Common fields */}
          <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-100">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Caption</label>
              <input placeholder="Describe this photo or video…" value={caption}
                onChange={e => setCaption(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between bg-gray-50/50">
          <p className="text-xs text-gray-400">
            {uploadTab === 'upload' && files.length > 0
              ? `${files.filter(f => f.status === 'done').length}/${files.length} uploaded`
              : 'Fill details and save'}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving || anyUploading}
              className="px-5 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-60 flex items-center gap-2 shadow-md shadow-primary/20">
              {(saving || anyUploading) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {anyUploading ? 'Uploading…' : saving ? 'Saving…' : 'Add to Gallery'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Crop modal — appears over the upload modal for photo files ── */}
      {cropPending && (
        <GalleryCropModal
          imgSrc={cropPending.objectUrl}
          fileName={cropPending.file.name}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  )
}

// ─── Preview Modal ────────────────────────────────────────────────────────────

function AssetPreviewModal({ asset, onClose }: { asset: CloudinaryAsset; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm truncate">{asset.public_id.split('/').pop()}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {asset.format.toUpperCase()} · {formatBytes(asset.bytes)} · {formatDate(asset.created_at)}
              {asset.width && ` · ${asset.width}×${asset.height}px`}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <a href={asset.secure_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary border border-primary/30 rounded-lg px-3 py-1.5 hover:bg-primary/5 transition">
              <ExternalLink className="w-3.5 h-3.5" /> Open
            </a>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>
        <div className="bg-gray-950 flex items-center justify-center min-h-72 max-h-[70vh] overflow-hidden">
          {asset.resource_type === 'video'
            ? <video src={asset.secure_url} controls className="max-h-[68vh] max-w-full" />
            : <img src={asset.secure_url} alt={asset.public_id} className="max-h-[68vh] max-w-full object-contain" />}
        </div>
        {asset.folder && (
          <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-500">
            <Tag className="w-3.5 h-3.5" />
            <span>Folder: <span className="font-medium text-gray-700">{asset.folder}</span></span>
            {asset.tags?.length > 0 && (
              <span className="ml-4">Tags: <span className="font-medium text-gray-700">{asset.tags.join(', ')}</span></span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────

function DeleteAssetModal({ asset, isUsed, onConfirm, onClose, deleting }: {
  asset: CloudinaryAsset; isUsed: boolean
  onConfirm: () => void; onClose: () => void; deleting: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <div className={clsx('w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4',
          isUsed ? 'bg-amber-50' : 'bg-red-50')}>
          {isUsed ? <AlertTriangle className="w-6 h-6 text-amber-500" /> : <Trash2 className="w-6 h-6 text-red-500" />}
        </div>
        <h3 className="font-bold text-gray-900 text-center text-base">
          {isUsed ? 'Asset Is In Use' : 'Delete Asset?'}
        </h3>
        <p className="text-sm text-gray-500 text-center mt-2">
          {isUsed
            ? 'This asset is used in a Gallery item. Remove it from the Gallery first before deleting from Cloudinary.'
            : <>Permanently delete <span className="font-medium text-gray-700 break-all">{asset.public_id.split('/').pop()}</span> from Cloudinary? This cannot be undone.</>}
        </p>
        <div className="mt-5 flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition">
            {isUsed ? 'Got It' : 'Cancel'}
          </button>
          {!isUsed && (
            <button onClick={onConfirm} disabled={deleting}
              className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 transition disabled:opacity-60 flex items-center justify-center gap-2">
              {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Gallery Item Card ────────────────────────────────────────────────────────

function GalleryCard({ item, onPublish, onDelete }: {
  item: GalleryItem
  onPublish: () => void
  onDelete: () => void
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden group hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className="relative overflow-hidden">
        {item.type === 'photo' ? (
          <img src={item.url} alt={item.caption}
            className="w-full h-44 object-cover group-hover:scale-105 transition-transform duration-500"
            onError={e => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400x200?text=Image' }} />
        ) : (
          <div className="w-full h-44 bg-gradient-to-br from-gray-800 to-gray-900 flex flex-col items-center justify-center gap-2">
            <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center">
              <Video className="w-6 h-6 text-white" />
            </div>
            <span className="text-white/60 text-xs font-medium">Video</span>
          </div>
        )}

        {/* Status badge */}
        <div className="absolute top-2.5 left-2.5">
          <span className={clsx('flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full backdrop-blur-sm',
            item.status === 'published'
              ? 'bg-green-500/90 text-white'
              : 'bg-black/40 text-white/80')}>
            {item.status === 'published' ? <Globe className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
            {item.status === 'published' ? 'Live' : 'Draft'}
          </span>
        </div>

        {/* Hover actions */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-between p-3">
          <a href={item.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-white/90 text-gray-800 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-white transition">
            <Eye className="w-3.5 h-3.5" /> View
          </a>
          <button onClick={onDelete}
            className="bg-red-500/90 text-white p-1.5 rounded-lg hover:bg-red-500 transition">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="p-3.5">
        <p className="text-sm font-semibold text-gray-900 truncate">{item.caption || 'Untitled'}</p>
        <div className="flex items-center justify-between mt-2.5">
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full capitalize">
            {item.category.replace('_', ' ')}
          </span>
          <button onClick={onPublish}
            className={clsx('text-xs px-3 py-1 rounded-full font-medium transition border',
              item.status === 'published'
                ? 'border-green-200 bg-green-50 text-green-700 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-primary/5 hover:text-primary hover:border-primary/30')}>
            {item.status === 'published' ? 'Unpublish' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Cloudinary Asset Card ────────────────────────────────────────────────────

function CloudinaryCard({ asset, isUsed, onPreview, onDelete }: {
  asset: CloudinaryAsset; isUsed: boolean
  onPreview: () => void; onDelete: () => void
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden group hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className="relative h-36 bg-gray-100 overflow-hidden">
        {asset.resource_type === 'image' ? (
          <img src={asset.secure_url} alt={asset.public_id}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3' }} />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-900 flex flex-col items-center justify-center gap-2">
            <Video className="w-7 h-7 text-white/60" />
            <span className="text-xs text-white/50 font-medium">{asset.format.toUpperCase()}</span>
          </div>
        )}

        {/* In-use badge */}
        {isUsed && (
          <div className="absolute top-2 left-2 bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
            In Gallery
          </div>
        )}

        {/* Format badge */}
        <div className="absolute top-2 right-2 bg-black/50 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm">
          {asset.format.toUpperCase()}
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
          <button onClick={onPreview}
            className="bg-white/95 p-2 rounded-xl hover:bg-white transition shadow-lg" title="Preview">
            <ZoomIn className="w-4 h-4 text-gray-700" />
          </button>
          <button onClick={onDelete}
            className={clsx('p-2 rounded-xl shadow-lg transition',
              isUsed
                ? 'bg-white/40 cursor-not-allowed'
                : 'bg-white/95 hover:bg-red-50')}
            title={isUsed ? 'In use — cannot delete' : 'Delete'}>
            <Trash2 className={clsx('w-4 h-4', isUsed ? 'text-gray-400' : 'text-red-500')} />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-1.5">
        <p className="text-xs font-semibold text-gray-800 truncate" title={asset.public_id}>
          {asset.public_id.split('/').pop()}
        </p>
        <div className="flex items-center justify-between text-gray-400">
          <span className="text-[11px]">{formatBytes(asset.bytes)}</span>
          {asset.width && <span className="text-[11px]">{asset.width}×{asset.height}</span>}
        </div>
        <div className="flex items-center gap-1 text-gray-400">
          <Calendar className="w-3 h-3 flex-shrink-0" />
          <span className="text-[11px]">{formatDate(asset.created_at)}</span>
        </div>
        {asset.folder && (
          <div className="flex items-center gap-1 text-gray-400">
            <HardDrive className="w-3 h-3 flex-shrink-0" />
            <span className="text-[11px] truncate">{asset.folder}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GalleryPage() {
  const [tab, setTab] = useState<'gallery' | 'cloudinary'>('gallery')

  // Gallery (Firestore)
  const [items, setItems]         = useState<GalleryItem[]>([])
  const [loadingItems, setLoadingItems] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [gallerySearch, setGallerySearch] = useState('')
  const [galleryCat, setGalleryCat]       = useState('all')
  const [galleryFilter, setGalleryFilter] = useState<'all' | 'published' | 'draft'>('all')

  // Cloudinary
  const [assets, setAssets]         = useState<CloudinaryAsset[]>([])
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [assetError, setAssetError]       = useState('')
  const [assetSearch, setAssetSearch]     = useState('')
  const [assetTypeFilter, setAssetTypeFilter] = useState<'all' | 'image' | 'video'>('all')

  // Modals
  const [previewAsset, setPreviewAsset] = useState<CloudinaryAsset | null>(null)
  const [deleteAsset, setDeleteAsset]   = useState<CloudinaryAsset | null>(null)
  const [deleting, setDeleting]         = useState(false)

  // ── Load Firestore items ──
  useEffect(() => {
    getDocs(query(collection(db, 'gallery'), orderBy('caption'))).then(snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as GalleryItem)))
      setLoadingItems(false)
    })
  }, [])

  // ── Load Cloudinary via Vite proxy (fixes CORS) ──
  const loadCloudinaryAssets = useCallback(async () => {
    setLoadingAssets(true)
    setAssetError('')
    try {
      const auth = 'Basic ' + btoa(`${API_KEY}:${API_SECRET}`)
      const all: CloudinaryAsset[] = []

      for (const rt of ['image', 'video'] as const) {
        let cursor: string | undefined
        do {
          const params = new URLSearchParams({ max_results: '100' })
          if (cursor) params.set('next_cursor', cursor)
          // Use Vite proxy path to avoid CORS
          const res = await fetch(
            cloudinaryApiUrl(`/v1_1/${CLOUD_NAME}/resources/${rt}?${params}`),
            { headers: { Authorization: auth } }
          )
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error((err as { error?: { message?: string } })?.error?.message || `HTTP ${res.status}`)
          }
          const data = await res.json()
          for (const r of (data.resources || [])) {
            all.push({
              public_id: r.public_id, secure_url: r.secure_url,
              resource_type: rt, format: r.format,
              width: r.width, height: r.height, bytes: r.bytes,
              created_at: r.created_at, folder: r.folder || '',
              tags: r.tags || []
            })
          }
          cursor = data.next_cursor
        } while (cursor)
      }

      all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setAssets(all)
    } catch (e: unknown) {
      setAssetError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoadingAssets(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'cloudinary' && assets.length === 0 && !loadingAssets && !assetError) {
      loadCloudinaryAssets()
    }
  }, [tab])

  // ── Delete from Cloudinary ──
  const handleDeleteAsset = async () => {
    if (!deleteAsset) return
    setDeleting(true)
    try {
      const auth = 'Basic ' + btoa(`${API_KEY}:${API_SECRET}`)
      const res = await fetch(
        cloudinaryApiUrl(`/v1_1/${CLOUD_NAME}/resources/${deleteAsset.resource_type}/upload`),
        {
          method: 'DELETE',
          headers: { Authorization: auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({ public_ids: [deleteAsset.public_id] })
        }
      )
      if (!res.ok) throw new Error('Delete failed')
      setAssets(prev => prev.filter(a => a.public_id !== deleteAsset.public_id))
      toast.success('Deleted from Cloudinary')
      setDeleteAsset(null)
    } catch {
      toast.error('Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  // ── Gallery actions ──
  const togglePublish = async (item: GalleryItem) => {
    const next = item.status === 'published' ? 'draft' : 'published'
    await updateDoc(doc(db, 'gallery', item.id), { status: next })
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: next } : i))
    toast.success(next === 'published' ? 'Published!' : 'Set to draft')
  }

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Delete this gallery item?')) return
    await deleteDoc(doc(db, 'gallery', id))
    setItems(prev => prev.filter(i => i.id !== id))
    toast.success('Deleted')
  }

  // ── Derived data ──
  const usedUrls = new Set(items.map(i => i.url))

  const filteredItems = items.filter(item => {
    if (galleryCat !== 'all' && item.category !== galleryCat) return false
    if (galleryFilter !== 'all' && item.status !== galleryFilter) return false
    if (gallerySearch && !item.caption.toLowerCase().includes(gallerySearch.toLowerCase())) return false
    return true
  })

  const filteredAssets = assets.filter(a => {
    if (assetTypeFilter !== 'all' && a.resource_type !== assetTypeFilter) return false
    if (assetSearch && !a.public_id.toLowerCase().includes(assetSearch.toLowerCase())) return false
    return true
  })

  const publishedCount = items.filter(i => i.status === 'published').length
  const photoCount     = items.filter(i => i.type === 'photo').length
  const videoCount     = items.filter(i => i.type === 'video').length

  return (
    <div className="space-y-6">

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gallery</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage photos, videos and Cloudinary media assets</p>
        </div>
        {tab === 'gallery' && (
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition shadow-md shadow-primary/20">
            <Plus className="w-4 h-4" /> Add to Gallery
          </button>
        )}
        {tab === 'cloudinary' && (
          <button onClick={loadCloudinaryAssets} disabled={loadingAssets}
            className="flex items-center gap-2 border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition disabled:opacity-60">
            <RefreshCw className={clsx('w-4 h-4', loadingAssets && 'animate-spin')} />
            Refresh
          </button>
        )}
      </div>

      {/* ── Stats row (gallery tab only) ── */}
      {tab === 'gallery' && !loadingItems && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total Items',  value: items.length,     color: 'bg-primary/10 text-primary' },
            { label: 'Published',    value: publishedCount,   color: 'bg-green-50 text-green-700' },
            { label: 'Photos',       value: photoCount,       color: 'bg-sky-50 text-sky-700' },
            { label: 'Videos',       value: videoCount,       color: 'bg-purple-50 text-purple-700' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-500 font-medium">{s.label}</p>
              <p className={clsx('text-2xl font-bold mt-1', s.color.split(' ')[1])}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button onClick={() => setTab('gallery')}
          className={clsx('flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition',
            tab === 'gallery' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
          <LayoutGrid className="w-4 h-4" /> Gallery
          <span className={clsx('text-xs px-2 py-0.5 rounded-full font-semibold',
            tab === 'gallery' ? 'bg-primary/10 text-primary' : 'bg-gray-200 text-gray-500')}>
            {items.length}
          </span>
        </button>
        <button onClick={() => setTab('cloudinary')}
          className={clsx('flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition',
            tab === 'cloudinary' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
          <Cloud className="w-4 h-4" /> Cloudinary Assets
          {assets.length > 0 && (
            <span className={clsx('text-xs px-2 py-0.5 rounded-full font-semibold',
              tab === 'cloudinary' ? 'bg-primary/10 text-primary' : 'bg-gray-200 text-gray-500')}>
              {assets.length}
            </span>
          )}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════ GALLERY TAB */}
      {tab === 'gallery' && (
        <>
          {/* Filter bar */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input placeholder="Search by caption…" value={gallerySearch}
                onChange={e => setGallerySearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <select value={galleryCat} onChange={e => setGalleryCat(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
              <option value="all">All Categories</option>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {(['all', 'published', 'draft'] as const).map(f => (
                <button key={f} onClick={() => setGalleryFilter(f)}
                  className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition',
                    galleryFilter === f ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
                  {f}
                </button>
              ))}
            </div>
            {(gallerySearch || galleryCat !== 'all' || galleryFilter !== 'all') && (
              <button onClick={() => { setGallerySearch(''); setGalleryCat('all'); setGalleryFilter('all') }}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition">
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            )}
          </div>

          {loadingItems
            ? <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
              </div>
            : filteredItems.length === 0
            ? <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center text-gray-400">
                <ImageIcon className="w-10 h-10 mx-auto mb-3 text-gray-200" />
                <p className="text-sm font-medium">No items found</p>
                <button onClick={() => setShowAddModal(true)}
                  className="mt-4 flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90 transition mx-auto">
                  <Plus className="w-4 h-4" /> Add First Item
                </button>
              </div>
            : <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredItems.map(item => (
                  <GalleryCard key={item.id} item={item}
                    onPublish={() => togglePublish(item)}
                    onDelete={() => handleDeleteItem(item.id)} />
                ))}
              </div>
          }
        </>
      )}

      {/* ═══════════════════════════════════════════════════ CLOUDINARY TAB */}
      {tab === 'cloudinary' && (
        <>
          {/* Filter bar */}
          {!loadingAssets && !assetError && assets.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input placeholder="Search by public ID…" value={assetSearch}
                  onChange={e => setAssetSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                {([
                  { k: 'all',   label: `All (${assets.length})` },
                  { k: 'image', label: `Images (${assets.filter(a => a.resource_type === 'image').length})` },
                  { k: 'video', label: `Videos (${assets.filter(a => a.resource_type === 'video').length})` },
                ] as const).map(f => (
                  <button key={f.k} onClick={() => setAssetTypeFilter(f.k)}
                    className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium transition',
                      assetTypeFilter === f.k ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Loading */}
          {loadingAssets && (
            <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
              <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Loader2 className="w-7 h-7 text-primary animate-spin" />
              </div>
              <p className="text-sm font-medium text-gray-700">Fetching Cloudinary assets…</p>
              <p className="text-xs text-gray-400 mt-1">This may take a moment</p>
            </div>
          )}

          {/* Error */}
          {!loadingAssets && assetError && (
            <div className="bg-white rounded-2xl border border-red-100 p-12 text-center">
              <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-7 h-7 text-red-400" />
              </div>
              <p className="text-sm font-semibold text-gray-800">Failed to load Cloudinary assets</p>
              <p className="text-xs text-gray-500 mt-2 max-w-xs mx-auto">{assetError}</p>
              <button onClick={loadCloudinaryAssets}
                className="mt-5 flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90 transition mx-auto">
                <RefreshCw className="w-3.5 h-3.5" /> Try Again
              </button>
            </div>
          )}

          {/* Empty */}
          {!loadingAssets && !assetError && assets.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center text-gray-400">
              <Cloud className="w-10 h-10 mx-auto mb-3 text-gray-200" />
              <p className="text-sm font-medium">No assets found in Cloudinary</p>
            </div>
          )}

          {/* Grid */}
          {!loadingAssets && !assetError && filteredAssets.length > 0 && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredAssets.map(asset => (
                  <CloudinaryCard key={asset.public_id} asset={asset}
                    isUsed={usedUrls.has(asset.secure_url)}
                    onPreview={() => setPreviewAsset(asset)}
                    onDelete={() => setDeleteAsset(asset)} />
                ))}
              </div>
              <p className="text-xs text-center text-gray-400">
                Showing {filteredAssets.length} of {assets.length} assets
                {usedUrls.size > 0 && ` · ${[...usedUrls].filter(u => assets.some(a => a.secure_url === u)).length} in use`}
              </p>
            </>
          )}
        </>
      )}

      {/* ── Modals ── */}
      {showAddModal && (
        <AddGalleryModal
          onClose={() => setShowAddModal(false)}
          onAdded={item => setItems(prev => [item, ...prev])}
        />
      )}
      {previewAsset && <AssetPreviewModal asset={previewAsset} onClose={() => setPreviewAsset(null)} />}
      {deleteAsset && (
        <DeleteAssetModal
          asset={deleteAsset}
          isUsed={usedUrls.has(deleteAsset.secure_url)}
          onConfirm={handleDeleteAsset}
          onClose={() => setDeleteAsset(null)}
          deleting={deleting}
        />
      )}
    </div>
  )
}
