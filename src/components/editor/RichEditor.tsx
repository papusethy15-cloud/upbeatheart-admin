import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table'
import { TableCell } from '@tiptap/extension-table'
import { TableHeader } from '@tiptap/extension-table'
import Youtube from '@tiptap/extension-youtube'
import { useEffect, useState, useRef } from 'react'
import clsx from 'clsx'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Quote, Code, Minus,
  Link as LinkIcon, Image as ImageIcon, Youtube as YoutubeIcon,
  Table as TableIcon, Highlighter, Palette,
  Undo, Redo, Type, ChevronDown, X, Plus,
  ZoomIn, ZoomOut, Move, RotateCcw,
  Columns, Rows, Trash2, SplitSquareHorizontal,
  Film,
} from 'lucide-react'

// ─── Custom Image with resize attrs ──────────────────────────────────────────
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('style'),
        renderHTML: (attrs: Record<string, string>) => attrs.style ? { style: attrs.style } : {},
      },
      'data-align': {
        default: 'none',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-align'),
        renderHTML: (attrs: Record<string, string>) => ({ 'data-align': attrs['data-align'] }),
      },
    }
  },
})

// ─── Toolbar button ───────────────────────────────────────────────────────────
function ToolBtn({ onClick, active = false, disabled = false, title, children, className = '' }: {
  onClick: () => void; active?: boolean; disabled?: boolean
  title: string; children: React.ReactNode; className?: string
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      className={clsx('p-1.5 rounded-md transition text-sm',
        active ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
        disabled && 'opacity-30 cursor-not-allowed', className)}>
      {children}
    </button>
  )
}

function Divider() { return <div className="w-px h-5 bg-gray-200 mx-0.5 shrink-0" /> }

