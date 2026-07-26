// ── components/upload/DoctorPhotoCropUpload.tsx ───────────────────────────────
// Doctor photo uploader with portrait crop + zoom modal.
// Output: 600 × 800px PNG (3:4 ratio) — lossless upload; Cloudinary serves optimised format on delivery.
// Canvas-based crop, zero extra dependencies.
//
// Usage in SettingsPage:
//   <DoctorPhotoCropUpload
//     value={settings.doctorPhotoUrl}
//     onChange={url => update({ doctorPhotoUrl: url })}
//     onRemove={() => update({ doctorPhotoUrl: '' })}
//     disabled={!isAdmin}
//   />

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Upload, X, ZoomIn, ZoomOut, RotateCcw, Check,
  Loader2, Trash2, Eye, AlertCircle, CheckCircle2,
} from 'lucide-react'
import { uploadToCloudinary } from '@/lib/cloudinary'

// ── Output dimensions (portrait 3:4) ─────────────────────────────────────────
const TARGET_W  = 600
const TARGET_H  = 800
const ASPECT    = TARGET_W / TARGET_H   // 0.75

// ── Preview canvas size inside modal ─────────────────────────────────────────
const PREVIEW_W = 300
const PREVIEW_H = Math.round(PREVIEW_W / ASPECT)  // 400

const MIN_ZOOM = 1
const MAX_ZOOM = 5

// ── helpers ───────────────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

interface CropState {
  zoom:   number
  offset: { x: number; y: number }
}

// Compute the source rect and draw image onto a canvas
function drawCrop(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  crop: CropState,
  outW: number,
  outH: number,
) {
  const aspect = outW / outH

  // Fit-box in image-px at zoom=1
  let viewW: number, viewH: number
  if (img.naturalWidth / img.naturalHeight > aspect) {
    viewH = img.naturalHeight; viewW = viewH * aspect
  } else {
    viewW = img.naturalWidth; viewH = viewW / aspect
  }

  const sliceW = viewW / crop.zoom
  const sliceH = viewH / crop.zoom

  const cx0 = img.naturalWidth  / 2
  const cy0 = img.naturalHeight / 2
  const fitL = cx0 - viewW / 2
  const fitT = cy0 - viewH / 2
  const msx = (viewW / 2) * (1 - 1 / crop.zoom)
  const msy = (viewH / 2) * (1 - 1 / crop.zoom)
  const ox  = clamp(crop.offset.x, -msx, msx)
  const oy  = clamp(crop.offset.y, -msy, msy)
  const sx  = clamp(cx0 + ox - sliceW / 2, fitL, fitL + viewW - sliceW)
  const sy  = clamp(cy0 + oy - sliceH / 2, fitT, fitT + viewH - sliceH)

  ctx.drawImage(img, sx, sy, sliceW, sliceH, 0, 0, outW, outH)
}

async function renderBlob(
  img: HTMLImageElement,
  crop: CropState,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width  = TARGET_W
  canvas.height = TARGET_H
  const ctx = canvas.getContext('2d')!
  drawCrop(ctx, img, crop, TARGET_W, TARGET_H)
  return new Promise((res, rej) =>
    canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/png'),
  )
}

