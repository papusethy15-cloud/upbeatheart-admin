// ── components/upload/InfographicUpload.tsx ───────────────────────────────
// Upload shareable infographic images (Cloudinary) for disease articles
import { useState, useRef, DragEvent, ChangeEvent } from 'react'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { LayoutTemplate, X, Loader2, Download } from 'lucide-react'
import clsx from 'clsx'

export interface InfographicItem {
  url:      string
  publicId: string
  title:    string
}

interface Props {
  preset:   string
  value:    InfographicItem[]
  onChange: (items: InfographicItem[]) => void
  maxMB?:   number
}

export default function InfographicUpload({ preset, value, onChange, maxMB = 8 }: Props) {
  const [uploading, setUploading] = useState(false)
  const [progress,  setProgress]  = useState(0)
  const [dragOver,  setDragOver]  = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList) {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (!arr.length) return
    setUploading(true)
    const results: InfographicItem[] = []
    for (const file of arr) {
      if (file.size > maxMB * 1024 * 1024) { alert(`"${file.name}" exceeds ${maxMB} MB`); continue }
      try {
        const res = await uploadToCloudinary(file, preset, p => setProgress(p))
        results.push({ url: res.url, publicId: res.publicId, title: file.name.replace(/\.[^.]+$/, '') })
      } catch (e: any) { alert('Upload failed: ' + e.message) }
    }
    setUploading(false); setProgress(0)
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

  function updateTitle(idx: number, title: string) {
    onChange(value.map((item, i) => i === idx ? { ...item, title } : item))
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        Infographics
        <span className="text-xs font-normal text-gray-400 ml-2">Shareable/downloadable health info cards</span>
      </label>

      {value.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {value.map((item, idx) => (
            <div key={item.publicId || idx} className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50 group">
              <div className="relative">
                <img src={item.url} alt={item.title} className="w-full h-36 object-cover" />
                <button type="button" onClick={() => remove(idx)}
                  className="absolute top-1.5 right-1.5 bg-white/90 hover:bg-white rounded-full p-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="w-3 h-3 text-gray-600" />
                </button>
                <a href={item.url} target="_blank" rel="noopener"
                  className="absolute top-1.5 left-1.5 bg-white/90 hover:bg-white rounded-full p-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Preview full size">
                  <Download className="w-3 h-3 text-gray-600" />
                </a>
              </div>
              <div className="p-2 bg-white border-t border-gray-100">
                <input type="text" placeholder="Infographic title" value={item.title}
                  onChange={e => updateTitle(idx, e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary/30" />
              </div>
            </div>
          ))}
        </div>
      )}

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
              <div className="h-full bg-primary rounded-full" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-gray-500">Uploading… {progress}%</p>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
              <LayoutTemplate className="w-5 h-5 text-primary" />
            </div>
            <p className="text-sm font-medium text-gray-700">
              Drop infographic images or <span className="text-primary">browse</span>
            </p>
            <p className="text-xs text-gray-400">High-res PNG/JPG · Shareable health info cards · max {maxMB} MB</p>
          </div>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={onInput} />
    </div>
  )
}