// ─── Heading dropdown ─────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function HeadingDropdown({ editor }: { editor: any }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  if (!editor) return null
  const current = editor.isActive('heading', { level: 1 }) ? 'H1' : editor.isActive('heading', { level: 2 }) ? 'H2' :
    editor.isActive('heading', { level: 3 }) ? 'H3' : editor.isActive('heading', { level: 4 }) ? 'H4' : 'P'
  const levels = [
    { label: 'Paragraph', cmd: () => editor.chain().focus().setParagraph().run(), mark: 'P' },
    { label: 'Heading 1', cmd: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), mark: 'H1' },
    { label: 'Heading 2', cmd: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), mark: 'H2' },
    { label: 'Heading 3', cmd: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), mark: 'H3' },
    { label: 'Heading 4', cmd: () => editor.chain().focus().toggleHeading({ level: 4 }).run(), mark: 'H4' },
  ]
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(p => !p)}
        className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-semibold text-gray-700 hover:bg-gray-100 transition min-w-[48px]">
        <Type className="w-3.5 h-3.5" />{current}<ChevronDown className="w-3 h-3 text-gray-400" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 w-36">
          {levels.map(l => (
            <button key={l.mark} type="button" onClick={() => { l.cmd(); setOpen(false) }}
              className={clsx('w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition', current === l.mark ? 'text-primary font-semibold' : 'text-gray-700')}>
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Gallery Image Dialog (for inserting images into content) ─────────────────
function ImageDialog({ onInsert, onClose }: { onInsert: (url: string, align: string, width: string) => void; onClose: () => void }) {
  const [tab, setTab]         = useState<'gallery'|'upload'|'url'>('gallery')
  const [url, setUrl]         = useState('')
  const [align, setAlign]     = useState('center')
  const [width, setWidth]     = useState('100%')
  const [zoom, setZoom]       = useState(100)
  const [uploading, setUploading] = useState(false)
  const [recentUrls, setRecentUrls] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  // Load recent images from localStorage
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('upbeat_recent_images') || '[]')
      setRecentUrls(saved)
    } catch {}
  }, [])

  const saveRecent = (imgUrl: string) => {
    try {
      const existing: string[] = JSON.parse(localStorage.getItem('upbeat_recent_images') || '[]')
      const updated = [imgUrl, ...existing.filter(u => u !== imgUrl)].slice(0, 20)
      localStorage.setItem('upbeat_recent_images', JSON.stringify(updated))
    } catch {}
  }

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('upload_preset', 'upbeat_public')
      fd.append('folder', 'blogs/content')
      const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'boc8bvoc'
      const res  = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: fd })
      const data = await res.json()
      if (data.secure_url) { setUrl(data.secure_url); saveRecent(data.secure_url); setTab('url') }
    } catch {}
    setUploading(false)
  }

  const selectFromGallery = (imgUrl: string) => { setUrl(imgUrl); setTab('url') }

  const handleInsert = () => {
    if (!url.trim()) return
    saveRecent(url.trim())
    const w = zoom !== 100 ? `${zoom}%` : width
    onInsert(url.trim(), align, w)
  }

  // Get dimensions from image URL (displayed in UI)
  const [dims, setDims] = useState<{w:number,h:number}|null>(null)
  useEffect(() => {
    if (!url) { setDims(null); return }
    const img = new window.Image(); img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight }); img.src = url
  }, [url])

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-[720px] max-w-[98vw] max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2"><ImageIcon className="w-4 h-4 text-primary" /> Insert Image</h3>
          <button type="button" onClick={onClose}><X className="w-4 h-4 text-gray-400 hover:text-gray-600" /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-3 border-b border-gray-100">
          {(['gallery','upload','url'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition capitalize ${tab===t ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-700'}`}>
              {t === 'gallery' ? '🖼 Recent Images' : t === 'upload' ? '⬆ Upload New' : '🔗 Paste URL'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Gallery tab */}
          {tab === 'gallery' && (
            recentUrls.length === 0 ? (
              <div className="text-center py-12 text-gray-300">
                <ImageIcon className="w-12 h-12 mx-auto mb-3" />
                <p className="text-sm">No images uploaded yet.</p>
                <p className="text-xs mt-1">Upload an image first, it will appear here.</p>
                <button type="button" onClick={() => setTab('upload')} className="mt-4 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 transition">Upload Image</button>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                {recentUrls.map(imgUrl => (
                  <div key={imgUrl} onClick={() => selectFromGallery(imgUrl)}
                    className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition hover:border-primary/60 ${url===imgUrl ? 'border-primary ring-2 ring-primary/30' : 'border-gray-100'}`}>
                    <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                    {url===imgUrl && <div className="absolute inset-0 bg-primary/10 flex items-center justify-center"><div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-white text-xs">✓</div></div>}
                  </div>
                ))}
              </div>
            )
          )}

          {/* Upload tab */}
          {tab === 'upload' && (
            <div className="space-y-4">
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
              <div onClick={() => !uploading && fileRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition">
                {uploading ? (
                  <><div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-sm text-primary font-medium">Uploading to Cloudinary…</p></>
                ) : (
                  <><ImageIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="text-sm font-medium text-gray-500">Click to select image</p><p className="text-xs text-gray-300 mt-1">JPG, PNG, WebP, GIF · uploads to Cloudinary</p></>
                )}
              </div>
            </div>
          )}

          {/* URL tab */}
          {tab === 'url' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Image URL</label>
                <input placeholder="https://res.cloudinary.com/…" value={url} onChange={e => setUrl(e.target.value)} autoFocus
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              {url && (
                <div className="border border-gray-100 rounded-xl overflow-hidden bg-gray-50">
                  <div className="flex items-center justify-center p-4" style={{ minHeight: 180 }}>
                    <img src={url} alt="" style={{ maxHeight: 200, maxWidth: '100%', transform: `scale(${zoom/100})`, transformOrigin: 'center', transition: 'transform 0.2s', borderRadius: 8 }}
                      onError={e => { (e.currentTarget as HTMLImageElement).style.opacity='0.3' }} />
                  </div>
                  {/* Dimension info */}
                  {dims && (
                    <div className="flex items-center justify-center gap-4 px-4 py-2 border-t border-gray-100 bg-white text-xs text-gray-400">
                      <span>📐 {dims.w} × {dims.h}px</span>
                      <span>·</span>
                      <span>Display: {Math.round(dims.w * zoom / 100)} × {Math.round(dims.h * zoom / 100)}px</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom controls — always visible */}
        {(tab === 'url' || url) && (
          <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-4 space-y-3">
            {/* Zoom + Size */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 flex-1">
                <ZoomOut className="w-4 h-4 text-gray-400 shrink-0" />
                <input type="range" min={10} max={100} step={5} value={zoom} onChange={e => { setZoom(+e.target.value); setWidth(e.target.value+'%') }}
                  className="flex-1 h-1.5 accent-primary" />
                <ZoomIn className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-xs font-mono text-gray-500 w-10 text-right">{zoom}%</span>
              </div>
              <select value={align} onChange={e => setAlign(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="center">Center</option>
                <option value="left">Float Left</option>
                <option value="right">Float Right</option>
                <option value="full">Full Width</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
              <button type="button" onClick={handleInsert} disabled={!url.trim()}
                className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-40">Insert Image</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Link dialog ──────────────────────────────────────────────────────────────
function LinkDialog({ current, onInsert, onClose }: { current: string; onInsert: (url: string, newTab: boolean) => void; onClose: () => void }) {
  const [url, setUrl] = useState(current); const [newTab, setNewTab] = useState(true)
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-96 max-w-[95vw] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2"><LinkIcon className="w-4 h-4 text-primary" /> Insert / Edit Link</h3>
          <button type="button" onClick={onClose}><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <input placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} autoFocus
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={newTab} onChange={e => setNewTab(e.target.checked)} className="rounded" /> Open in new tab
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
          <button type="button" onClick={() => url.trim() && onInsert(url.trim(), newTab)} disabled={!url.trim()}
            className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-40">Insert</button>
        </div>
      </div>
    </div>
  )
}

// ─── YouTube dialog ───────────────────────────────────────────────────────────
function YoutubeDialog({ onInsert, onClose }: { onInsert: (url: string, w: number, h: number) => void; onClose: () => void }) {
  const [url, setUrl] = useState(''); const [w, setW] = useState(700); const [h, setH] = useState(394)
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-[440px] max-w-[95vw] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2"><YoutubeIcon className="w-4 h-4 text-red-500" /> Embed YouTube Video</h3>
          <button type="button" onClick={onClose}><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <input placeholder="https://www.youtube.com/watch?v=…" value={url} onChange={e => setUrl(e.target.value)} autoFocus
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-gray-500 mb-1.5">Width (px)</label>
            <input type="number" value={w} onChange={e => setW(+e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1.5">Height (px)</label>
            <input type="number" value={h} onChange={e => setH(+e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" /></div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
          <button type="button" onClick={() => url.trim() && onInsert(url.trim(), w, h)} disabled={!url.trim()}
            className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 transition disabled:opacity-40">Embed</button>
        </div>
      </div>
    </div>
  )
}

// ─── Section inserters ────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function insertSection(editor: any, type: string) {
  const map: Record<string, string> = {
    info:    '<div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:16px 20px;border-radius:8px;margin:16px 0;"><p><strong>💡 Did You Know</strong></p><p>Write your informational message here…</p></div><p></p>',
    warning: '<div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:16px 20px;border-radius:8px;margin:16px 0;"><p><strong>⚠️ Warning</strong></p><p>Write your warning message here…</p></div><p></p>',
    tip:     '<div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px 20px;border-radius:8px;margin:16px 0;"><p><strong>✅ Doctor\'s Tip</strong></p><p>Write your medical tip here…</p></div><p></p>',
    danger:  '<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px 20px;border-radius:8px;margin:16px 0;"><p><strong>🚨 Important</strong></p><p>Write your important alert here…</p></div><p></p>',
    stats:   '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:16px 0;text-align:center;"><div style="background:#eff6ff;padding:20px;border-radius:12px;"><p style="font-size:2em;font-weight:700;color:#1d4ed8;margin:0;">98%</p><p style="color:#6b7280;margin:4px 0 0;">Success Rate</p></div><div style="background:#f0fdf4;padding:20px;border-radius:12px;"><p style="font-size:2em;font-weight:700;color:#15803d;margin:0;">10K+</p><p style="color:#6b7280;margin:4px 0 0;">Patients Treated</p></div><div style="background:#fdf4ff;padding:20px;border-radius:12px;"><p style="font-size:2em;font-weight:700;color:#7e22ce;margin:0;">20+</p><p style="color:#6b7280;margin:4px 0 0;">Years Experience</p></div></div><p></p>',
    twocol:  '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:16px 0;"><div style="background:#f9fafb;padding:16px;border-radius:8px;"><p><strong>Left Column</strong></p><p>Write left column content here…</p></div><div style="background:#f9fafb;padding:16px;border-radius:8px;"><p><strong>Right Column</strong></p><p>Write right column content here…</p></div></div><p></p>',
    quote:   '<blockquote style="border-left:4px solid #3b82f6;padding:16px 24px;background:#f8fafc;border-radius:0 8px 8px 0;margin:16px 0;font-style:italic;color:#374151;"><p>"Your quote or patient testimonial here — impactful and concise."</p><p style="font-size:0.85em;color:#6b7280;margin-top:8px;font-style:normal;">— Dr. Name / Patient Name</p></blockquote><p></p>',
    faq:     '<div style="margin:16px 0;"><h3>Frequently Asked Questions</h3><div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-top:12px;"><div style="padding:16px;border-bottom:1px solid #e5e7eb;background:#f9fafb;"><p><strong>Question 1: Write your question here?</strong></p><p style="color:#4b5563;margin-top:8px;">Answer: Write a clear, concise answer that helps the patient understand.</p></div><div style="padding:16px;background:#ffffff;"><p><strong>Question 2: Another common question?</strong></p><p style="color:#4b5563;margin-top:8px;">Answer: Your answer here.</p></div></div></div><p></p>',
    slider:  '<div class="blog-slider" style="position:relative;overflow:hidden;border-radius:12px;margin:16px 0;background:#000;"><div class="blog-slider-track" style="display:flex;transition:transform 0.4s ease;"><img src="https://placehold.co/800x420?text=Slide+1" style="min-width:100%;object-fit:cover;max-height:420px;border-radius:0;margin:0;" /><img src="https://placehold.co/800x420?text=Slide+2" style="min-width:100%;object-fit:cover;max-height:420px;border-radius:0;margin:0;" /></div><button class="blog-slider-btn prev" style="position:absolute;top:50%;left:10px;transform:translateY(-50%);background:rgba(0,0,0,0.5);color:white;border:none;padding:10px 14px;cursor:pointer;border-radius:6px;font-size:1.2em;z-index:10;" onclick="(function(b){var t=b.closest(\'.blog-slider\').querySelector(\'.blog-slider-track\');var imgs=t.querySelectorAll(\'img\');var cur=Math.round(-parseFloat(t.style.transform.replace(\'translateX(\',\'\').replace(\'%)\',\'\'))/(100));cur=Math.max(0,cur-1);t.style.transform=\'translateX(-\'+cur*100+\'%)\';})(this)">&#8592;</button><button class="blog-slider-btn next" style="position:absolute;top:50%;right:10px;transform:translateY(-50%);background:rgba(0,0,0,0.5);color:white;border:none;padding:10px 14px;cursor:pointer;border-radius:6px;font-size:1.2em;z-index:10;" onclick="(function(b){var t=b.closest(\'.blog-slider\').querySelector(\'.blog-slider-track\');var imgs=t.querySelectorAll(\'img\');var total=imgs.length;var cur=Math.round(-parseFloat(t.style.transform.replace(\'translateX(\',\'\').replace(\'%)\',\'\'))/(100));cur=Math.min(total-1,cur+1);t.style.transform=\'translateX(-\'+cur*100+\'%)\';})(this)">&#8594;</button></div><p><em>Replace placeholder images: click each slide image and use the image toolbar to set Cloudinary URLs. Add more images inside the slider track div.</em></p><p></p>',
    divider: '<hr/><p></p>',
    cta:     '<div style="background:linear-gradient(135deg,#1d4ed8,#0e7490);padding:32px;border-radius:16px;text-align:center;margin:24px 0;"><p style="color:white;font-size:1.4em;font-weight:700;margin:0 0 8px;">Ready to Consult Dr. [Name]?</p><p style="color:#bfdbfe;margin:0 0 20px;">Get expert cardiac care today. Book your appointment online.</p><p><a href="/appointment" style="background:white;color:#1d4ed8;padding:12px 28px;border-radius:50px;font-weight:600;text-decoration:none;display:inline-block;">Book Appointment →</a></p></div><p></p>',
  }
  if (map[type]) editor.chain().focus().insertContent(map[type]).run()
}

// ─── Section panel ────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SectionPanel({ editor, onClose }: { editor: any; onClose: () => void }) {
  const sections = [
    { label: '💡 Info Box',           key: 'info' },
    { label: '⚠️ Warning Box',        key: 'warning' },
    { label: '✅ Doctor\'s Tip',      key: 'tip' },
    { label: '🚨 Important Alert',    key: 'danger' },
    { label: '📊 Stat Cards (3-col)', key: 'stats' },
    { label: '🔲 Two Columns',        key: 'twocol' },
    { label: '💬 Quote / Testimonial',key: 'quote' },
    { label: '❓ FAQ Section',        key: 'faq' },
    { label: '📣 CTA Button Block',   key: 'cta' },
    { label: '🖼 Image Slider',          key: 'slider' },
    { label: '─ Horizontal Divider',  key: 'divider' },
  ]
  return (
    <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 p-2 w-56">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-2 py-1.5">Insert Section</p>
      {sections.map(s => (
        <button key={s.key} type="button" onClick={() => { insertSection(editor, s.key); onClose() }}
          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-primary/5 hover:text-primary rounded-xl transition">
          {s.label}
        </button>
      ))}
    </div>
  )
}

// ─── Table toolbar ─────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TableToolbar({ editor }: { editor: any }) {
  if (!editor || !editor.isActive('table')) return null
  return (
    <div className="flex items-center gap-1 flex-wrap px-3 py-2 bg-blue-50 border-b border-blue-100 text-xs">
      <span className="text-blue-600 font-semibold mr-1">Table:</span>
      {[
        { label: '+ Col Before', icon: <Columns className="w-3 h-3" />, fn: () => editor.chain().focus().addColumnBefore().run() },
        { label: '+ Col After',  icon: <Columns className="w-3 h-3" />, fn: () => editor.chain().focus().addColumnAfter().run() },
        { label: '+ Row Before', icon: <Rows    className="w-3 h-3" />, fn: () => editor.chain().focus().addRowBefore().run() },
        { label: '+ Row After',  icon: <Rows    className="w-3 h-3" />, fn: () => editor.chain().focus().addRowAfter().run() },
        { label: 'Merge',        icon: <SplitSquareHorizontal className="w-3 h-3" />, fn: () => editor.chain().focus().mergeCells().run() },
        { label: 'Split',        icon: <SplitSquareHorizontal className="w-3 h-3" />, fn: () => editor.chain().focus().splitCell().run() },
      ].map(b => (
        <button key={b.label} type="button" onClick={b.fn}
          className="flex items-center gap-0.5 px-2 py-1 bg-white border border-blue-200 rounded-md hover:bg-blue-50 text-blue-700">
          {b.icon}{b.label}
        </button>
      ))}
      {[
        { label: 'Del Col',   fn: () => editor.chain().focus().deleteColumn().run() },
        { label: 'Del Row',   fn: () => editor.chain().focus().deleteRow().run() },
        { label: 'Del Table', fn: () => editor.chain().focus().deleteTable().run(), red: true },
      ].map(b => (
        <button key={b.label} type="button" onClick={b.fn}
          className={clsx('flex items-center gap-0.5 px-2 py-1 border rounded-md transition',
            b.red ? 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100 font-medium' : 'bg-white border-red-200 text-red-600 hover:bg-red-50')}>
          <Trash2 className="w-3 h-3" />{b.label}
        </button>
      ))}
    </div>
  )
}

// ─── Inline image toolbar (shown in toolbar row when image is active) ──────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ImageToolbar({ editor }: { editor: any }) {
  if (!editor || !editor.isActive('image')) return null
  const setStyle = (style: string, align: string) => {
    editor.chain().focus().updateAttributes('image', { style, 'data-align': align }).run()
  }
  return (
    <div className="flex items-center gap-1 flex-wrap px-3 py-2 bg-indigo-50 border-b border-indigo-100 text-xs">
      <span className="text-indigo-600 font-semibold mr-1">🖼 Image:</span>
      <span className="text-indigo-400">Size:</span>
      <button type="button" onClick={() => editor.chain().focus().updateAttributes('image', { style: 'width:25%;max-width:100%;height:auto;' }).run()} className="px-2 py-1 bg-white border border-indigo-200 rounded-md hover:bg-indigo-50 text-indigo-700 flex items-center gap-0.5"><ZoomOut className="w-3 h-3"/>25%</button>
      <button type="button" onClick={() => editor.chain().focus().updateAttributes('image', { style: 'width:50%;max-width:100%;height:auto;' }).run()} className="px-2 py-1 bg-white border border-indigo-200 rounded-md hover:bg-indigo-50 text-indigo-700">50%</button>
      <button type="button" onClick={() => editor.chain().focus().updateAttributes('image', { style: 'width:75%;max-width:100%;height:auto;' }).run()} className="px-2 py-1 bg-white border border-indigo-200 rounded-md hover:bg-indigo-50 text-indigo-700">75%</button>
      <button type="button" onClick={() => editor.chain().focus().updateAttributes('image', { style: 'width:100%;max-width:100%;height:auto;' }).run()} className="px-2 py-1 bg-white border border-indigo-200 rounded-md hover:bg-indigo-50 text-indigo-700 flex items-center gap-0.5"><ZoomIn className="w-3 h-3"/>100%</button>
      <div className="w-px h-4 bg-indigo-200 mx-1" />
      <span className="text-indigo-400">Align:</span>
      <button type="button" onClick={() => setStyle('float:left;margin:0 16px 8px 0;width:40%;max-width:100%;height:auto;','left')}    title="Float Left"  className="px-2 py-1 bg-white border border-indigo-200 rounded-md hover:bg-indigo-50 text-indigo-700 flex items-center gap-0.5"><AlignLeft   className="w-3 h-3"/>Left</button>
      <button type="button" onClick={() => setStyle('display:block;margin:0 auto;max-width:100%;height:auto;','center')}               title="Center"      className="px-2 py-1 bg-white border border-indigo-200 rounded-md hover:bg-indigo-50 text-indigo-700 flex items-center gap-0.5"><AlignCenter className="w-3 h-3"/>Center</button>
      <button type="button" onClick={() => setStyle('float:right;margin:0 0 8px 16px;width:40%;max-width:100%;height:auto;','right')}  title="Float Right" className="px-2 py-1 bg-white border border-indigo-200 rounded-md hover:bg-indigo-50 text-indigo-700 flex items-center gap-0.5"><AlignRight  className="w-3 h-3"/>Right</button>
      <button type="button" onClick={() => setStyle('width:100%;max-width:100%;height:auto;','full')}                                  title="Full Width"  className="px-2 py-1 bg-white border border-indigo-200 rounded-md hover:bg-indigo-50 text-indigo-700 flex items-center gap-0.5"><Move        className="w-3 h-3"/>Full</button>
      <div className="w-px h-4 bg-indigo-200 mx-1" />
      <button type="button" onClick={() => setStyle('max-width:100%;height:auto;','none')} title="Reset" className="px-2 py-1 bg-white border border-red-200 rounded-md hover:bg-red-50 text-red-600 flex items-center gap-0.5"><RotateCcw className="w-3 h-3"/>Reset</button>
    </div>
  )
}

// ─── Video dialog (own Cloudinary video) ─────────────────────────────────────
function VideoDialog({ onInsert, onClose }: { onInsert: (url: string, caption: string) => void; onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('video/')) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('upload_preset', 'upbeat_public')
      fd.append('folder', 'blogs/videos')
      const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'boc8bvoc'
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, { method: 'POST', body: fd })
      const data = await res.json()
      if (data.secure_url) setUrl(data.secure_url)
      else alert('Upload failed: ' + (data.error?.message || 'Unknown error'))
    } catch {
      alert('Upload failed. Check your internet or Cloudinary config.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-[500px] max-w-[95vw] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Film className="w-4 h-4 text-purple-500" /> Insert Own Video
          </h3>
          <button type="button" onClick={onClose}><X className="w-4 h-4 text-gray-400" /></button>
        </div>

        {/* Upload zone */}
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-purple-300 hover:bg-purple-50/30 transition"
        >
          {uploading ? (
            <p className="text-sm text-purple-600 font-medium">⏳ Uploading to Cloudinary…</p>
          ) : url ? (
            <video src={url} controls className="max-h-32 mx-auto rounded-lg mb-2" />
          ) : (
            <>
              <Film className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Click to upload video file</p>
              <p className="text-xs text-gray-400 mt-1">MP4, WebM, MOV · Max 100MB · Uploads to Cloudinary</p>
            </>
          )}
          <input ref={fileRef} type="file" accept="video/*" className="hidden"
            onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])} />
        </div>

        {/* Or paste URL */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Or paste Cloudinary video URL</label>
          <input placeholder="https://res.cloudinary.com/upbeatheart/video/upload/…" value={url}
            onChange={e => setUrl(e.target.value)} autoFocus={!url}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" />
        </div>

        {/* Caption */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Caption (optional)</label>
          <input placeholder="e.g. Dr. explaining angioplasty procedure" value={caption}
            onChange={e => setCaption(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" />
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
          <button type="button" onClick={() => url.trim() && onInsert(url.trim(), caption.trim())}
            disabled={!url.trim() || uploading}
            className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 transition disabled:opacity-40">
            {uploading ? 'Uploading…' : 'Insert Video'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Color picker ─────────────────────────────────────────────────────────────
const COLORS = ['#000000','#374151','#6b7280','#1d4ed8','#15803d','#b45309','#be123c','#7e22ce','#0e7490','#f97316','#ef4444','#ffffff']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ColorPicker({ editor }: { editor: any }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div className="relative" ref={ref}>
      <button type="button" title="Text color" onClick={() => setOpen(p => !p)} className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 transition">
        <Palette className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-3 w-40">
          <div className="grid grid-cols-6 gap-1.5 mb-2">
            {COLORS.map(c => (
              <button key={c} type="button" title={c}
                onClick={() => { editor.chain().focus().setColor(c).run(); setOpen(false) }}
                style={{ background: c }}
                className="w-5 h-5 rounded border border-gray-300 hover:scale-110 transition shadow-sm" />
            ))}
          </div>
          <button type="button" onClick={() => { editor.chain().focus().unsetColor().run(); setOpen(false) }}
            className="w-full text-xs text-gray-500 hover:text-gray-700 py-1 hover:bg-gray-50 rounded text-center">
            Reset color
          </button>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════
interface RichEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
}

export default function RichEditor({ value, onChange, placeholder = 'Start writing your article…', minHeight = 480 }: RichEditorProps) {
  const [imgDialog, setImgDialog]     = useState(false)  // gallery for content images
  const [linkDialog, setLinkDialog]   = useState(false)
  const [ytDialog, setYtDialog]       = useState(false)
  const [vidDialog, setVidDialog]     = useState(false)
  const [sectionOpen, setSectionOpen] = useState(false)
  const sectionRef = useRef<HTMLDivElement>(null)
  const toolbarRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (sectionRef.current && !sectionRef.current.contains(e.target as Node)) setSectionOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      ResizableImage.configure({ inline: false, allowBase64: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer' } }),
      Placeholder.configure({ placeholder }),
      Color,
      TextStyle,
      Highlight.configure({ multicolor: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Youtube.configure({ controls: true, nocookie: true }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'focus:outline-none',
        style: `min-height:${minHeight}px;padding:20px;`,
      },
    },
  })

  // Sync from outside (EditPage loads existing content)
  const prevValue = useRef(value)
  useEffect(() => {
    if (editor && value !== prevValue.current && value !== editor.getHTML()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(editor as any).commands.setContent(value || '')
      prevValue.current = value
    }
  }, [value, editor])

  if (!editor) return (
    <div className="border border-gray-200 rounded-2xl h-64 flex items-center justify-center text-gray-300 bg-gray-50 text-sm">
      Loading editor…
    </div>
  )

  const handleInsertImage = (url: string, align: string, width: string) => {
    const styleMap: Record<string, string> = {
      left:   `float:left;margin:0 16px 8px 0;width:${width};max-width:100%;height:auto;`,
      right:  `float:right;margin:0 0 8px 16px;width:${width};max-width:100%;height:auto;`,
      center: `display:block;margin:0 auto;width:${width};max-width:100%;height:auto;`,
      full:   `width:100%;max-width:100%;height:auto;`,
      none:   `width:${width};max-width:100%;height:auto;`,
    }
    editor.chain().focus()
      .setImage({ src: url } as Parameters<ReturnType<typeof editor.chain>['setImage']>[0])
      .run()
    // Update attributes after insertion
    editor.chain().focus().updateAttributes('image', {
      style: styleMap[align] || styleMap.none,
      'data-align': align,
    }).run()
    editor.chain().focus().insertContent('<p></p>').run()
    setImgDialog(false)
  }

  const handleInsertLink = (url: string, newTab: boolean) => {
    editor.chain().focus().setLink({ href: url, target: newTab ? '_blank' : '_self' }).run()
    setLinkDialog(false)
  }

  const handleInsertYoutube = (url: string, w: number, h: number) => {
    editor.chain().focus().setYoutubeVideo({ src: url, width: w, height: h }).run()
    setYtDialog(false)
  }

  const handleInsertVideo = (url: string, caption: string) => {
    const html = `<figure style="margin:16px 0;text-align:center;">
  <video controls style="max-width:100%;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.12);" src="${url}">
    Your browser does not support the video tag.
  </video>${caption ? `
  <figcaption style="font-size:0.85em;color:#6b7280;margin-top:8px;">${caption}</figcaption>` : ''}
</figure><p></p>`
    editor.chain().focus().insertContent(html).run()
    setVidDialog(false)
  }

  const wordCount = editor.getText().split(/\s+/).filter(Boolean).length
  const charCount = editor.getText().length

  return (
    <div className="rounded-2xl relative">

      {/* ── Toolbar — sticks to <main> scroll viewport ── */}
      <div ref={toolbarRef} className="sticky top-0 z-30 bg-white border border-gray-200 rounded-t-2xl shadow-sm border-b-0">

        {/* Row 1 */}
        <div className="flex items-center gap-0.5 flex-wrap px-3 py-2">
          <HeadingDropdown editor={editor} />
          <Divider />
          <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()}          active={editor.isActive('bold')}          title="Bold (Ctrl+B)"><Bold          className="w-4 h-4" /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()}        active={editor.isActive('italic')}        title="Italic (Ctrl+I)"><Italic        className="w-4 h-4" /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()}     active={editor.isActive('underline')}     title="Underline"><UnderlineIcon className="w-4 h-4" /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()}        active={editor.isActive('strike')}        title="Strikethrough"><Strikethrough  className="w-4 h-4" /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHighlight().run()}     active={editor.isActive('highlight')}     title="Highlight"><Highlighter     className="w-4 h-4" /></ToolBtn>
          <ColorPicker editor={editor} />
          <Divider />
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign('left').run()}    active={editor.isActive({ textAlign: 'left' })}    title="Align left"><AlignLeft    className="w-4 h-4" /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign('center').run()}  active={editor.isActive({ textAlign: 'center' })}  title="Align center"><AlignCenter  className="w-4 h-4" /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign('right').run()}   active={editor.isActive({ textAlign: 'right' })}   title="Align right"><AlignRight   className="w-4 h-4" /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })} title="Justify"><AlignJustify className="w-4 h-4" /></ToolBtn>
          <Divider />
          <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()}  active={editor.isActive('bulletList')}  title="Bullet list"><List        className="w-4 h-4" /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Ordered list"><ListOrdered  className="w-4 h-4" /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleBlockquote().run()}  active={editor.isActive('blockquote')}  title="Blockquote"><Quote        className="w-4 h-4" /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleCode().run()}        active={editor.isActive('code')}        title="Inline code"><Code         className="w-4 h-4" /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal rule"><Minus className="w-4 h-4" /></ToolBtn>
          <Divider />
          <ToolBtn onClick={() => setLinkDialog(true)} active={editor.isActive('link')} title="Insert link"><LinkIcon    className="w-4 h-4" /></ToolBtn>
          <ToolBtn onClick={() => setImgDialog(true)}  title="Insert image (Cloudinary)"><ImageIcon   className="w-4 h-4" /></ToolBtn>
          <ToolBtn onClick={() => setYtDialog(true)}   title="Embed YouTube video"><YoutubeIcon className="w-4 h-4" /></ToolBtn>
          <ToolBtn onClick={() => setVidDialog(true)}   title="Upload own video (Cloudinary)"><Film className="w-4 h-4" /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} active={editor.isActive('table')} title="Insert table"><TableIcon   className="w-4 h-4" /></ToolBtn>
          <Divider />
          {/* Section inserter */}
          <div className="relative" ref={sectionRef}>
            <button type="button" onClick={() => setSectionOpen(p => !p)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition whitespace-nowrap">
              <Plus className="w-3.5 h-3.5" /> Section <ChevronDown className="w-3 h-3" />
            </button>
            {sectionOpen && <SectionPanel editor={editor} onClose={() => setSectionOpen(false)} />}
          </div>
          <Divider />
          <ToolBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo (Ctrl+Z)"><Undo className="w-4 h-4" /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo (Ctrl+Y)"><Redo className="w-4 h-4" /></ToolBtn>
        </div>

        {/* Row 2 — table & image controls */}
        <TableToolbar editor={editor} />
        <ImageToolbar editor={editor} />
      </div>





      {/* ── Editor canvas ── */}
      <div className="rich-editor-canvas border border-gray-200 border-t-0 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/40 transition-all">
        <EditorContent editor={editor} />
      </div>

      {/* ── Footer stats ── */}
      <div className="flex items-center justify-between px-4 py-2 border border-gray-200 border-t-0 rounded-b-2xl bg-gray-50/50 text-xs text-gray-400">
        <span>{charCount.toLocaleString()} characters · {wordCount.toLocaleString()} words {wordCount >= 800 ? '✅' : `(need ${800 - wordCount} more for SEO)`}</span>
        <span className="text-gray-300">Rich Editor · HTML output</span>
      </div>

      {/* ── Modals ── */}
      {imgDialog  && <ImageDialog   onInsert={handleInsertImage}  onClose={() => setImgDialog(false)} />}
      {linkDialog && <LinkDialog    current={editor.getAttributes('link').href || ''} onInsert={handleInsertLink} onClose={() => setLinkDialog(false)} />}
      {ytDialog   && <YoutubeDialog onInsert={handleInsertYoutube} onClose={() => setYtDialog(false)} />}
      {vidDialog  && <VideoDialog   onInsert={handleInsertVideo}   onClose={() => setVidDialog(false)} />}
    </div>
  )
}
