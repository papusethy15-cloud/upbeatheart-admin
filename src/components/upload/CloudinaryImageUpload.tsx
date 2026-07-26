// ── components/upload/CloudinaryImageUpload.tsx ────────────────────────────
import { useRef, useState, DragEvent, ChangeEvent } from 'react'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { ImagePlus, X, Loader2 } from 'lucide-react'
import clsx from 'clsx'

export interface ImageValue {
  url:      string
  publicId: string
  alt:      string
}

interface Props {
  preset:      string           // Cloudinary upload preset
  value:       ImageValue | null
  onChange:    (v: ImageValue | null) => void
  label?:      string
  aspectHint?: string           // e.g. "16:9" — shown as helper text
  maxMB?:      number           // default 5
}

export default function CloudinaryImageUpload({
  preset, value, onChange, label = 'Image', aspectHint, maxMB = 5,
}: Props) {
  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) { alert('Please select an image file.'); return }
    if (file.size > maxMB * 1024 * 1024) { alert(`File must be under ${maxMB} MB.`); return }
    setUploading(true)
    setProgress(0)
    try {
      const res = await uploadToCloudinary(file, preset, setProgress)
      onChange({ url: res.url, publicId: res.publicId, alt: '' })
    } catch (e: any) {
      alert('Upload failed: ' + e.message)
    } finally {
      setUploading(false)
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function onInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>

      {value ? (
        <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
          <img src={value.url} alt={value.alt || label} className="w-full max-h-64 object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-2 right-2 bg-white/90 hover:bg-white rounded-full p-1.5 shadow-sm"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
          <div className="px-3 py-2 border-t border-gray-100 bg-white">
            <input
              type="text"
              placeholder="Alt text for SEO (describe the image)"
              value={value.alt}
              onChange={e => onChange({ ...value, alt: e.target.value })}
              className="w-full text-sm text-gray-700 placeholder-gray-400 outline-none"
            />
          </div>
        </div>
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={clsx(
            'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
            dragOver ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-primary/50 hover:bg-gray-50',
          )}
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
                <ImagePlus className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm font-medium text-gray-700">
                Drag & drop or <span className="text-primary">browse</span>
              </p>
              <p className="text-xs text-gray-400">
                JPG, PNG, WebP · max {maxMB} MB{aspectHint ? ` · ${aspectHint} recommended` : ''}
              </p>
            </div>
          )}
        </div>
      )}

      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={onInput} />
    </div>
  )
}