// ── CropModal ─────────────────────────────────────────────────────────────────
function CropModal({
  imgSrc,
  onConfirm,
  onCancel,
}: {
  imgSrc:    string
  onConfirm: (img: HTMLImageElement, crop: CropState) => void
  onCancel:  () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef    = useRef<HTMLImageElement | null>(null)
  const lastPt    = useRef({ x: 0, y: 0 })
  const [crop,     setCrop]     = useState<CropState>({ zoom: 1.2, offset: { x: 0, y: 0 } })
  const [loaded,   setLoaded]   = useState(false)
  const [dragging, setDragging] = useState(false)

  // Load image
  useEffect(() => {
    const img = new Image()
    img.onload  = () => { imgRef.current = img; setLoaded(true) }
    img.onerror = () => console.error('Failed to load image for crop')
    img.crossOrigin = 'anonymous'
    img.src = imgSrc
  }, [imgSrc])

  // Redraw canvas whenever crop or image changes
  useEffect(() => {
    if (!loaded || !imgRef.current || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')!
    canvas.width  = PREVIEW_W
    canvas.height = PREVIEW_H
    ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H)
    drawCrop(ctx, imgRef.current, crop, PREVIEW_W, PREVIEW_H)

    // Rule-of-thirds guide
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth   = 0.7
    ;[1/3, 2/3].forEach(f => {
      ctx.beginPath(); ctx.moveTo(PREVIEW_W * f, 0); ctx.lineTo(PREVIEW_W * f, PREVIEW_H); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, PREVIEW_H * f); ctx.lineTo(PREVIEW_W, PREVIEW_H * f); ctx.stroke()
    })

    // Face guide circle — where the face should sit (upper third)
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'
    ctx.lineWidth   = 1.5
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.arc(PREVIEW_W / 2, PREVIEW_H * 0.28, PREVIEW_W * 0.28, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth   = 1.5
    ctx.strokeRect(0.75, 0.75, PREVIEW_W - 1.5, PREVIEW_H - 1.5)
  }, [crop, loaded])

  // Drag-to-pan helpers
  const getViewDims = () => {
    const img = imgRef.current!
    if (img.naturalWidth / img.naturalHeight > ASPECT) {
      const viewH = img.naturalHeight
      return { viewW: viewH * ASPECT, viewH }
    }
    const viewW = img.naturalWidth
    return { viewW, viewH: viewW / ASPECT }
  }

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    setDragging(true)
    lastPt.current = { x: e.clientX, y: e.clientY }
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !imgRef.current) return
    const { viewW, viewH } = getViewDims()
    const dx = e.clientX - lastPt.current.x
    const dy = e.clientY - lastPt.current.y
    lastPt.current = { x: e.clientX, y: e.clientY }
    const pxX = (viewW / PREVIEW_W) / crop.zoom
    const pxY = (viewH / PREVIEW_H) / crop.zoom
    setCrop(c => {
      const msx = (viewW / 2) * (1 - 1 / c.zoom)
      const msy = (viewH / 2) * (1 - 1 / c.zoom)
      return { ...c, offset: {
        x: clamp(c.offset.x - dx * pxX, -msx, msx),
        y: clamp(c.offset.y - dy * pxY, -msy, msy),
      }}
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, crop.zoom])

  const stopDrag = useCallback(() => setDragging(false), [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.12 : 0.12
    if (!imgRef.current) return
    const { viewW, viewH } = getViewDims()
    setCrop(c => {
      const z   = clamp(c.zoom + delta, MIN_ZOOM, MAX_ZOOM)
      const msx = (viewW / 2) * (1 - 1 / z)
      const msy = (viewH / 2) * (1 - 1 / z)
      return { zoom: z, offset: {
        x: clamp(c.offset.x, -msx, msx),
        y: clamp(c.offset.y, -msy, msy),
      }}
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setZoom = (z: number) => {
    if (!imgRef.current) return
    const { viewW, viewH } = getViewDims()
    const msx = (viewW / 2) * (1 - 1 / z)
    const msy = (viewH / 2) * (1 - 1 / z)
    setCrop(c => ({ zoom: z, offset: {
      x: clamp(c.offset.x, -msx, msx),
      y: clamp(c.offset.y, -msy, msy),
    }}))
  }

  const reset = () => setCrop({ zoom: 1.2, offset: { x: 0, y: 0 } })

  return (
    <div
      className="fixed inset-0 z-[600] bg-black/80 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full overflow-hidden"
        style={{ maxWidth: 520 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="font-bold text-gray-900 text-sm">Crop Doctor Photo</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Drag to reposition · Scroll or slider to zoom · Output: {TARGET_W}×{TARGET_H}px (portrait)
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-4 pb-2 flex gap-5 items-start">
          {/* Canvas crop area */}
          <div className="flex-shrink-0">
            {!loaded ? (
              <div
                className="flex items-center justify-center bg-gray-100 rounded-xl"
                style={{ width: PREVIEW_W, height: PREVIEW_H }}
              >
                <Loader2 className="w-7 h-7 text-primary animate-spin" />
              </div>
            ) : (
              <div
                className="relative rounded-xl overflow-hidden select-none border border-gray-200"
                style={{
                  width:  PREVIEW_W,
                  height: PREVIEW_H,
                  cursor: dragging ? 'grabbing' : 'grab',
                  background: '#e5e7eb',
                }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={stopDrag}
                onMouseLeave={stopDrag}
                onWheel={onWheel}
              >
                <canvas ref={canvasRef} style={{ display: 'block' }} />
              </div>
            )}
            <p className="text-center text-[10px] text-gray-400 mt-1.5">
              Position face inside the circle guide
            </p>
          </div>

          {/* Right: instructions + mini preview */}
          <div className="flex-1 min-w-0 space-y-4 pt-1">
            {/* Live circular preview (how it looks in hero) */}
            {loaded && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                  Hero preview
                </p>
                <HeroMiniPreview imgSrc={imgSrc} crop={crop} />
              </div>
            )}

            {/* Tips */}
            <div className="bg-blue-50 rounded-xl p-3 space-y-1.5">
              <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">Tips</p>
              {[
                'Position face inside the circle guide',
                'Drag to pan the photo',
                'Scroll to zoom in/out',
                'Show face + shoulders for best look',
              ].map(t => (
                <div key={t} className="flex items-start gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                  <span className="text-[11px] text-blue-600">{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Zoom controls */}
        <div className="px-5 py-3 space-y-2.5">
          <div className="flex items-center gap-3">
            <ZoomOut className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              type="range"
              min={MIN_ZOOM * 100}
              max={MAX_ZOOM * 100}
              value={Math.round(crop.zoom * 100)}
              onChange={e => setZoom(Number(e.target.value) / 100)}
              className="flex-1 h-1.5 accent-primary cursor-pointer"
            />
            <ZoomIn className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-xs font-mono text-gray-500 w-10 text-right shrink-0">
              {Math.round(crop.zoom * 100)}%
            </span>
          </div>

          <div className="flex gap-1.5 flex-wrap">
            {[1, 1.2, 1.5, 2, 2.5].map(z => (
              <button
                key={z}
                type="button"
                onClick={() => setZoom(z)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                  Math.abs(crop.zoom - z) < 0.06
                    ? 'bg-primary text-white border-primary'
                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-primary/40'
                }`}
              >
                {z}×
              </button>
            ))}
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-gray-200 bg-gray-50 text-gray-500 hover:border-primary/40 transition ml-auto"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-white transition"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!loaded}
            onClick={() => loaded && imgRef.current && onConfirm(imgRef.current, crop)}
            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 transition disabled:opacity-40 shadow-sm"
          >
            <Check className="w-4 h-4" /> Save this crop
          </button>
        </div>
      </div>
    </div>
  )
}

// ── HeroMiniPreview — shows how photo will look in the hero card ───────────────
function HeroMiniPreview({ imgSrc, crop }: { imgSrc: string; crop: CropState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef    = useRef<HTMLImageElement | null>(null)
  const W = 80, H = Math.round(W / ASPECT)  // 80×107

  useEffect(() => {
    const img = new Image()
    img.onload = () => { imgRef.current = img; draw() }
    img.crossOrigin = 'anonymous'
    img.src = imgSrc
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgSrc])

  const draw = useCallback(() => {
    if (!canvasRef.current || !imgRef.current) return
    const canvas = canvasRef.current
    canvas.width  = W
    canvas.height = H
    const ctx = canvas.getContext('2d')!
    drawCrop(ctx, imgRef.current, crop, W, H)
  }, [crop])

  useEffect(() => { draw() }, [draw])

  return (
    <div className="flex items-end gap-3">
      {/* Portrait card preview */}
      <div className="flex flex-col items-center gap-1">
        <div
          className="rounded-xl overflow-hidden border-2 border-primary shadow-md"
          style={{ width: W, height: H }}
        >
          <canvas ref={canvasRef} style={{ display: 'block', width: W, height: H }} />
        </div>
        <span className="text-[9px] text-gray-400">Hero card</span>
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
interface Props {
  value:     string
  onChange:  (url: string) => void
  onRemove:  () => void
  disabled?: boolean
}

export default function DoctorPhotoCropUpload({
  value, onChange, onRemove, disabled = false,
}: Props) {
  const fileRef  = useRef<HTMLInputElement>(null)
  const [rawSrc,    setRawSrc]    = useState<string | null>(null)
  const [cropping,  setCropping]  = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress,  setProgress]  = useState(0)
  const [error,     setError]     = useState('')
  const [preview,   setPreview]   = useState(false)

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Only image files accepted'); return }
    if (file.size > 20 * 1024 * 1024)   { setError('Max file size: 20 MB'); return }
    setError('')
    setRawSrc(URL.createObjectURL(file))
    setCropping(true)
  }

  const handleConfirm = async (img: HTMLImageElement, crop: CropState) => {
    setCropping(false)
    setUploading(true)
    setProgress(0)
    try {
      const blob   = await renderBlob(img, crop)
      const file   = new File([blob], 'doctor-photo.png', { type: 'image/png' })
      const result = await uploadToCloudinary(file, 'upbeat_public', setProgress)
      onChange(result.url)
    } catch (e: any) {
      setError(e.message || 'Upload failed')
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

  return (
    <>
      <div className="space-y-3">
        {/* Label */}
        <div>
          <p className="text-sm font-semibold text-gray-800">Doctor Photo</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Professional headshot used on the hero section, About page, and campaign pages.
          </p>
          <p className="text-xs text-gray-300 mt-0.5 font-mono">
            Saved as {TARGET_W}×{TARGET_H}px portrait (3:4, PNG) · You crop & zoom before saving
          </p>
        </div>

        {value ? (
          /* ── Has photo ── */
          <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
            {/* Thumbnail */}
            <div
              className="rounded-xl overflow-hidden border-2 border-primary/30 shadow-sm shrink-0"
              style={{ width: 72, height: 96 }}
            >
              <img
                src={value}
                alt="Doctor"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Photo saved ({TARGET_W}×{TARGET_H}px PNG)
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5 font-mono truncate">
                {value.split('/').slice(-2).join('/')}
              </p>
              <div className="flex gap-2 mt-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => setPreview(true)}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-white transition"
                >
                  <Eye className="w-3 h-3" /> Preview
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={disabled || uploading}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition disabled:opacity-40"
                >
                  <Upload className="w-3 h-3" /> Replace
                </button>
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={disabled}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs text-red-500 border border-red-100 rounded-lg hover:bg-red-50 transition disabled:opacity-40"
                >
                  <Trash2 className="w-3 h-3" /> Remove
                </button>
              </div>
            </div>
          </div>
        ) : uploading ? (
          /* ── Uploading ── */
          <div className="border-2 border-primary/30 rounded-2xl p-7 text-center bg-primary/5">
            <Loader2 className="w-7 h-7 text-primary animate-spin mx-auto mb-2" />
            <div className="w-48 mx-auto h-1.5 bg-white rounded-full overflow-hidden mt-2">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-primary font-medium mt-2">
              Uploading cropped photo… {progress}%
            </p>
          </div>
        ) : (
          /* ── Empty drop zone ── */
          <div
            onClick={() => !disabled && !uploading && fileRef.current?.click()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            onDragOver={e => e.preventDefault()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center transition cursor-pointer select-none
              ${disabled
                ? 'opacity-50 cursor-not-allowed border-gray-200'
                : 'border-gray-200 hover:border-primary/40 hover:bg-primary/5'
              }`}
          >
            <div className="w-12 h-16 rounded-xl bg-gray-100 mx-auto mb-3 flex items-center justify-center">
              <Upload className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-sm font-semibold text-gray-500">Click or drag photo here</p>
            <p className="text-xs text-gray-300 mt-1">JPG, PNG, WebP · Max 20 MB</p>
            <p className="text-xs text-gray-300 mt-0.5">
              A crop & zoom modal will open so you can frame it perfectly
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
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}

      {/* Full preview modal */}
      {preview && value && (
        <div
          className="fixed inset-0 bg-black/70 z-[500] flex items-center justify-center p-6"
          onClick={() => setPreview(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 shadow-2xl"
            style={{ maxWidth: 400, width: '100%' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between mb-4">
              <p className="font-semibold text-gray-900">Doctor Photo Preview</p>
              <button
                onClick={() => setPreview(false)}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="flex gap-4 items-start">
              {/* Portrait preview */}
              <div>
                <div
                  className="rounded-2xl overflow-hidden border-2 border-primary shadow-md mx-auto"
                  style={{ width: 120, height: 160 }}
                >
                  <img
                    src={value}
                    alt="Doctor"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>
                <p className="text-center text-[10px] text-gray-400 mt-1">Hero card</p>
              </div>
              {/* Square crop preview (About page) */}
              <div>
                <div
                  className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm mx-auto"
                  style={{ width: 120, height: 120 }}
                >
                  <img
                    src={value}
                    alt="Doctor"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }}
                  />
                </div>
                <p className="text-center text-[10px] text-gray-400 mt-1">About page</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
