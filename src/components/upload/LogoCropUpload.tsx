// ── components/upload/LogoCropUpload.tsx ──────────────────────────────────────
// Logo uploader with crop + zoom modal (Canvas-based, zero extra deps)
// Outputs a cropped PNG at exact target dimensions before Cloudinary upload.
//
// Props:
//   targetW / targetH  — exact output pixel dimensions (e.g. 400 × 120)
//   aspectRatio        — enforced crop box ratio (targetW / targetH)
//   preset             — Cloudinary unsigned upload preset
//   value              — current saved URL (string)
//   onChange           — called with new URL after successful upload
//   onRemove           — called when user removes
//   label / hint       — display text
//   disabled           — block interaction (non-admin)

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Upload, X, ZoomIn, ZoomOut, RotateCcw, Check, Loader2,
  Trash2, Eye, ExternalLink, AlertCircle, CheckCircle2, Move,
} from 'lucide-react'
import { uploadToCloudinary } from '@/lib/cloudinary'

// ── types ─────────────────────────────────────────────────────────────────────
interface Point { x: number; y: number }

interface CropState {
  zoom:   number   // 1 = fit, >1 = zoomed in
  offset: Point    // pan offset in image pixels
}

interface Props {
  targetW:     number         // output width  px
  targetH:     number         // output height px
  preset:      string         // Cloudinary upload preset
  value:       string         // current URL
  onChange:    (url: string) => void
  onRemove:    () => void
  label?:      string
  hint?:       string
  disabled?:   boolean
  accept?:     string
}

// ── constants ─────────────────────────────────────────────────────────────────
const MIN_ZOOM = 1
const MAX_ZOOM = 5
// Max canvas width = modal max-w-lg (512px) minus px-5 padding on each side (20px*2) minus border (2px)
const MAX_PREVIEW_W = 452   // px — usable width inside the crop modal
const MAX_PREVIEW_H = 320   // px — max height cap so tall-aspect images don't make an enormous modal

// ── helpers ───────────────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

// Draw the image onto a canvas with the given crop/zoom, return a Blob
async function renderCroppedBlob(
  img: HTMLImageElement,
  crop: CropState,
  targetW: number,
  targetH: number,
): Promise<Blob> {
  const aspect = targetW / targetH

  // How many image pixels fit in the viewport at zoom=1
  let viewW: number, viewH: number
  if (img.naturalWidth / img.naturalHeight > aspect) {
    viewH = img.naturalHeight
    viewW = viewH * aspect
  } else {
    viewW = img.naturalWidth
    viewH = viewW / aspect
  }

  // Zoomed viewport (smaller slice of image = zoomed in)
  const sliceW = viewW / crop.zoom
  const sliceH = viewH / crop.zoom

  // Centre of image in natural px, shifted by offset
  // Clamp so the slice never goes outside the letterboxed fit area
  const centerX = img.naturalWidth  / 2
  const centerY = img.naturalHeight / 2
  const fitLeft  = centerX - viewW / 2
  const fitTop   = centerY - viewH / 2
  const maxShiftX = (viewW / 2) * (1 - 1 / crop.zoom)
  const maxShiftY = (viewH / 2) * (1 - 1 / crop.zoom)
  const ox = clamp(crop.offset.x, -maxShiftX, maxShiftX)
  const oy = clamp(crop.offset.y, -maxShiftY, maxShiftY)
  const cx = centerX + ox
  const cy = centerY + oy

  const sx = clamp(cx - sliceW / 2, fitLeft, fitLeft + viewW - sliceW)
  const sy = clamp(cy - sliceH / 2, fitTop,  fitTop  + viewH - sliceH)

  const canvas = document.createElement('canvas')
  canvas.width  = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, sx, sy, sliceW, sliceH, 0, 0, targetW, targetH)

  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas toBlob failed')), 'image/png', 0.95)
  })
}

