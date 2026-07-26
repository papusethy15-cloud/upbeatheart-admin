// ── components/upload/GalleryCropUpload.tsx ───────────────────────────────────
// Gallery photo crop enforcer.
// - Accepts any image from the user
// - Opens a crop modal enforcing 4:3 landscape (800 × 600 px)
// - Canvas-renders the crop → uploads the corrected PNG to Cloudinary
// - Returns the Cloudinary URL
// - Zero extra runtime dependencies (canvas only)
//
// Usage:
//   import GalleryCropUpload from '@/components/upload/GalleryCropUpload'
//   <GalleryCropUpload
//     cloudName={CLOUD_NAME}
//     uploadPreset={UPLOAD_PRESET}
//     folder="gallery"
//     onDone={(url) => console.log(url)}
//     onCancel={() => {}}
//   />

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  ZoomIn, ZoomOut, RotateCcw, Check, X,
  Loader2, AlertTriangle, Crop,
} from 'lucide-react'

// ── Output dimensions (4:3 landscape) ────────────────────────────────────────
export const GALLERY_W = 800
export const GALLERY_H = 600
const ASPECT           = GALLERY_W / GALLERY_H  // 1.333…

// Canvas preview dimensions inside modal
const PREVIEW_W = 520
const PREVIEW_H = Math.round(PREVIEW_W / ASPECT)  // 390

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

