import { useState, useEffect, useRef } from 'react'
import { X, Upload, Image as ImageIcon, ZoomIn, ZoomOut } from 'lucide-react'

interface Props {
  currentUrl?: string
  onSelect: (url: string) => void
  onClose: () => void
}

const RECENT_KEY = 'upbeat_recent_images'

function saveRecent(url: string) {
  try {
    const existing: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    const updated = [url, ...existing.filter(u => u !== url)].slice(0, 30)
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated))
  } catch {}
}

export default function CoverImageModal({ currentUrl, onSelect, onClose }: Props) {
  const [tab, setTab]         = useState<'gallery' | 'upload' | 'url'>(currentUrl ? 'gallery' : 'gallery')
  const [selected, setSelected] = useState(currentUrl || '')
  const [urlInput, setUrlInput] = useState(currentUrl || '')
  const [uploading, setUploading] = useState(false)
  const [zoom, setZoom]        = useState(100)
  const [recentUrls, setRecentUrls] = useState<string[]>([])
  const [dims, setDims]        = useState<{ w: number; h: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const saved: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
      setRecentUrls(saved)
    } catch {}
  }, [])

  useEffect(() => {
    if (!selected) { setDims(null); return }
    const img = new window.Image()
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = selected
  }, [selected])

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('upload_preset', 'upbeat_public')
      fd.append('folder', 'blogs/covers')
      const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'boc8bvoc'
      const res  = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: fd })
      const data = await res.json()
      if (data.secure_url) {
        setSelected(data.secure_url)
        setUrlInput(data.secure_url)
        saveRecent(data.secure_url)
        setRecentUrls(prev => [data.secure_url, ...prev.filter(u => u !== data.secure_url)].slice(0, 30))
        setTab('url')
      }
    } catch {}
    setUploading(false)
  }

  const handleConfirm = () => {
    const url = tab === 'url' ? urlInput.trim() : selected
    if (!url) return
    saveRecent(url)
    onSelect(url)
    onClose()
  }

  const activeUrl = tab === 'url' ? urlInput : selected

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[300] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-[780px] max-w-[98vw] max-h-[92vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 text-base flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-primary" /> Cover Image
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Select from gallery, upload new, or paste a URL</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="flex border-b border-gray-100 px-6 shrink-0">
          {(['gallery', 'upload', 'url'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition ${
                tab === t ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-700'
              }`}>
              {t === 'gallery' ? '🖼 Recent Images' : t === 'upload' ? '⬆ Upload New' : '🔗 Paste URL'}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* Left — tabs content */}
          <div className="flex-1 overflow-auto p-6">

            {/* Gallery tab */}
            {tab === 'gallery' && (
              recentUrls.length === 0 ? (
                <div className="text-center py-16 text-gray-300">
                  <ImageIcon className="w-14 h-14 mx-auto mb-3" />
                  <p className="text-sm text-gray-400 font-medium">No images yet</p>
                  <p className="text-xs text-gray-300 mt-1">Upload an image and it will appear here</p>
                  <button type="button" onClick={() => setTab('upload')}
                    className="mt-5 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition">
                    Upload Image
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {recentUrls.map(url => (
                    <div key={url} onClick={() => setSelected(url)}
                      className={`relative aspect-video rounded-xl overflow-hidden cursor-pointer border-2 transition group ${
                        selected === url ? 'border-primary ring-2 ring-primary/30' : 'border-gray-100 hover:border-primary/40'
                      }`}>
                      <img src={url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                      {selected === url && (
                        <div className="absolute inset-0 bg-primary/15 flex items-center justify-center">
                          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-bold">✓</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}

            {/* Upload tab */}
            {tab === 'upload' && (
              <div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                <div
                  onClick={() => !uploading && fileRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 rounded-2xl p-16 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition"
                >
                  {uploading ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                      <p className="text-sm font-medium text-primary">Uploading to Cloudinary…</p>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                      <p className="text-base font-semibold text-gray-500">Click to select image</p>
                      <p className="text-xs text-gray-300 mt-2">JPG, PNG, WebP · Recommended: 1200 × 630px</p>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* URL tab */}
            {tab === 'url' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Image URL</label>
                  <input
                    placeholder="https://res.cloudinary.com/boc8bvoc/image/upload/…"
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    autoFocus
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                {urlInput && (
                  <div className="border border-gray-100 rounded-2xl overflow-hidden bg-gray-50">
                    <div className="flex items-center justify-center p-6" style={{ minHeight: 200 }}>
                      <img
                        src={urlInput}
                        alt=""
                        style={{
                          maxHeight: 220, maxWidth: '100%',
                          transform: `scale(${zoom / 100})`,
                          transformOrigin: 'center',
                          transition: 'transform 0.2s',
                          borderRadius: 8,
                          boxShadow: '0 2px 16px rgba(0,0,0,0.1)',
                        }}
                        onError={e => { (e.currentTarget as HTMLImageElement).style.opacity = '0.2' }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right — preview + controls panel */}
          {activeUrl && (
            <div className="w-64 shrink-0 border-l border-gray-100 bg-gray-50/60 p-4 flex flex-col gap-4 overflow-auto">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Preview</p>

              {/* Preview box */}
              <div className="bg-white rounded-xl overflow-hidden border border-gray-100 shadow-sm">
                <div className="aspect-video overflow-hidden flex items-center justify-center bg-gray-100">
                  <img
                    src={activeUrl}
                    alt=""
                    style={{
                      width: '100%', height: '100%', objectFit: 'cover',
                      transform: `scale(${zoom / 100})`,
                      transformOrigin: 'center',
                      transition: 'transform 0.2s',
                    }}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.opacity = '0.2' }}
                  />
                </div>
                {dims && (
                  <div className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100 space-y-0.5">
                    <p>Original: <span className="font-mono text-gray-600">{dims.w} × {dims.h}px</span></p>
                    <p>Display: <span className="font-mono text-gray-600">{Math.round(dims.w * zoom / 100)} × {Math.round(dims.h * zoom / 100)}px</span></p>
                    <p>Aspect: <span className="font-mono text-gray-600">{dims.w && dims.h ? (dims.w / dims.h).toFixed(2) : '—'}</span></p>
                  </div>
                )}
              </div>

              {/* Zoom slider */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Zoom</p>
                  <span className="text-xs font-mono text-primary">{zoom}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setZoom(z => Math.max(10, z - 10))}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-100 transition">
                    <ZoomOut className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                  <input type="range" min={10} max={150} step={5} value={zoom}
                    onChange={e => setZoom(+e.target.value)}
                    className="flex-1 h-1.5 accent-primary" />
                  <button type="button" onClick={() => setZoom(z => Math.min(150, z + 10))}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-100 transition">
                    <ZoomIn className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                </div>
                {/* Quick zoom presets */}
                <div className="flex gap-1 mt-2 flex-wrap">
                  {[25, 50, 75, 100].map(p => (
                    <button key={p} type="button" onClick={() => setZoom(p)}
                      className={`px-2 py-1 rounded-md text-xs border transition ${zoom === p ? 'bg-primary text-white border-primary' : 'bg-white border-gray-200 text-gray-500 hover:border-primary/40'}`}>
                      {p}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Select button */}
              <button type="button" onClick={() => { setSelected(activeUrl); if (tab === 'url') setSelected(urlInput) }}
                className={`w-full py-2 rounded-xl text-xs font-semibold border transition ${
                  selected === activeUrl || selected === urlInput
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-primary/40'
                }`}>
                {selected === activeUrl || selected === urlInput ? '✓ Selected' : 'Select This Image'}
              </button>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between shrink-0 bg-gray-50/50">
          <div className="text-xs text-gray-400">
            {activeUrl ? (
              <span className="font-mono truncate max-w-xs block">{activeUrl.split('/').pop()}</span>
            ) : (
              <span>Select or upload an image</span>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition">
              Cancel
            </button>
            <button type="button" onClick={handleConfirm}
              disabled={!activeUrl}
              className="px-6 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-40 shadow-md shadow-primary/20">
              Use This Image
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