// ── CropModal ─────────────────────────────────────────────────────────────────
function CropModal({
  imgSrc, targetW, targetH, onConfirm, onCancel,
}: {
  imgSrc: string
  targetW: number
  targetH: number
  onConfirm: (img: HTMLImageElement, crop: CropState) => void
  onCancel: () => void
}) {
  const aspect = targetW / targetH
  // Fit the canvas inside the modal: width-constrained first, then height-capped
  const previewW = Math.min(MAX_PREVIEW_W, Math.round(MAX_PREVIEW_H * aspect))
  const previewH = Math.round(previewW / aspect)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef    = useRef<HTMLImageElement | null>(null)
  const [crop, setCrop] = useState<CropState>({ zoom: 1, offset: { x: 0, y: 0 } })
  const [loaded, setLoaded] = useState(false)
  const [dragging, setDragging] = useState(false)
  const lastPt = useRef<Point>({ x: 0, y: 0 })

  // Load image
  useEffect(() => {
    const img = new Image()
    img.onload = () => { imgRef.current = img; setLoaded(true) }
    img.crossOrigin = 'anonymous'
    img.src = imgSrc
  }, [imgSrc])

  // Draw preview
  useEffect(() => {
    if (!loaded || !imgRef.current || !canvasRef.current) return
    const img    = imgRef.current
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')!

    canvas.width  = previewW
    canvas.height = previewH

    // Same logic as renderCroppedBlob but onto the preview canvas
    let viewW: number, viewH: number
    if (img.naturalWidth / img.naturalHeight > aspect) {
      viewH = img.naturalHeight; viewW = viewH * aspect
    } else {
      viewW = img.naturalWidth; viewH = viewW / aspect
    }
    const sliceW = viewW / crop.zoom
    const sliceH = viewH / crop.zoom
    const centerX = img.naturalWidth  / 2
    const centerY = img.naturalHeight / 2
    const fitLeft  = centerX - viewW / 2
    const fitTop   = centerY - viewH / 2
    const msx = (viewW / 2) * (1 - 1 / crop.zoom)
    const msy = (viewH / 2) * (1 - 1 / crop.zoom)
    const ox = clamp(crop.offset.x, -msx, msx)
    const oy = clamp(crop.offset.y, -msy, msy)
    const cx = centerX + ox
    const cy = centerY + oy
    const sx = clamp(cx - sliceW / 2, fitLeft, fitLeft + viewW - sliceW)
    const sy = clamp(cy - sliceH / 2, fitTop,  fitTop  + viewH - sliceH)

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, sx, sy, sliceW, sliceH, 0, 0, previewW, previewH)

    // Rule-of-thirds grid overlay
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 0.8
    ;[1/3, 2/3].forEach(f => {
      ctx.beginPath(); ctx.moveTo(previewW * f, 0); ctx.lineTo(previewW * f, previewH); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, previewH * f); ctx.lineTo(previewW, previewH * f); ctx.stroke()
    })

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(0.75, 0.75, previewW - 1.5, previewH - 1.5)
  }, [crop, loaded, aspect, previewW, previewH])

  // Drag-to-pan
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    setDragging(true)
    lastPt.current = { x: e.clientX, y: e.clientY }
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !imgRef.current) return
    const img = imgRef.current
    const dx = (e.clientX - lastPt.current.x)
    const dy = (e.clientY - lastPt.current.y)
    lastPt.current = { x: e.clientX, y: e.clientY }

    // Compute the same fit-viewport dimensions used by the draw logic
    let viewW: number, viewH: number
    if (img.naturalWidth / img.naturalHeight > aspect) {
      viewH = img.naturalHeight; viewW = viewH * aspect
    } else {
      viewW = img.naturalWidth; viewH = viewW / aspect
    }

    // Convert screen-px delta → image-px delta.
    // The preview canvas is (previewW × previewH) and shows viewW × viewH image pixels
    // divided by the current zoom, so 1 screen-px = (viewW / previewW / zoom) image-px.
    const imgPxPerScreenPxX = (viewW / previewW)  / crop.zoom
    const imgPxPerScreenPxY = (viewH / previewH) / crop.zoom

    setCrop(c => {
      const nx = c.offset.x - dx * imgPxPerScreenPxX
      const ny = c.offset.y - dy * imgPxPerScreenPxY

      // Max offset: how far the centre can move before the slice hits the image edge.
      // sliceW = viewW / zoom, so the centre can shift by at most (viewW - sliceW) / 2
      // = viewW/2 * (1 - 1/zoom) in image pixels.
      const maxShiftX = (viewW / 2) * (1 - 1 / c.zoom)
      const maxShiftY = (viewH / 2) * (1 - 1 / c.zoom)
      return { ...c, offset: { x: clamp(nx, -maxShiftX, maxShiftX), y: clamp(ny, -maxShiftY, maxShiftY) } }
    })
  }, [dragging, crop.zoom, previewW, previewH, aspect])

  const stopDrag = useCallback(() => setDragging(false), [])

  // Zoom via wheel
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    if (!imgRef.current) return
    const img = imgRef.current
    let viewW: number, viewH: number
    if (img.naturalWidth / img.naturalHeight > aspect) {
      viewH = img.naturalHeight; viewW = viewH * aspect
    } else {
      viewW = img.naturalWidth; viewH = viewW / aspect
    }
    setCrop(c => {
      const newZoom = clamp(c.zoom + delta, MIN_ZOOM, MAX_ZOOM)
      // Re-clamp offset so zooming out never leaves the view outside the image
      const maxShiftX = (viewW / 2) * (1 - 1 / newZoom)
      const maxShiftY = (viewH / 2) * (1 - 1 / newZoom)
      return {
        zoom: newZoom,
        offset: {
          x: clamp(c.offset.x, -maxShiftX, maxShiftX),
          y: clamp(c.offset.y, -maxShiftY, maxShiftY),
        },
      }
    })
  }, [aspect])

  const reset = () => setCrop({ zoom: 1, offset: { x: 0, y: 0 } })

  return (
    <div className="fixed inset-0 z-[600] bg-black/75 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="font-semibold text-gray-900 text-sm">Crop & Zoom Logo</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Output: {targetW} × {targetH}px · Drag to pan · Scroll or slider to zoom
            </p>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Canvas preview */}
        <div className="px-5 py-4">
          {!loaded ? (
            <div className="flex items-center justify-center bg-gray-50 rounded-xl" style={{ height: previewH }}>
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : (
            <div
              className="relative mx-auto overflow-hidden rounded-xl select-none"
              style={{ width: previewW, height: previewH, cursor: dragging ? 'grabbing' : 'grab', background: '#f3f4f6' }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={stopDrag}
              onMouseLeave={stopDrag}
              onWheel={onWheel}
            >
              <canvas ref={canvasRef} style={{ display: 'block' }} />
              {/* Move icon hint */}
              <div className="absolute top-2 right-2 bg-black/40 rounded-lg px-1.5 py-1 flex items-center gap-1 pointer-events-none">
                <Move className="w-3 h-3 text-white/80" />
                <span className="text-[10px] text-white/80">drag to pan</span>
              </div>
            </div>
          )}

          {/* Checkerboard background hint for transparency */}
          <p className="text-center text-[10px] text-gray-400 mt-1.5">
            Final size: {targetW} × {targetH}px PNG — transparent areas preserved
          </p>
        </div>

        {/* Zoom controls */}
        <div className="px-5 pb-4 space-y-3">
          <div className="flex items-center gap-3">
            <ZoomOut className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              type="range"
              min={MIN_ZOOM * 100}
              max={MAX_ZOOM * 100}
              value={Math.round(crop.zoom * 100)}
              onChange={e => {
                const newZoom = Number(e.target.value) / 100
                if (!imgRef.current) return
                const img = imgRef.current
                let viewW: number, viewH: number
                if (img.naturalWidth / img.naturalHeight > aspect) { viewH = img.naturalHeight; viewW = viewH * aspect } else { viewW = img.naturalWidth; viewH = viewW / aspect }
                const msx = (viewW / 2) * (1 - 1 / newZoom)
                const msy = (viewH / 2) * (1 - 1 / newZoom)
                setCrop(c => ({ zoom: newZoom, offset: { x: clamp(c.offset.x, -msx, msx), y: clamp(c.offset.y, -msy, msy) } }))
              }}
              className="flex-1 h-1.5 accent-primary cursor-pointer"
            />
            <ZoomIn className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-xs font-mono text-gray-500 w-12 text-right shrink-0">
              {Math.round(crop.zoom * 100)}%
            </span>
          </div>

          {/* Zoom presets */}
          <div className="flex gap-1.5 flex-wrap">
            {[1, 1.5, 2, 3].map(z => (
              <button key={z} type="button"
                onClick={() => {
                if (!imgRef.current) return
                const img = imgRef.current
                let viewW: number, viewH: number
                if (img.naturalWidth / img.naturalHeight > aspect) { viewH = img.naturalHeight; viewW = viewH * aspect } else { viewW = img.naturalWidth; viewH = viewW / aspect }
                const msx = (viewW / 2) * (1 - 1 / z)
                const msy = (viewH / 2) * (1 - 1 / z)
                setCrop(c => ({ zoom: z, offset: { x: clamp(c.offset.x, -msx, msx), y: clamp(c.offset.y, -msy, msy) } }))
              }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                  Math.abs(crop.zoom - z) < 0.05
                    ? 'bg-primary text-white border-primary'
                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-primary/40'
                }`}>
                {z}×
              </button>
            ))}
            <button type="button" onClick={reset}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-gray-200 bg-gray-50 text-gray-500 hover:border-primary/40 transition ml-auto">
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50">
          <button type="button" onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-white transition">
            Cancel
          </button>
          <button
            type="button"
            disabled={!loaded}
            onClick={() => loaded && imgRef.current && onConfirm(imgRef.current, crop)}
            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 transition disabled:opacity-40 shadow-sm"
          >
            <Check className="w-4 h-4" /> Use this crop
          </button>
        </div>
      </div>
    </div>
  )
}

// ── LogoCropUpload (main export) ──────────────────────────────────────────────
export default function LogoCropUpload({
  targetW, targetH, preset, value, onChange, onRemove,
  label = 'Logo', hint, disabled = false,
  accept = 'image/svg+xml,image/png,image/webp,image/jpeg',
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [rawSrc,    setRawSrc]    = useState<string | null>(null)   // local object URL for crop modal
  const [cropping,  setCropping]  = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress,  setProgress]  = useState(0)
  const [error,     setError]     = useState('')
  const [preview,   setPreview]   = useState(false)

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Only image files accepted'); return }
    if (file.size > 20 * 1024 * 1024)   { setError('Max 20 MB'); return }
    setError('')
    // SVG: upload directly (vector, no crop needed)
    if (file.type === 'image/svg+xml') {
      uploadFile(file)
      return
    }
    // Raster: open crop modal
    const url = URL.createObjectURL(file)
    setRawSrc(url)
    setCropping(true)
  }

  const uploadFile = async (file: File) => {
    setUploading(true); setProgress(0)
    try {
      const result = await uploadToCloudinary(file, preset, setProgress)
      onChange(result.url)
    } catch (e: any) { setError(e.message || 'Upload failed') }
    setUploading(false); setProgress(0)
  }

  const handleCropConfirm = async (img: HTMLImageElement, crop: CropState) => {
    setCropping(false)
    setUploading(true); setProgress(0)
    try {
      const blob = await renderCroppedBlob(img, crop, targetW, targetH)
      const file = new File([blob], 'logo.png', { type: 'image/png' })
      const result = await uploadToCloudinary(file, preset, setProgress)
      onChange(result.url)
    } catch (e: any) { setError(e.message || 'Crop/upload failed') }
    if (rawSrc) URL.revokeObjectURL(rawSrc)
    setRawSrc(null)
    setUploading(false); setProgress(0)
  }

  const handleCropCancel = () => {
    setCropping(false)
    if (rawSrc) URL.revokeObjectURL(rawSrc)
    setRawSrc(null)
  }

  return (
    <>
      <div className="space-y-2">
        <div>
          <p className="text-sm font-semibold text-gray-800">{label}</p>
          {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
          <p className="text-xs text-gray-300 mt-0.5 font-mono">Target: {targetW} × {targetH}px</p>
        </div>

        {value ? (
          /* ── Saved state ── */
          <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
            {/* Checkerboard bg to show transparency */}
            <div
              className="w-20 h-10 rounded-xl overflow-hidden border border-gray-200 shrink-0 flex items-center justify-center"
              style={{
                backgroundImage: 'repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%)',
                backgroundSize: '12px 12px',
              }}
            >
              <img src={value} alt={label} className="max-w-full max-h-full object-contain" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-gray-500 font-mono truncate">{value.split('/').slice(-2).join('/')}</p>
              <p className="text-xs text-emerald-600 font-medium mt-0.5 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Saved · {targetW}×{targetH}px
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
            <p className="text-xs text-primary font-medium mt-2">Uploading cropped logo… {progress}%</p>
          </div>
        ) : (
          /* ── Empty / drop zone ── */
          <div
            onClick={() => !disabled && !uploading && fileRef.current?.click()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            onDragOver={e => e.preventDefault()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center transition cursor-pointer select-none
              ${disabled ? 'opacity-50 cursor-not-allowed border-gray-200' : 'border-gray-200 hover:border-primary/40 hover:bg-primary/5'}`}
          >
            <Upload className="w-7 h-7 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-500">Click or drag to upload</p>
            <p className="text-xs text-gray-300 mt-1">PNG, SVG, WebP — will be cropped to {targetW}×{targetH}px</p>
            <p className="text-xs text-gray-300 mt-0.5">SVG files upload directly without cropping</p>
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
          accept={accept}
          className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          onClick={e => { (e.target as HTMLInputElement).value = '' }}
        />
      </div>

      {/* ── Crop modal ── */}
      {cropping && rawSrc && (
        <CropModal
          imgSrc={rawSrc}
          targetW={targetW}
          targetH={targetH}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}

      {/* ── Full-size preview modal ── */}
      {preview && value && (
        <div className="fixed inset-0 bg-black/70 z-[500] flex items-center justify-center p-6" onClick={() => setPreview(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-4">
              <div>
                <p className="font-semibold text-gray-900">{label} — Full Preview</p>
                <p className="text-xs text-gray-400">{targetW} × {targetH}px</p>
              </div>
              <button onClick={() => setPreview(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>

            {/* White background preview */}
            <div className="bg-white rounded-xl p-6 border border-gray-100 flex items-center justify-center mb-3">
              <img src={value} alt={label} className="max-w-full max-h-28 object-contain" />
            </div>

            {/* Dark background preview */}
            <div className="bg-gray-900 rounded-xl p-6 flex items-center justify-center mb-3">
              <img src={value} alt={label} className="max-w-full max-h-28 object-contain" />
            </div>

            {/* Transparent bg */}
            <div className="rounded-xl p-6 flex items-center justify-center mb-3"
              style={{ backgroundImage: 'repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%)', backgroundSize: '16px 16px' }}>
              <img src={value} alt={label} className="max-w-full max-h-28 object-contain" />
            </div>

            <a href={value} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline">
              <ExternalLink className="w-3 h-3" /> Open in Cloudinary
            </a>
          </div>
        </div>
      )}
    </>
  )
}
