import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import type { Blog, ContentStatus } from '@/types'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Save, Send, Eye, X,
  BookOpen, Tag, FileText, Search, Globe, Info, Loader2,
} from 'lucide-react'
import clsx from 'clsx'
import RichEditor from '@/components/editor/RichEditor'
import CoverImageModal from '@/components/ui/CoverImageModal'
import ImageCropUpload from '@/components/upload/ImageCropUpload'

const CATEGORIES = [
  'Heart Disease', 'Hypertension', 'Diabetes',
  'Lifestyle', 'Exercise', 'Nutrition', 'Recovery', 'Prevention', 'Other',
]

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

type Tab = 'content' | 'seo' | 'preview'

// ── BlogContentPreview: renders HTML with .blog-content styles + slider JS ──
function BlogContentPreview({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const sliders = ref.current.querySelectorAll<HTMLElement>('.blog-slider')
    sliders.forEach(slider => {
      const track = slider.querySelector<HTMLElement>('.blog-slider-track')
      if (!track) return
      const imgs = track.querySelectorAll('img')
      let cur = 0
      let dots: HTMLSpanElement[] = []
      const goTo = (n: number) => {
        cur = Math.max(0, Math.min(imgs.length - 1, n))
        track.style.transform = `translateX(-${cur * 100}%)`
        dots.forEach((d, i) => d.classList.toggle('active', i === cur))
      }
      const dotsWrap = document.createElement('div')
      dotsWrap.className = 'blog-slider-dots'
      imgs.forEach((_, i) => {
        const d = document.createElement('span')
        if (i === 0) d.className = 'active'
        d.onclick = () => goTo(i)
        dotsWrap.appendChild(d)
        dots.push(d)
      })
      slider.appendChild(dotsWrap)
      const prev = slider.querySelector<HTMLButtonElement>('.prev')
      const next = slider.querySelector<HTMLButtonElement>('.next')
      if (prev) { prev.onclick = null; prev.addEventListener('click', () => goTo(cur - 1)) }
      if (next) { next.onclick = null; next.addEventListener('click', () => goTo(cur + 1)) }
    })
  }, [html])
  return <div ref={ref} className="blog-content" dangerouslySetInnerHTML={{ __html: html }} />
}

