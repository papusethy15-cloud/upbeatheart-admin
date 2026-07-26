/**
 * CampaignMediaUploader
 * Handles photo + video uploads for patient campaigns via Cloudinary.
 *
 * Presets (per MASTER_GUIDE.md § 4):
 *   upbeat_public   → unsigned, folder: upbeatheart/patients  (images)
 *   upbeat_public   → unsigned, folder: upbeatheart/videos    (videos)
 * Switch to signed preset (upbeat_patients / upbeat_videos) via Firebase
 * Function once backend is ready.
 */
import { useState, useRef } from 'react'
import {
  Upload, X, Image as ImageIcon, Video, Loader2,
  CheckCircle, AlertCircle, Eye, Trash2, Play, Plus,
} from 'lucide-react'
import clsx from 'clsx'

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'boc8bvoc'
const IMG_PRESET = 'upbeat_public'
const VID_PRESET = 'upbeat_public'

// ── types ─────────────────────────────────────────────────────────────────────

export interface MediaFile {
  url: string
  publicId: string
  type: 'image' | 'video'
  name: string
  bytes: number
  width?: number
  height?: number
  duration?: number
  thumbnailUrl?: string
}

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'

interface UploadItem {
  id: string
  file: File
  status: UploadStatus
  progress: number
  result?: MediaFile
  error?: string
}

