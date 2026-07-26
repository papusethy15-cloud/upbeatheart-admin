// ── components/upload/CloudinaryVideoUpload.tsx ───────────────────────────
import { useRef, useState, ChangeEvent } from 'react'
import { uploadToCloudinary, fetchYouTubeMeta } from '@/lib/cloudinary'
import { Video, Youtube, X, Loader2, Upload } from 'lucide-react'
import clsx from 'clsx'

export interface VideoItem {
  cloudinaryUrl:   string
  youtubeUrl:      string
  title:           string
  description:     string
  thumbnailUrl:    string
  durationSeconds: number
}

interface Props {
  preset:   string
  value:    VideoItem | null
  onChange: (v: VideoItem | null) => void
  label?:   string
}

type Mode = 'cloudinary' | 'youtube'

export default function CloudinaryVideoUpload({ preset, value, onChange, label = 'Video' }: Props) {
  const [mode, setMode]         = useState<Mode>('cloudinary')
  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [ytUrl, setYtUrl]       = useState('')
  const [ytLoading, setYtLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file.type.startsWith('video/')) { alert('Please select a video file.'); return }
    if (file.size > 200 * 1024 * 1024) { alert('Video must be under 200 MB.'); return }
    setUploading(true); setProgress(0)
    try {
      const res = await uploadToCloudinary(file, preset, setProgress)
      onChange({
        cloudinaryUrl:   res.url,
        youtubeUrl:      '',
        title:           file.name.replace(/\.[^.]+$/, ''),
        description:     '',
        thumbnailUrl:    res.thumbnailUrl ?? '',
        durationSeconds: res.duration     ?? 0,
      })
    } catch (e: any) { alert('Upload failed: ' + e.message) }
    finally { setUploading(false) }
  }

  async function fetchYt() {
    if (!ytUrl.trim()) return
    setYtLoading(true)
    try {
      const meta = await fetchYouTubeMeta(ytUrl.trim())
      onChange({
        cloudinaryUrl:   '',
        youtubeUrl:      ytUrl.trim(),
        title:           meta.title,
        description:     meta.description,
        thumbnailUrl:    meta.thumbnailUrl,
        durationSeconds: 0,
      })
    } catch { alert('Could not fetch YouTube video. Check the URL.') }
    finally { setYtLoading(false) }
  }

  function onInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (file) handleFile(file); e.target.value = ''
  }

  const getYtId = (url: string) => {
    const m = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
    return m?.[1] ?? null
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        {!value && (
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {(['cloudinary', 'youtube'] as Mode[]).map(m => (
              <button
                key={m} type="button"
                onClick={() => setMode(m)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  mode === m ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'
                )}
              >
                {m === 'cloudinary' ? <Upload className="w-3 h-3" /> : <Youtube className="w-3 h-3" />}
                {m === 'cloudinary' ? 'Upload' : 'YouTube'}
              </button>
            ))}
          </div>
        )}
      </div>

      {value ? (
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
          {/* Preview */}
          {value.youtubeUrl && getYtId(value.youtubeUrl) ? (
            <div className="aspect-video">
              <iframe
                src={`https://www.youtube.com/embed/${getYtId(value.youtubeUrl)}`}
                className="w-full h-full" allow="fullscreen" />
            </div>
          ) : value.thumbnailUrl ? (
            <img src={value.thumbnailUrl} className="w-full max-h-48 object-cover" alt="thumbnail" />
          ) : (
            <div className="aspect-video bg-gray-200 flex items-center justify-center">
              <Video className="w-10 h-10 text-gray-400" />
            </div>
          )}
          <div className="p-3 space-y-2 bg-white border-t border-gray-100">
            <input type="text" placeholder="Video title" value={value.title}
              onChange={e => onChange({ ...value, title: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20" />
            <textarea placeholder="Short description" value={value.description} rows={2}
              onChange={e => onChange({ ...value, description: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
          </div>
          <div className="px-3 pb-3 bg-white">
            <button type="button" onClick={() => onChange(null)}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
              <X className="w-3 h-3" /> Remove video
            </button>
          </div>
        </div>
      ) : mode === 'cloudinary' ? (
        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-gray-200 hover:border-primary/50 hover:bg-gray-50 rounded-xl p-8 text-center cursor-pointer transition-all"
        >
          {uploading ? (
            <div className="space-y-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
              <div className="w-48 mx-auto h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-sm text-gray-500">Uploading… {progress}%</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto">
                <Video className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm font-medium text-gray-700">Upload video file</p>
              <p className="text-xs text-gray-400">MP4, MOV, WebM · max 200 MB</p>
            </div>
          )}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
          <div className="flex gap-2">
            <input
              type="url" value={ytUrl} onChange={e => setYtUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20 bg-white"
            />
            <button type="button" onClick={fetchYt} disabled={ytLoading || !ytUrl.trim()}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-1">
              {ytLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Load'}
            </button>
          </div>
          <p className="text-xs text-gray-400">Paste a YouTube URL — title and thumbnail will be fetched automatically</p>
        </div>
      )}

      <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={onInput} />
    </div>
  )
}
