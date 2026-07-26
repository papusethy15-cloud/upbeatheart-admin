// ── components/upload/ImageCropUpload.tsx ──────────────────────────────────────
//
// Universal image uploader with canvas-based crop modal.
// Enforces exact output dimensions before uploading to Cloudinary.
// Zero external dependencies — pure Canvas API.
//
// USAGE:
//   <ImageCropUpload
//     label="Blog Cover"
//     hint="Shown as card thumbnail and full-width hero on the article page"
//     targetW={1200} targetH={630}           // exact output px
//     aspectLabel="16:9"                     // shown in UI
//     websiteUsage="Blog card (h-44) · Article hero (full-width)"
//     preset="upbeat_public"
//     value={coverImageUrl}
//     onChange={url => setField('coverImage', url)}
//     onRemove={() => setField('coverImage', '')}
//   />

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Upload, X, ZoomIn, ZoomOut, RotateCcw, Check,
  Loader2, Trash2, Eye, AlertCircle, CheckCircle2, Move, Info,
} from 'lucide-react'
import { uploadToCloudinary } from '@/lib/cloudinary'

// ── types ─────────────────────────────────────────────────────────────────────
interface CropState {
  zoom:   number
  offset: { x: number; y: number }
}

export interface ImageCropUploadProps {
  /** Cloudinary unsigned upload preset */
  preset: string
  /** Current saved URL */
  value: string
  /** Called with the new Cloudinary URL after a successful crop+upload */
  onChange: (url: string) => void
  /** Called when the admin removes the image */
  onRemove: () => void
  /** Label shown above the uploader */
  label?: string
  /** One-line description of where this image appears */
  hint?: string
  /** Exact pixel width to output */
  targetW: number
  /** Exact pixel height to output */
  targetH: number
  /** Human-readable aspect ratio, e.g. "16:9" or "3:4" */
  aspectLabel?: string
  /** One-liner describing where on the website this image is used + rendered size */
  websiteUsage?: string
  /** Whether input is disabled (non-admin) */
  disabled?: boolean
  /** Max upload size before crop in MB (default 20) */
  maxMB?: number
}

// ── constants ──────────────────────────────────────────────────────────────────
const MIN_ZOOM = 1
const MAX_ZOOM = 5
// Crop modal canvas: width-constrained, height-capped
const MODAL_MAX_W = 560
const MODAL_MAX_H = 380

// ── helpers ────────────────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

function getViewDims(img: HTMLImageElement, aspect: number) {
  if (img.naturalWidth / img.naturalHeight > aspect) {
    const viewH = img.naturalHeight
    return { viewW: viewH * aspect, viewH }
  }
  const viewW = img.naturalWidth
  return { viewW, viewH: viewW / aspect }
}

function drawCropToCanvas(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  crop: CropState,
  outW: number,
  outH: number,
) {
  const aspect = outW / outH
  const { viewW, viewH } = getViewDims(img, aspect)
  const sliceW = viewW / crop.zoom
  const sliceH = viewH / crop.zoom
  const cx0  = img.naturalWidth  / 2
  const cy0  = img.naturalHeight / 2
  const fitL = cx0 - viewW / 2
  const fitT = cy0 - viewH / 2
  const msx  = (viewW / 2) * (1 - 1 / crop.zoom)
  const msy  = (viewH / 2) * (1 - 1 / crop.zoom)
  const ox   = clamp(crop.offset.x, -msx, msx)
  const oy   = clamp(crop.offset.y, -msy, msy)
  const sx   = clamp(cx0 + ox - sliceW / 2, fitL, fitL + viewW - sliceW)
  const sy   = clamp(cy0 + oy - sliceH / 2, fitT, fitT + viewH - sliceH)
  ctx.drawImage(img, sx, sy, sliceW, sliceH, 0, 0, outW, outH)
}