interface Props {
  photos: string[]
  videos: string[]
  onPhotosChange: (urls: string[]) => void
  onVideosChange: (urls: string[]) => void
  onMediaMetaChange?: (meta: MediaFile[]) => void
  mediaMeta?: MediaFile[]
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(b: number) {
  if (!b) return ''
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}
function fmtDuration(s?: number) {
  if (!s) return ''
  return `${Math.floor(s / 60)}:${Math.round(s % 60).toString().padStart(2, '0')}`
}

async function uploadToCloudinary(
  file: File,
  type: 'image' | 'video',
  onProgress: (pct: number) => void
): Promise<MediaFile> {
  const preset = type === 'image' ? IMG_PRESET : VID_PRESET
  const folder = type === 'image' ? 'upbeatheart/patients' : 'upbeatheart/videos'
  const resource = type === 'image' ? 'image' : 'video'

  const fd = new FormData()
  fd.append('file', file)
  fd.append('upload_preset', preset)
  fd.append('folder', folder)

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resource}/upload`)
    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    })
    xhr.addEventListener('load', () => {
      try {
        const d = JSON.parse(xhr.responseText)
        if (d.error) return reject(new Error(d.error.message))
        resolve({
          url: d.secure_url,
          publicId: d.public_id,
          type,
          name: file.name,
          bytes: d.bytes,
          width: d.width,
          height: d.height,
          duration: d.duration,
          thumbnailUrl: type === 'video'
            ? `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/so_0,w_400,h_225,c_fill,f_jpg/${d.public_id}.jpg`
            : undefined,
        })
      } catch { reject(new Error('Parse error')) }
    })
    xhr.addEventListener('error', () => reject(new Error('Network error')))
    xhr.send(fd)
  })
}

// ── MediaThumb ────────────────────────────────────────────────────────────────

function MediaThumb({ media, onRemove, onPreview }: {
  media: MediaFile; onRemove(): void; onPreview(): void
}) {
  return (
    <div className="group relative rounded-xl overflow-hidden border border-gray-100 bg-gray-50 aspect-video">
      {media.type === 'image' ? (
        <img src={media.url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="relative w-full h-full">
          {media.thumbnailUrl
            ? <img src={media.thumbnailUrl} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full bg-gray-800 flex items-center justify-center"><Video className="w-8 h-8 text-gray-500" /></div>}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-9 h-9 rounded-full bg-black/60 flex items-center justify-center">
              <Play className="w-4 h-4 text-white ml-0.5" fill="white" />
            </div>
          </div>
          {media.duration && (
            <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 py-0.5 rounded font-mono">
              {fmtDuration(media.duration)}
            </div>
          )}
        </div>
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
        <button onClick={onPreview} className="p-1.5 bg-white/90 rounded-lg"><Eye className="w-3.5 h-3.5 text-gray-700" /></button>
        <button onClick={onRemove} className="p-1.5 bg-red-500 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-white" /></button>
      </div>
      <div className="absolute top-1.5 left-1.5">
        <span className={clsx('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold',
          media.type === 'image' ? 'bg-blue-500/90 text-white' : 'bg-purple-500/90 text-white')}>
          {media.type === 'image' ? <ImageIcon className="w-2.5 h-2.5" /> : <Video className="w-2.5 h-2.5" />}
          {media.type === 'image' ? 'IMG' : 'VID'}
        </span>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function CampaignMediaUploader({
  photos, videos, onPhotosChange, onVideosChange, onMediaMetaChange, mediaMeta = []
}: Props) {
  const [activeTab, setActiveTab] = useState<'photos' | 'videos'>('photos')
  const [queue, setQueue] = useState<UploadItem[]>([])
  const [preview, setPreview] = useState<MediaFile | null>(null)
  const imgRef = useRef<HTMLInputElement>(null)
  const vidRef = useRef<HTMLInputElement>(null)
  const isUploading = queue.some(q => q.status === 'uploading')

  const processFiles = async (files: FileList | null, type: 'image' | 'video') => {
    if (!files || !files.length) return
    const arr = Array.from(files)
    const items: UploadItem[] = arr.map(f => ({ id: `${Date.now()}-${Math.random()}`, file: f, status: 'idle', progress: 0 }))
    setQueue(prev => [...prev, ...items])

    for (const item of items) {
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'uploading' } : q))
      try {
        const result = await uploadToCloudinary(item.file, type,
          pct => setQueue(prev => prev.map(q => q.id === item.id ? { ...q, progress: pct } : q)))
        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'done', result } : q))
        if (type === 'image') onPhotosChange([...photos, result.url])
        else onVideosChange([...videos, result.url])
        onMediaMetaChange?.([...mediaMeta, result])
      } catch (err: any) {
        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'error', error: err.message } : q))
      }
    }
    setTimeout(() => setQueue(prev => prev.filter(q => q.status !== 'done')), 3000)
  }

  const remove = (url: string, type: 'image' | 'video') => {
    if (type === 'image') onPhotosChange(photos.filter(u => u !== url))
    else onVideosChange(videos.filter(u => u !== url))
    onMediaMetaChange?.(mediaMeta.filter(m => m.url !== url))
  }

  const toMF = (url: string, type: 'image' | 'video'): MediaFile =>
    mediaMeta.find(m => m.url === url) ??
    { url, publicId: '', type, name: url.split('/').pop() ?? '', bytes: 0 }

  return (
    <div className="space-y-4">
      {/* tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {(['photos', 'videos'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={clsx('flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition',
              activeTab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
            {t === 'photos' ? <ImageIcon className="w-4 h-4" /> : <Video className="w-4 h-4" />}
            {t === 'photos' ? `Photos (${photos.length})` : `Videos (${videos.length})`}
          </button>
        ))}
      </div>

      {/* PHOTOS */}
      {activeTab === 'photos' && (
        <>
          <input ref={imgRef} type="file" multiple accept="image/*" className="hidden"
            onChange={e => processFiles(e.target.files, 'image')} />
          <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); processFiles(e.dataTransfer.files, 'image') }}
            onClick={() => imgRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition group">
            <Upload className="w-8 h-8 text-gray-300 group-hover:text-primary/50 mx-auto mb-2 transition" />
            <p className="text-sm font-medium text-gray-500">Drop photos or <span className="text-primary">browse</span></p>
            <p className="text-xs text-gray-400 mt-1">JPG · PNG · WebP · Multiple allowed</p>
            <p className="text-[10px] text-gray-300 mt-0.5">Cropped to 800×530px (3:2) before upload — matches campaign card</p>
          </div>
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {photos.map((url, i) => (
                <div key={url + i}>
                  <MediaThumb media={toMF(url, 'image')} onRemove={() => remove(url, 'image')} onPreview={() => setPreview(toMF(url, 'image'))} />
                  {(() => { const m = toMF(url, 'image'); return m.width ? <p className="text-[10px] text-gray-400 mt-1 text-center">{m.width}×{m.height} · {fmtBytes(m.bytes)}</p> : null })()}
                </div>
              ))}
              <div onClick={() => imgRef.current?.click()}
                className="aspect-video border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition">
                <Plus className="w-5 h-5 text-gray-300" />
                <p className="text-xs text-gray-400 mt-1">Add more</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* VIDEOS */}
      {activeTab === 'videos' && (
        <>
          <input ref={vidRef} type="file" multiple accept="video/*" className="hidden"
            onChange={e => processFiles(e.target.files, 'video')} />
          <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); processFiles(e.dataTransfer.files, 'video') }}
            onClick={() => vidRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-purple-300 hover:bg-purple-50/50 transition group">
            <Video className="w-8 h-8 text-gray-300 group-hover:text-purple-400 mx-auto mb-2 transition" />
            <p className="text-sm font-medium text-gray-500">Drop videos or <span className="text-purple-500">browse</span></p>
            <p className="text-xs text-gray-400 mt-1">MP4 · MOV · WebM · Max 100MB</p>
            <p className="text-[10px] text-gray-300 mt-0.5">→ Cloudinary: upbeatheart/videos</p>
          </div>
          {videos.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {videos.map((url, i) => (
                <div key={url + i}>
                  <MediaThumb media={toMF(url, 'video')} onRemove={() => remove(url, 'video')} onPreview={() => setPreview(toMF(url, 'video'))} />
                  {(() => { const m = toMF(url, 'video'); return <p className="text-[10px] text-gray-400 mt-1 text-center truncate">{m.name}{m.duration ? ` · ${fmtDuration(m.duration)}` : ''}{m.bytes ? ` · ${fmtBytes(m.bytes)}` : ''}</p> })()}
                </div>
              ))}
              <div onClick={() => vidRef.current?.click()}
                className="aspect-video border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-purple-300 hover:bg-purple-50/50 transition">
                <Plus className="w-5 h-5 text-gray-300" />
                <p className="text-xs text-gray-400 mt-1">Add video</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* upload queue */}
      {queue.length > 0 && (
        <div className="space-y-2 mt-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            {isUploading ? 'Uploading to Cloudinary…' : 'Upload complete'}
          </p>
          {queue.map(item => (
            <div key={item.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
              <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
                {item.file.type.startsWith('image/') ? <ImageIcon className="w-4 h-4 text-gray-400" /> : <Video className="w-4 h-4 text-gray-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-700 truncate">{item.file.name}</p>
                {item.status === 'uploading' && (
                  <div className="mt-1 w-full bg-gray-200 rounded-full h-1">
                    <div className="bg-primary h-1 rounded-full transition-all" style={{ width: `${item.progress}%` }} />
                  </div>
                )}
                {item.status === 'error' && <p className="text-[10px] text-red-500">{item.error}</p>}
              </div>
              <div className="flex-shrink-0">
                {item.status === 'uploading' && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
                {item.status === 'done' && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                {item.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* lightbox */}
      {preview && (
        <div className="fixed inset-0 bg-black/85 z-[500] flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <button className="absolute top-4 right-4 p-2 bg-white/10 rounded-xl hover:bg-white/20 transition" onClick={() => setPreview(null)}>
            <X className="w-5 h-5 text-white" />
          </button>
          <div onClick={e => e.stopPropagation()} className="max-w-4xl w-full">
            {preview.type === 'image'
              ? <img src={preview.url} alt="" className="w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl" />
              : <video src={preview.url} controls autoPlay className="w-full max-h-[85vh] rounded-2xl shadow-2xl bg-black" />
            }
            <p className="text-white/60 text-sm text-center mt-3">{preview.name}</p>
          </div>
        </div>
      )}
    </div>
  )
}