export default function BlogEditPage() {
  const { id }       = useParams<{ id: string }>()
  const { user }     = useAuth()
  const navigate     = useNavigate()

  const [tab, setTab]           = useState<Tab>('content')
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [, setCoverPreview]     = useState('')
  const [showCoverModal, setShowCoverModal] = useState(false)
  const [originalStatus, setOriginalStatus] = useState<ContentStatus>('draft')

  const [form, setForm] = useState({
    title: '',
    slug: '',
    category: '',
    tags: [] as string[],
    tagInput: '',
    excerpt: '',
    content: '',
    coverImage: '',
    seoTitle: '',
    seoDesc: '',
    canonical: '',
    status: 'draft' as ContentStatus,
  })

  // Load existing blog
  useEffect(() => {
    if (!id) return
    async function load() {
      const snap = await getDoc(doc(db, 'blogs', id!))
      if (!snap.exists()) {
        toast.error('Blog not found')
        navigate('/blogs')
        return
      }
      const data = snap.data() as Omit<Blog, 'id'>
      setForm({
        title:      data.title       ?? '',
        slug:       data.slug        ?? '',
        category:   data.category    ?? '',
        tags:       data.tags        ?? [],
        tagInput:   '',
        excerpt:    data.excerpt     ?? '',
        content:    data.content     ?? '',
        coverImage: data.coverImage  ?? '',
        seoTitle:   data.seo?.metaTitle       ?? '',
        seoDesc:    data.seo?.metaDescription ?? '',
        canonical:  data.seo?.canonical       ?? '',
        status:     data.status      ?? 'draft',
      })
      setCoverPreview(data.coverImage ?? '')
      setOriginalStatus(data.status ?? 'draft')
      setLoading(false)
    }
    load()
  }, [id, navigate])

  const set = (key: keyof typeof form, val: unknown) =>
    setForm(p => ({ ...p, [key]: val }))

  const handleTitleChange = (v: string) => {
    set('title', v)
    if (!form.slug || form.slug === slugify(form.title)) {
      set('slug', slugify(v))
    }
    if (!form.seoTitle) set('seoTitle', v)
  }

  const handleExcerptChange = (v: string) => {
    set('excerpt', v)
    if (!form.seoDesc) set('seoDesc', v.slice(0, 160))
  }

  const addTag = () => {
    const t = form.tagInput.trim()
    if (t && !form.tags.includes(t)) set('tags', [...form.tags, t])
    set('tagInput', '')
  }

  const removeTag = (t: string) => set('tags', form.tags.filter(x => x !== t))

  const handleCoverUrl = (url: string) => {
    set('coverImage', url)
    setCoverPreview(url)
  }



  const handleSave = async (status: ContentStatus) => {
    if (!form.title.trim())   return toast.error('Title is required')
    if (!form.content.trim()) return toast.error('Content is required')
    if (!id) return
    setSaving(true)
    try {
      const updates: Record<string, unknown> = {
        title:      form.title.trim(),
        slug:       form.slug || slugify(form.title),
        content:    form.content.trim(),
        excerpt:    form.excerpt.trim(),
        coverImage: form.coverImage.trim(),
        category:   form.category,
        tags:       form.tags,
        status,
        seo: {
          metaTitle:       form.seoTitle || form.title,
          metaDescription: form.seoDesc  || form.excerpt.slice(0, 160),
          canonical:       form.canonical,
        },
        updatedAt: serverTimestamp(),
      }
      // Track who approved/published
      if (status === 'published' && originalStatus !== 'published') {
        updates.approvedBy  = user?.uid ?? ''
        updates.publishedAt = serverTimestamp()
      }
      await updateDoc(doc(db, 'blogs', id), updates)
      toast.success(
        status === 'draft'            ? 'Saved as draft!' :
        status === 'pending_approval' ? 'Sent for doctor approval!' :
        status === 'published'        ? 'Blog published!' :
                                        'Blog updated!'
      )
      navigate('/blogs')
    } catch (e) {
      toast.error('Failed to save. Try again.')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const seoTitleLen = form.seoTitle.length
  const seoDescLen  = form.seoDesc.length

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading blog…
      </div>
    )
  }

  const isPublished = originalStatus === 'published'

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/blogs" className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" /> Edit Blog Post
            </h1>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
              <span className={clsx(
                'inline-block w-2 h-2 rounded-full',
                originalStatus === 'published'        ? 'bg-green-400' :
                originalStatus === 'pending_approval' ? 'bg-yellow-400' :
                originalStatus === 'archived'         ? 'bg-red-400' : 'bg-gray-300'
              )} />
              Currently: <strong className="text-gray-600">{originalStatus.replace('_', ' ')}</strong>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSave('draft')}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> Save Draft
          </button>
          {!isPublished && (
            <button
              onClick={() => handleSave('pending_approval')}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 border border-amber-200 bg-amber-50 rounded-xl text-sm font-medium text-amber-700 hover:bg-amber-100 transition disabled:opacity-50"
            >
              <Send className="w-4 h-4" /> Send for Approval
            </button>
          )}
          {isPublished && (
            <button
              onClick={() => handleSave('published')}
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition shadow-md shadow-green-200 disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Update Published'}
            </button>
          )}
          {!isPublished && (
            <button
              onClick={() => handleSave('published')}
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition shadow-md shadow-primary/20 disabled:opacity-50"
            >
              <Eye className="w-4 h-4" /> {saving ? 'Saving…' : 'Publish Now'}
            </button>
          )}
        </div>
      </div>

      {/* Published warning */}
      {isPublished && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
          <p className="text-sm text-green-700">
            This blog is <strong>live on the website</strong>. Changes saved here will be reflected immediately. Changes to status require doctor re-approval.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {(['content', 'seo', 'preview'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition',
              tab === t ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {t === 'content' && <FileText className="w-3.5 h-3.5 inline mr-1.5" />}
            {t === 'seo'     && <Search   className="w-3.5 h-3.5 inline mr-1.5" />}
            {t === 'preview' && <Eye      className="w-3.5 h-3.5 inline mr-1.5" />}
            {t}
          </button>
        ))}
      </div>

      {/* CONTENT TAB */}
      {tab === 'content' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Main content */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Article Content</h2>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Title *</label>
                <input
                  placeholder="e.g. How to Prevent a Second Heart Attack"
                  value={form.title}
                  onChange={e => handleTitleChange(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">URL Slug</label>
                <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-primary/30">
                  <span className="px-3 py-2.5 bg-gray-50 text-gray-400 text-sm border-r border-gray-200">/blogs/</span>
                  <input
                    value={form.slug}
                    onChange={e => set('slug', slugify(e.target.value))}
                    className="flex-1 px-3 py-2.5 text-sm font-mono focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Excerpt / Summary</label>
                <textarea
                  placeholder="A brief 1–2 sentence summary shown in blog cards and Google search results."
                  value={form.excerpt}
                  onChange={e => handleExcerptChange(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-3">Full Content *</label>
                <RichEditor
                  value={form.content}
                  onChange={val => set('content', val)}
                  placeholder="Write your article here. Use the toolbar to format headings, add images, insert callout boxes, tables, YouTube videos and more…"
                  minHeight={520}
                />
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">

            {/* Status control */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
              <h2 className="font-semibold text-gray-800 text-sm">Status</h2>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value as ContentStatus)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="draft">Draft</option>
                <option value="pending_approval">Pending Approval</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
              <p className="text-xs text-gray-400">Changing status here and saving will update it immediately.</p>
            </div>

            {/* Cover Image */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
              <ImageCropUpload
                preset="upbeat_public"
                label="Cover Image"
                hint="Appears as card thumbnail on the blog list and full-width hero on the article page"
                targetW={1200}
                targetH={630}
                aspectLabel="16:9"
                websiteUsage="Blog card (h-44 object-cover) · Article page hero (full-width)"
                value={form.coverImage || ''}
                onChange={url => { set('coverImage', url); setCoverPreview(url) }}
                onRemove={() => { set('coverImage', ''); setCoverPreview('') }}
              />
            </div>

            {/* Category */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
              <h2 className="font-semibold text-gray-800 text-sm">Category</h2>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(c => (
                  <button
                    key={c}
                    onClick={() => set('category', form.category === c ? '' : c)}
                    className={clsx(
                      'px-3 py-1.5 rounded-full text-xs font-medium border transition',
                      form.category === c
                        ? 'bg-primary text-white border-primary'
                        : 'border-gray-200 text-gray-600 hover:border-primary/40'
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
              <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-gray-400" /> Tags
              </h2>
              <div className="flex gap-2">
                <input
                  placeholder="Add tag…"
                  value={form.tagInput}
                  onChange={e => set('tagInput', e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button onClick={addTag} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs hover:bg-gray-200">Add</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {form.tags.map(t => (
                  <span key={t} className="flex items-center gap-1 bg-blue-50 text-blue-600 border border-blue-100 rounded-full px-2.5 py-1 text-xs">
                    {t}
                    <button onClick={() => removeTag(t)} className="text-blue-400 hover:text-blue-600">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SEO TAB */}
      {tab === 'seo' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
              <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                <Search className="w-4 h-4 text-primary" /> SEO Settings
              </h2>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Meta Title
                  <span className={clsx('ml-2 font-normal', seoTitleLen > 60 ? 'text-red-400' : 'text-gray-400')}>
                    {seoTitleLen}/60 chars
                  </span>
                </label>
                <input
                  placeholder="SEO page title (50–60 characters ideal)"
                  value={form.seoTitle}
                  onChange={e => set('seoTitle', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Meta Description
                  <span className={clsx('ml-2 font-normal', seoDescLen > 160 ? 'text-red-400' : 'text-gray-400')}>
                    {seoDescLen}/160 chars
                  </span>
                </label>
                <textarea
                  placeholder="Describe this article for Google (120–160 characters)"
                  value={form.seoDesc}
                  onChange={e => set('seoDesc', e.target.value)}
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Canonical URL (optional)</label>
                <input
                  placeholder="https://upbeatheart.com/blogs/your-slug"
                  value={form.canonical}
                  onChange={e => set('canonical', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            {/* SEO checklist */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-3">
              <h2 className="font-semibold text-gray-800 text-sm">SEO Readiness</h2>
              {[
                { label: 'Title filled',          pass: !!form.title },
                { label: 'Slug set',              pass: !!form.slug },
                { label: 'Excerpt written',       pass: !!form.excerpt },
                { label: 'Category chosen',       pass: !!form.category },
                { label: 'Cover image added',     pass: !!form.coverImage },
                { label: 'Meta title ≤ 60 chars', pass: seoTitleLen > 0 && seoTitleLen <= 60 },
                { label: 'Meta desc ≤ 160 chars', pass: seoDescLen > 0 && seoDescLen <= 160 },
                { label: 'Tags added',            pass: form.tags.length > 0 },
                { label: 'Content ≥ 800 chars',   pass: form.content.length >= 800 },
              ].map(({ label, pass }) => (
                <div key={label} className="flex items-center gap-2.5">
                  <div className={clsx('w-4 h-4 rounded-full flex items-center justify-center text-white text-xs', pass ? 'bg-green-400' : 'bg-gray-200')}>
                    {pass ? '✓' : ''}
                  </div>
                  <span className={clsx('text-sm', pass ? 'text-gray-700' : 'text-gray-400')}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Google SERP Preview */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2 mb-4">
                <Globe className="w-4 h-4 text-green-500" /> Google Search Preview
              </h2>
              <div className="bg-gray-50 rounded-xl p-4 space-y-1">
                <p className="text-xs text-green-700 font-mono">
                  upbeatheart.com › blogs › {form.slug || 'your-slug'}
                </p>
                <p className="text-[#1a0dab] text-base font-medium leading-snug hover:underline cursor-pointer">
                  {form.seoTitle || form.title || 'Your Blog Title Here'}
                </p>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {form.seoDesc || form.excerpt || 'Meta description will appear here…'}
                </p>
              </div>
              <p className="text-xs text-gray-400 mt-3">Approximate preview — actual Google appearance may vary.</p>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
              <p className="text-sm font-semibold text-blue-800 mb-2">SEO Tips for Cardiology Blogs</p>
              <ul className="text-xs text-blue-700 space-y-1.5">
                <li>• Include the condition name in the title (e.g., "heart attack", "hypertension")</li>
                <li>• Use local keywords: "cardiologist in Bhubaneswar", "CARE Hospital"</li>
                <li>• Write at least 800 words for Google to rank medical content</li>
                <li>• Add FAQ section in content for featured snippets</li>
                <li>• Include doctor's name for authority signals</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Cover Image Modal */}
      {showCoverModal && (
        <CoverImageModal
          currentUrl={form.coverImage}
          onSelect={url => { handleCoverUrl(url); toast.success('Cover image selected!') }}
          onClose={() => setShowCoverModal(false)}
        />
      )}

      {/* PREVIEW TAB */}
      {tab === 'preview' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Eye className="w-4 h-4" /> Live Article Preview
            </div>
            <span className="text-xs text-gray-300">Rendered exactly as it will appear on the website</span>
          </div>
          <div className="max-w-2xl mx-auto px-8 py-10">
            {form.coverImage && (
              <img src={form.coverImage} alt="" className="w-full h-56 object-cover rounded-2xl mb-8" />
            )}
            {form.category && (
              <span className="inline-block text-xs font-bold text-primary uppercase tracking-widest mb-3 bg-primary/8 px-3 py-1 rounded-full">
                {form.category}
              </span>
            )}
            <h1 style={{ fontSize:'2rem', fontWeight:700, lineHeight:1.2, color:'#111827', margin:'0 0 12px' }}>
              {form.title || <span style={{ color:'#d1d5db' }}>Blog Title</span>}
            </h1>
            {form.excerpt && (
              <p style={{ fontSize:'1.1rem', color:'#6b7280', lineHeight:1.7, marginBottom:'20px' }}>{form.excerpt}</p>
            )}
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {form.tags.map(t => (
                  <span key={t} className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-medium">{t}</span>
                ))}
              </div>
            )}
            <hr style={{ border:'none', borderTop:'1px solid #f3f4f6', margin:'24px 0' }} />
            {form.content ? (
              <BlogContentPreview html={form.content} />
            ) : (
              <p style={{ color:'#d1d5db', fontStyle:'italic', textAlign:'center', padding:'40px 0' }}>
                Switch to the Content tab and write your article — it will appear here.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