async function renderBlob(
  img: HTMLImageElement,
  crop: CropState,
  targetW: number,
  targetH: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width  = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')!
  drawCropToCanvas(ctx, img, crop, targetW, targetH)
  // Use JPEG for landscape photos (smaller); PNG for portrait (doctor photo, logos)
  const mime    = targetW >= targetH ? 'image/jpeg' : 'image/png'
  const quality = mime === 'image/jpeg' ? 0.92 : undefined
  return new Promise((res, rej) =>
    canvas.toBlob(b => b ? res(b) : rej(new Error('Canvas toBlob failed')), mime, quality),
  )
}

// ── CropModal ─────────────────────────────────────────────────────────────────
function CropModal({
  imgSrc, targetW, targetH, aspectLabel, websiteUsage, onConfirm, onCancel,
}: {
  imgSrc: string
  targetW: number
  targetH: number
  aspectLabel?: string
  websiteUsage?: string
  onConfirm: (img: HTMLImageElement, crop: CropState) => void
  onCancel: () => void
}) {
  const aspect   = targetW / targetH
  // Fit preview canvas inside modal constraints
  const previewW = Math.min(MODAL_MAX_W, Math.round(MODAL_MAX_H * aspect))
  const previewH = Math.round(previewW / aspect)

  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const imgRef     = useRef<HTMLImageElement | null>(null)
  const lastPt     = useRef({ x: 0, y: 0 })
  const [crop, setCrop]       = useState<CropState>({ zoom: 1, offset: { x: 0, y: 0 } })
  const [loaded, setLoaded]   = useState(false)
  const [dragging, setDragging] = useState(false)
  const [rendering, setRendering] = useState(false)

  // Load
  useEffect(() => {
    const img = new Image()
    img.onload = () => { imgRef.current = img; setLoaded(true) }
    img.crossOrigin = 'anonymous'
    img.src = imgSrc
  }, [imgSrc])

  // Draw preview
  useEffect(() => {
    if (!loaded || !imgRef.current || !canvasRef.current) return
    const canvas = canvasRef.current
    canvas.width  = previewW
    canvas.height = previewH
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, previewW, previewH)
    drawCropToCanvas(ctx, imgRef.current, crop, previewW, previewH)
    // Rule-of-thirds guide
    ctx.strokeStyle = 'rgba(255,255,255,0.20)'
    ctx.lineWidth   = 0.8
    ;[1/3, 2/3].forEach(f => {
      ctx.beginPath(); ctx.moveTo(previewW * f, 0); ctx.lineTo(previewW * f, previewH); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, previewH * f); ctx.lineTo(previewW, previewH * f); ctx.stroke()
    })
    // Border
    ctx.strokeStyle = 'rgba(21,101,216,0.6)'
    ctx.lineWidth   = 1.5
    ctx.strokeRect(0.75, 0.75, previewW - 1.5, previewH - 1.5)
  }, [crop, loaded, previewW, previewH])

  // Drag-to-pan
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    setDragging(true)
    lastPt.current = { x: e.clientX, y: e.clientY }
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !imgRef.current) return
    const { viewW, viewH } = getViewDims(imgRef.current, aspect)
    const dx = e.clientX - lastPt.current.x
    const dy = e.clientY - lastPt.current.y
    lastPt.current = { x: e.clientX, y: e.clientY }
    const pxPerScreenX = (viewW / previewW)  / crop.zoom
    const pxPerScreenY = (viewH / previewH) / crop.zoom
    setCrop(c => {
      const msx = (viewW / 2) * (1 - 1 / c.zoom)
      const msy = (viewH / 2) * (1 - 1 / c.zoom)
      return { ...c, offset: {
        x: clamp(c.offset.x - dx * pxPerScreenX, -msx, msx),
        y: clamp(c.offset.y - dy * pxPerScreenY, -msy, msy),
      }}
    })
  }, [dragging, crop.zoom, previewW, previewH, aspect])

  const stopDrag = useCallback(() => setDragging(false), [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    if (!imgRef.current) return
    const { viewW, viewH } = getViewDims(imgRef.current, aspect)
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setCrop(c => {
      const z   = clamp(c.zoom + delta, MIN_ZOOM, MAX_ZOOM)
      const msx = (viewW / 2) * (1 - 1 / z)
      const msy = (viewH / 2) * (1 - 1 / z)
      return { zoom: z, offset: { x: clamp(c.offset.x, -msx, msx), y: clamp(c.offset.y, -msy, msy) } }
    })
  }, [aspect])

  const setZoom = (z: number) => {
    if (!imgRef.current) return
    const { viewW, viewH } = getViewDims(imgRef.current, aspect)
    const msx = (viewW / 2) * (1 - 1 / z)
    const msy = (viewH / 2) * (1 - 1 / z)
    setCrop(c => ({ zoom: z, offset: { x: clamp(c.offset.x, -msx, msx), y: clamp(c.offset.y, -msy, msy) } }))
  }

  const reset = () => setCrop({ zoom: 1, offset: { x: 0, y: 0 } })

  const handleConfirm = () => {
    if (!imgRef.current || !loaded) return
    setRendering(true)
    onConfirm(imgRef.current, crop)
  }

  return (
    <div className="fixed inset-0 z-[600] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxWidth: MODAL_MAX_W + 80, width: '100%', maxHeight: '95vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="font-bold text-gray-900 text-sm">Crop & Adjust Image</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Output: <span className="font-mono">{targetW} × {targetH}px</span>
              {aspectLabel && <> · {aspectLabel} ratio</>}
            </p>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Website usage banner */}
        {websiteUsage && (
          <div className="bg-blue-50 border-b border-blue-100 px-5 py-2 flex items-center gap-2 shrink-0">
            <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <p className="text-xs text-blue-700">
              <span className="font-bold">Used on website: </span>{websiteUsage}
            </p>
          </div>
        )}

        {/* Canvas */}
        <div className="px-5 pt-4 pb-2 flex flex-col items-center gap-3 overflow-auto flex-1">
          {!loaded ? (
            <div className="flex items-center justify-center bg-gray-100 rounded-2xl" style={{ width: previewW, height: previewH }}>
              <Loader2 className="w-7 h-7 text-primary animate-spin" />
            </div>
          ) : (
            <div
              className="relative rounded-2xl overflow-hidden select-none border-2 border-primary/30 shadow-lg"
              style={{ width: previewW, height: previewH, cursor: dragging ? 'grabbing' : 'grab', background: '#e5e7eb', maxWidth: '100%' }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={stopDrag}
              onMouseLeave={stopDrag}
              onWheel={onWheel}
            >
              <canvas ref={canvasRef} style={{ display: 'block', maxWidth: '100%' }} />
              {/* Corner badge */}
              <div className="absolute bottom-2 right-2 bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {targetW} × {targetH}px
              </div>
              {/* Drag hint */}
              <div className="absolute top-2 right-2 bg-black/40 rounded-lg px-1.5 py-1 flex items-center gap-1 pointer-events-none">
                <Move className="w-3 h-3 text-white/80" />
                <span className="text-[10px] text-white/80">drag to pan</span>
              </div>
            </div>
          )}
          <p className="text-xs text-gray-400 text-center">
            Drag to reposition · Scroll to zoom · Preview shows exactly what will be saved
          </p>
        </div>

        {/* Zoom controls */}
        <div className="px-5 py-3 space-y-2.5 border-t border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <ZoomOut className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              type="range"
              min={MIN_ZOOM * 100}
              max={MAX_ZOOM * 100}
              step={5}
              value={Math.round(crop.zoom * 100)}
              onChange={e => setZoom(Number(e.target.value) / 100)}
              className="flex-1 h-1.5 accent-primary cursor-pointer"
            />
            <ZoomIn className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-xs font-mono text-gray-500 w-12 text-right shrink-0">
              {Math.round(crop.zoom * 100)}%
            </span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {[1, 1.25, 1.5, 2, 3].map(z => (
              <button key={z} type="button" onClick={() => setZoom(z)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                  Math.abs(crop.zoom - z) < 0.06
                    ? 'bg-primary text-white border-primary'
                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-primary/40'
                }`}
              >{z}×</button>
            ))}
            <button type="button" onClick={reset}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-gray-200 bg-gray-50 text-gray-500 hover:border-primary/40 transition ml-auto">
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50 shrink-0">
          <button type="button" onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-white transition">
            Cancel
          </button>
          <button type="button" disabled={!loaded || rendering} onClick={handleConfirm}
            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 transition disabled:opacity-40 shadow-sm">
            {rendering
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
              : <><Check className="w-4 h-4" /> Save Crop</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────
export default function ImageCropUpload({
  preset, value, onChange, onRemove,
  label = 'Image', hint, targetW, targetH, aspectLabel, websiteUsage,
  disabled = false, maxMB = 20,
}: ImageCropUploadProps) {
  const fileRef  = useRef<HTMLInputElement>(null)
  const [rawSrc,    setRawSrc]    = useState<string | null>(null)
  const [cropping,  setCropping]  = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress,  setProgress]  = useState(0)
  const [error,     setError]     = useState('')
  const [preview,   setPreview]   = useState(false)
  const [dims,      setDims]      = useState<{ w: number; h: number } | null>(null)

  // Load natural dimensions when value changes
  useEffect(() => {
    if (!value) { setDims(null); return }
    const img = new Image()
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = value
  }, [value])

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Only image files accepted.'); return }
    if (file.size > maxMB * 1024 * 1024) { setError(`Max file size: ${maxMB} MB.`); return }
    setError('')
    const url = URL.createObjectURL(file)
    setRawSrc(url)
    setCropping(true)
  }

  const handleConfirm = async (img: HTMLImageElement, crop: CropState) => {
    setCropping(false)
    setUploading(true)
    setProgress(0)
    try {
      const blob   = await renderBlob(img, crop, targetW, targetH)
      const ext    = blob.type === 'image/jpeg' ? 'jpg' : 'png'
      const file   = new File([blob], `image.${ext}`, { type: blob.type })
      const result = await uploadToCloudinary(file, preset, setProgress)
      onChange(result.url)
    } catch (e: any) {
      setError(e.message || 'Upload failed.')
    } finally {
      if (rawSrc) URL.revokeObjectURL(rawSrc)
      setRawSrc(null)
      setUploading(false)
      setProgress(0)
    }
  }

  const handleCancel = () => {
    setCropping(false)
    if (rawSrc) URL.revokeObjectURL(rawSrc)
    setRawSrc(null)
  }

  // Thumbnail aspect for the saved-state preview box
  const thumbH = 64
  const thumbW = Math.round(thumbH * (targetW / targetH))

  return (
    <>
      <div className="space-y-2">
        {/* Label row */}
        <div>
          <p className="text-sm font-semibold text-gray-800">{label}</p>
          {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
          <p className="text-xs text-gray-300 mt-0.5 font-mono">
            Output: {targetW} × {targetH}px{aspectLabel ? ` (${aspectLabel})` : ''}
            {websiteUsage && <> · <span className="text-gray-400">{websiteUsage}</span></>}
          </p>
        </div>

        {value ? (
          /* ── Saved state ── */
          <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
            {/* Thumbnail */}
            <div
              className="rounded-xl overflow-hidden border border-gray-200 shadow-sm shrink-0"
              style={{ width: thumbW, height: thumbH }}
            >
              <img src={value} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Saved · {targetW}×{targetH}px{aspectLabel ? ` ${aspectLabel}` : ''}
              </p>
              {dims && (
                <p className="text-[10px] text-gray-400 mt-0.5 font-mono">
                  Natural: {dims.w}×{dims.h}px
                  {(dims.w !== targetW || dims.h !== targetH) && (
                    <span className="text-amber-500"> ⚠ differs from target — re-upload to fix</span>
                  )}
                </p>
              )}
              <p className="text-[10px] text-gray-300 font-mono truncate mt-0.5">
                {value.split('/').slice(-2).join('/')}
              </p>
              <div className="flex gap-2 mt-2 flex-wrap">
                <button type="button" onClick={() => setPreview(true)}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-white transition">
                  <Eye className="w-3 h-3" /> Preview
                </button>
                <button type="button" onClick={() => fileRef.current?.click()} disabled={disabled || uploading}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition disabled:opacity-40">
                  <Upload className="w-3 h-3" /> Replace
                </button>
                <button type="button" onClick={onRemove} disabled={disabled}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs text-red-500 border border-red-100 rounded-lg hover:bg-red-50 transition disabled:opacity-40">
                  <Trash2 className="w-3 h-3" /> Remove
                </button>
              </div>
            </div>
          </div>
        ) : uploading ? (
          /* ── Uploading state ── */
          <div className="border-2 border-primary/30 rounded-2xl p-7 text-center bg-primary/5">
            <Loader2 className="w-7 h-7 text-primary animate-spin mx-auto mb-2" />
            <div className="w-48 mx-auto h-1.5 bg-white rounded-full overflow-hidden mt-2">
              <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-primary font-medium mt-2">Uploading… {progress}%</p>
          </div>
        ) : (
          /* ── Empty drop zone ── */
          <div
            onClick={() => !disabled && fileRef.current?.click()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            onDragOver={e => e.preventDefault()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center transition cursor-pointer select-none ${
              disabled
                ? 'opacity-50 cursor-not-allowed border-gray-200'
                : 'border-gray-200 hover:border-primary/40 hover:bg-primary/5'
            }`}
          >
            <div className="w-12 h-12 bg-primary/8 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Upload className="w-5 h-5 text-primary" />
            </div>
            <p className="text-sm font-semibold text-gray-500">Click or drag image here</p>
            <p className="text-xs text-gray-300 mt-1">
              JPG, PNG, WebP · max {maxMB} MB
            </p>
            <p className="text-xs text-gray-300 mt-0.5">
              A crop modal will open → output: {targetW}×{targetH}px{aspectLabel ? ` (${aspectLabel})` : ''}
            </p>
          </div>
        )}

        {error && (
          <p className="flex items-center gap-1 text-xs text-red-500">
            <AlertCircle className="w-3 h-3" /> {error}
          </p>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          onClick={e => { (e.target as HTMLInputElement).value = '' }}
        />
      </div>

      {/* Crop modal */}
      {cropping && rawSrc && (
        <CropModal
          imgSrc={rawSrc}
          targetW={targetW}
          targetH={targetH}
          aspectLabel={aspectLabel}
          websiteUsage={websiteUsage}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}

      {/* Full preview modal */}
      {preview && value && (
        <div className="fixed inset-0 bg-black/70 z-[500] flex items-center justify-center p-6" onClick={() => setPreview(false)}>
          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-4">
              <div>
                <p className="font-semibold text-gray-900">{label} — Preview</p>
                <p className="text-xs text-gray-400">{targetW} × {targetH}px{aspectLabel ? ` · ${aspectLabel}` : ''}</p>
              </div>
              <button onClick={() => setPreview(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-100">
              <img src={value} alt={label} className="w-full object-cover" style={{ aspectRatio: `${targetW}/${targetH}` }} />
            </div>
            {dims && (
              <p className="text-xs text-gray-400 mt-2 font-mono text-center">
                Natural size: {dims.w}×{dims.h}px · Target: {targetW}×{targetH}px
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
