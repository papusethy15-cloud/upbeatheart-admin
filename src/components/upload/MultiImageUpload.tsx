// ── components/upload/MultiImageUpload.tsx ────────────────────────────────
// Grid of Cloudinary image uploaders with captions, alt text, and reorder/delete
import { useState, useRef, DragEvent, ChangeEvent } from 'react'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { ImagePlus, X, Loader2 } from 'lucide-react'
import clsx from 'clsx'

export interface MultiImageItem {
  url:      string
  publicId: string
  alt:      string
  caption:  string
}

interface Props {
  preset:   string
  value:    MultiImageItem[]
  onChange: (items: MultiImageItem[]) => void
  maxMB?:   number
  label?:   string
}

export default function MultiImageUpload({ preset, value, onChange, maxMB = 5, label = 'Additional Images' }: Props) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [dragOver, setDragOver]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList) {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (!arr.length) return
    setUploading(true)
    const results: MultiImageItem[] = []
    for (let i = 0; i < arr.length; i++) {
      const file = arr[i]
      if (file.size > maxMB * 1024 * 1024) { alert(`"${file.name}" exceeds ${maxMB} MB limit`); continue }
      try {
        const res = await uploadToCloudinary(file, preset, (p) => setProgress(p))
        results.push({ url: res.url, publicId: res.publicId, alt: '', caption: '' })
      } catch (e: any) { alert('Upload failed: ' + e.message) }
    }
    setUploading(false)
    setProgress(0)
    onChange([...value, ...results])
  }

  function onDrop(e: DragEvent) {
    e.preventDefault(); setDragOver(false)
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files)
  }

  function onInput(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) handleFiles(e.target.files)
    e.target.value = ''
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx))
  }

  function updateField(idx: number, field: 'alt' | 'caption', val: string) {
    onChange(value.map((item, i) => i === idx ? { ...item, [field]: val } : item))
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">{label}</label>

      {/* Uploaded grid */}
      {value.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {value.map((item, idx) => (
            <div key={item.publicId || idx} className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
              <div className="relative">
                <img src={item.url} alt={item.alt} className="w-full h-32 object-cover" />
                <button type="button" onClick={() => remove(idx)}
                  className="absolute top-1.5 right-1.5 bg-white/90 hover:bg-white rounded-full p-1 shadow-sm">
                  <X className="w-3 h-3 text-gray-600" />
                </button>
                <div className="absolute bottom-1.5 left-1.5 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded">
                  {idx + 1}
                </div>
              </div>
              <div className="p-2 space-y-1 bg-white border-t border-gray-100">
                <input type="text" placeholder="Caption" value={item.caption}
                  onChange={e => updateField(idx, 'caption', e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary/30" />
                <input type="text" placeholder="Alt text (SEO)" value={item.alt}
                  onChange={e => updateField(idx, 'alt', e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary/30" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={clsx(
          'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all',
          dragOver ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-primary/50 hover:bg-gray-50'
        )}
      >
        {uploading ? (
          <div className="space-y-2">
            <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" />
            <div className="w-40 mx-auto h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-gray-500">Uploading… {progress}%</p>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
              <ImagePlus className="w-5 h-5 text-primary" />
            </div>
            <p className="text-sm font-medium text-gray-700">
              Drag & drop or <span className="text-primary">browse</span> to add images
            </p>
            <p className="text-xs text-gray-400">Multi-select supported · JPG, PNG, WebP · max {maxMB} MB each</p>
          </div>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={onInput} />
    </div>
  )
}