/** Draw image onto canvas using crop state */
function drawCrop(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  crop: CropState,
  outW: number,
  outH: number,
) {
  const asp = outW / outH

  let viewW: number, viewH: number
  if (img.naturalWidth / img.naturalHeight > asp) {
    viewH = img.naturalHeight; viewW = viewH * asp
  } else {
    viewW = img.naturalWidth; viewH = viewW / asp
  }

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

async function renderBlob(img: HTMLImageElement, crop: CropState): Promise<Blob> {
  const canvas     = document.createElement('canvas')
  canvas.width     = GALLERY_W
  canvas.height    = GALLERY_H
  const ctx        = canvas.getContext('2d')!
  drawCrop(ctx, img, crop, GALLERY_W, GALLERY_H)
  return new Promise((res, rej) =>
    canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/jpeg', 0.92),
  )
}

function getViewDims(img: HTMLImageElement) {
  if (img.naturalWidth / img.naturalHeight > ASPECT) {
    const viewH = img.naturalHeight
    return { viewW: viewH * ASPECT, viewH }
  }
  const viewW = img.naturalWidth
  return { viewW, viewH: viewW / ASPECT }
}

// ── Crop Modal ────────────────────────────────────────────────────────────────
interface CropModalProps {
  imgSrc:     string
  fileName:   string
  onConfirm:  (blob: Blob) => void
  onCancel:   () => void
}

export function GalleryCropModal({ imgSrc, fileName, onConfirm, onCancel }: CropModalProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const imgRef     = useRef<HTMLImageElement | null>(null)
  const lastPt     = useRef({ x: 0, y: 0 })
  const [crop,     setCrop]     = useState<CropState>({ zoom: 1, offset: { x: 0, y: 0 } })
  const [loaded,   setLoaded]   = useState(false)
  const [dragging, setDragging] = useState(false)
  const [rendering, setRendering] = useState(false)

  // Load image
  useEffect(() => {
    const img = new Image()
    img.onload  = () => { imgRef.current = img; setLoaded(true) }
    img.onerror = () => console.error('Failed to load image for crop')
    img.crossOrigin = 'anonymous'
    img.src = imgSrc
  }, [imgSrc])

  // Redraw canvas
  useEffect(() => {
    if (!loaded || !imgRef.current || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')!
    canvas.width  = PREVIEW_W
    canvas.height = PREVIEW_H
    ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H)
    drawCrop(ctx, imgRef.current, crop, PREVIEW_W, PREVIEW_H)

    // Rule-of-thirds grid guide
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.lineWidth   = 0.8
    ;[1/3, 2/3].forEach(f => {
      ctx.beginPath(); ctx.moveTo(PREVIEW_W * f, 0); ctx.lineTo(PREVIEW_W * f, PREVIEW_H); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, PREVIEW_H * f); ctx.lineTo(PREVIEW_W, PREVIEW_H * f); ctx.stroke()
    })

    // Border
    ctx.strokeStyle = 'rgba(21,101,216,0.5)'
    ctx.lineWidth   = 2
    ctx.strokeRect(1, 1, PREVIEW_W - 2, PREVIEW_H - 2)
  }, [crop, loaded])

  // Drag to pan
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    setDragging(true)
    lastPt.current = { x: e.clientX, y: e.clientY }
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !imgRef.current) return
    const { viewW, viewH } = getViewDims(imgRef.current)
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
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    if (!imgRef.current) return
    const { viewW, viewH } = getViewDims(imgRef.current)
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
    const { viewW, viewH } = getViewDims(imgRef.current)
    const msx = (viewW / 2) * (1 - 1 / z)
    const msy = (viewH / 2) * (1 - 1 / z)
    setCrop(c => ({ zoom: z, offset: {
      x: clamp(c.offset.x, -msx, msx),
      y: clamp(c.offset.y, -msy, msy),
    }}))
  }

  const reset = () => setCrop({ zoom: 1, offset: { x: 0, y: 0 } })

  const handleConfirm = async () => {
    if (!imgRef.current) return
    setRendering(true)
    try {
      const blob = await renderBlob(imgRef.current, crop)
      onConfirm(blob)
    } catch {
      setRendering(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[600] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxWidth: 640, width: '100%', maxHeight: '95vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
              <Crop className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">Crop Gallery Photo</p>
              <p className="text-xs text-gray-400 mt-0.5 font-mono">
                Output: {GALLERY_W} × {GALLERY_H}px (4:3 landscape) · {fileName}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Why crop info strip */}
        <div className="bg-amber-50 border-b border-amber-100 px-5 py-2.5 flex items-center gap-2 shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-700">
            Gallery photos must be <span className="font-bold">4:3 landscape</span> so they display correctly in the website grid. Drag &amp; zoom to frame your photo perfectly.
          </p>
        </div>

        {/* Canvas */}
        <div className="overflow-auto flex-1 px-5 pt-4 pb-2 flex flex-col items-center gap-4">
          {!loaded ? (
            <div
              className="flex items-center justify-center bg-gray-100 rounded-2xl"
              style={{ width: PREVIEW_W, height: PREVIEW_H }}
            >
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : (
            <div
              className="relative rounded-2xl overflow-hidden select-none border-2 border-primary/30 shadow-lg"
              style={{
                width:   PREVIEW_W,
                height:  PREVIEW_H,
                cursor:  dragging ? 'grabbing' : 'grab',
                background: '#e5e7eb',
                maxWidth: '100%',
              }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={stopDrag}
              onMouseLeave={stopDrag}
              onWheel={onWheel}
            >
              <canvas ref={canvasRef} style={{ display: 'block', maxWidth: '100%' }} />

              {/* Corner size badge */}
              <div className="absolute bottom-2.5 right-2.5 bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {GALLERY_W} × {GALLERY_H}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400 -mt-2">
            Drag to pan · Scroll to zoom · The preview shows exactly how it will appear on the website
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
            <span className="text-xs font-mono text-gray-500 w-10 text-right shrink-0">
              {Math.round(crop.zoom * 100)}%
            </span>
          </div>

          <div className="flex gap-1.5 flex-wrap">
            {[1, 1.25, 1.5, 2, 3].map(z => (
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
        <div className="flex gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-white transition"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!loaded || rendering}
            onClick={handleConfirm}
            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 transition disabled:opacity-40 shadow-sm"
          >
            {rendering
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
              : <><Check className="w-4 h-4" /> Save Crop &amp; Upload</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
