// ── pages/diseases/DiseaseEditorPage.tsx ─────────────────────────────────
// 5-tab disease article editor: Basic Info | Medical Content | Media | SEO | Approval
import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  doc, getDoc, addDoc, updateDoc, collection, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import {
  ArrowLeft, Save, Send, Info, FileText, Image, Search, CheckCircle,
  Plus, X, Loader2, Stethoscope, Globe, AlertCircle,
} from 'lucide-react'
import RichEditor from '@/components/editor/RichEditor'
import ImageCropUpload from '@/components/upload/ImageCropUpload'
import CloudinaryVideoUpload, { type VideoItem }  from '@/components/upload/CloudinaryVideoUpload'
import { type ImageValue } from '@/components/upload/CloudinaryImageUpload'
import MultiImageUpload, { type MultiImageItem }   from '@/components/upload/MultiImageUpload'
import InfographicUpload, { type InfographicItem } from '@/components/upload/InfographicUpload'
import DiseaseStatusBadge, { type DiseaseStatus }  from '@/components/diseases/DiseaseStatusBadge'
import SEOScoreChecker from '@/components/diseases/SEOScoreChecker'
import { slugify } from '@/lib/cloudinary'

// ── Constants ──────────────────────────────────────────────────────────────
const CLOUDINARY_PRESET_IMG   = import.meta.env.VITE_CLOUDINARY_PRESET_DISEASES  || 'upbeat_diseases'
const CLOUDINARY_PRESET_VID   = import.meta.env.VITE_CLOUDINARY_PRESET_VIDEOS    || 'upbeat_videos'
const CLOUDINARY_PRESET_INFOG = import.meta.env.VITE_CLOUDINARY_PRESET_INFOGRAPH || 'upbeat_infographic'

const CATEGORIES = [
  'Heart Conditions', 'Arrhythmia', 'Valvular Heart Disease',
  'Vascular Conditions', 'Congenital Heart Disease', 'Lifestyle & Prevention', 'Cardiac Investigations',
]

type TabId = 'basic' | 'content' | 'media' | 'seo' | 'approval'

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'basic',    label: 'Basic Info',       icon: Info },
  { id: 'content',  label: 'Medical Content',  icon: FileText },
  { id: 'media',    label: 'Media',            icon: Image },
  { id: 'seo',      label: 'SEO',              icon: Search },
  { id: 'approval', label: 'Approval',         icon: CheckCircle },
]

// ── Form state ─────────────────────────────────────────────────────────────
interface FAQ { q: string; a: string }
interface VideoEntry extends VideoItem { id: string }

interface FormState {
  // Basic
  title:             string
  tagline:           string
  category:          string
  icdCode:           string
  slug:              string
  relatedDiseases:   string[]

  // Medical content
  overview:          string
  causes:            string
  riskFactors:       string[]
  symptoms:          string
  earlyWarningSigns: string[]
  diagnosis:         string
  treatment:         string
  precautions:       string
  lifestyle:         string
  whenToSeeDoctor:   string[]
  faqs:              FAQ[]

  // Media
  coverImage:        ImageValue | null
  images:            MultiImageItem[]
  videos:            VideoEntry[]
  infographics:      InfographicItem[]

  // SEO
  seo: {
    focusKeyword:    string
    metaTitle:       string
    metaDescription: string
    keywords:        string[]
    canonical:       string
    ogTitle:         string
    ogDescription:   string
    ogImage:         string
  }
}

const EMPTY: FormState = {
  title: '', tagline: '', category: CATEGORIES[0], icdCode: '', slug: '', relatedDiseases: [],
  overview: '', causes: '', riskFactors: [], symptoms: '', earlyWarningSigns: [],
  diagnosis: '', treatment: '', precautions: '', lifestyle: '', whenToSeeDoctor: [], faqs: [],
  coverImage: null, images: [], videos: [], infographics: [],
  seo: { focusKeyword: '', metaTitle: '', metaDescription: '', keywords: [], canonical: '', ogTitle: '', ogDescription: '', ogImage: '' },
}

// ── Helpers ────────────────────────────────────────────────────────────────
function ChipInput({ label, value, onChange, placeholder }: {
  label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string
}) {
  const [input, setInput] = useState('')

  function add() {
    const v = input.trim()
    if (v && !value.includes(v)) onChange([...value, v])
    setInput('')
  }

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="flex flex-wrap gap-1.5 min-h-9 border border-gray-200 rounded-lg px-2 py-1.5 focus-within:ring-2 focus-within:ring-primary/20 bg-white">
        {value.map(chip => (
          <span key={chip} className="inline-flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded text-xs">
            {chip}
            <button type="button" onClick={() => onChange(value.filter(c => c !== chip))}>
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
          onBlur={add}
          placeholder={value.length === 0 ? (placeholder || 'Type and press Enter') : ''}
          className="flex-1 min-w-[120px] text-sm outline-none bg-transparent"
        />
      </div>
    </div>
  )
}

function BulletListInput({ label, value, onChange, placeholder, danger = false }: {
  label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; danger?: boolean
}) {
  const [input, setInput] = useState('')

  function add() {
    const v = input.trim(); if (!v) return
    onChange([...value, v]); setInput('')
  }

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="space-y-1.5">
        {value.map((item, idx) => (
          <div key={idx} className={clsx(
            'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm',
            danger ? 'border-red-100 bg-red-50 text-red-800' : 'border-gray-100 bg-gray-50 text-gray-700'
          )}>
            <span className="flex-1">{item}</span>
            <button type="button" onClick={() => onChange(value.filter((_, i) => i !== idx))}>
              <X className="w-3 h-3 text-gray-400 hover:text-red-500" />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            placeholder={placeholder || 'Add item and press Enter'}
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button type="button" onClick={add}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function FAQBuilder({ value, onChange }: { value: FAQ[]; onChange: (v: FAQ[]) => void }) {
  function add()    { onChange([...value, { q: '', a: '' }]) }
  function remove(i: number) { onChange(value.filter((_, idx) => idx !== i)) }
  function update(i: number, field: 'q' | 'a', val: string) {
    onChange(value.map((faq, idx) => idx === i ? { ...faq, [field]: val } : faq))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">FAQs (enables FAQ schema for SEO)</label>
        <button type="button" onClick={add}
          className="flex items-center gap-1 text-xs text-primary hover:underline">
          <Plus className="w-3.5 h-3.5" /> Add FAQ
        </button>
      </div>
      {value.map((faq, i) => (
        <div key={i} className="border border-gray-200 rounded-xl p-4 space-y-2 bg-gray-50">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-primary w-5 shrink-0">Q{i + 1}</span>
            <input
              value={faq.q}
              onChange={e => update(i, 'q', e.target.value)}
              placeholder="Enter the question"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20 bg-white"
            />
            <button type="button" onClick={() => remove(i)} className="p-1 hover:bg-red-50 rounded text-red-400">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-start gap-2 pl-7">
            <textarea
              value={faq.a}
              onChange={e => update(i, 'a', e.target.value)}
              placeholder="Enter the answer"
              rows={2}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20 bg-white resize-none"
            />
          </div>
        </div>
      ))}
      {value.length === 0 && (
        <div className="text-center py-4 border-2 border-dashed border-gray-200 rounded-xl">
          <p className="text-xs text-gray-400">No FAQs yet — add at least 2 for FAQ schema</p>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function DiseaseEditorPage() {
  const { id }          = useParams<{ id: string }>()
  const isEdit          = Boolean(id)
  const navigate        = useNavigate()
  const { user }        = useAuth()

  const [tab,     setTab]     = useState<TabId>('basic')
  const [form,    setForm]    = useState<FormState>(EMPTY)
  const [status,  setStatus]  = useState<DiseaseStatus>('draft')
  const [doctorNote, setDoctorNote] = useState('')
  const [saving,  setSaving]  = useState(false)
  const [loading, setLoading] = useState(isEdit)
  const [slugManual, setSlugManual] = useState(false)
  const [newVideoIdx, setNewVideoIdx] = useState(0)

  // ── Load existing doc ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isEdit || !id) return
    async function load() {
      const snap = await getDoc(doc(db, 'diseases', id!))
      if (snap.exists()) {
        const d = snap.data() as any
        setForm({
          title:             d.title             || '',
          tagline:           d.tagline           || '',
          category:          d.category          || CATEGORIES[0],
          icdCode:           d.icdCode           || '',
          slug:              d.slug              || '',
          relatedDiseases:   d.relatedDiseases   || [],
          overview:          d.overview          || '',
          causes:            d.causes            || '',
          riskFactors:       d.riskFactors       || [],
          symptoms:          d.symptoms          || '',
          earlyWarningSigns: d.earlyWarningSigns || [],
          diagnosis:         d.diagnosis         || '',
          treatment:         d.treatment         || '',
          precautions:       d.precautions       || '',
          lifestyle:         d.lifestyle         || '',
          whenToSeeDoctor:   d.whenToSeeDoctor   || [],
          faqs:              d.faqs              || [],
          coverImage:        d.coverImage        || null,
          images:            d.images            || [],
          videos:            d.videos            || [],
          infographics:      d.infographics      || [],
          seo: {
            focusKeyword:    d.seo?.focusKeyword    || '',
            metaTitle:       d.seo?.metaTitle       || '',
            metaDescription: d.seo?.metaDescription || '',
            keywords:        d.seo?.keywords        || [],
            canonical:       d.seo?.canonical       || '',
            ogTitle:         d.seo?.ogTitle         || '',
            ogDescription:   d.seo?.ogDescription   || '',
            ogImage:         d.seo?.ogImage         || '',
          },
        })
        setStatus(d.status || 'draft')
        setDoctorNote(d.doctorNote || '')
        setSlugManual(true)
      }
      setLoading(false)
    }
    load()
  }, [id, isEdit])

  // ── Auto-slug from title ───────────────────────────────────────────────
  const set = useCallback(<K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm(f => {
      const next = { ...f, [key]: val }
      if (key === 'title' && !slugManual) {
        next.slug = slugify(val as string)
        // auto-fill seo if empty
        if (!f.seo.metaTitle) next.seo = { ...next.seo, metaTitle: (val as string).slice(0, 60) }
        if (!f.seo.canonical)  next.seo = { ...next.seo, canonical: `https://upbeatheart.com/diseases/${next.slug}` }
      }
      if (key === 'slug') {
        next.seo = { ...next.seo, canonical: `https://upbeatheart.com/diseases/${val}` }
      }
      return next
    })
  }, [slugManual])

  function setSeo<K extends keyof FormState['seo']>(key: K, val: FormState['seo'][K]) {
    setForm(f => ({ ...f, seo: { ...f.seo, [key]: val } }))
  }

  // ── Persist to Firestore ───────────────────────────────────────────────
  async function save(submitForApproval = false) {
    if (!form.title.trim()) { toast.error('Disease title is required'); setTab('basic'); return }
    if (!form.slug.trim())  { toast.error('Slug is required');          setTab('basic'); return }
    setSaving(true)
    const newStatus: DiseaseStatus = submitForApproval ? 'pending_approval' : status === 'changes_requested' ? 'changes_requested' : status
    const payload: Record<string, unknown> = {
      title:             form.title,
      tagline:           form.tagline,
      category:          form.category,
      icdCode:           form.icdCode,
      slug:              form.slug,
      relatedDiseases:   form.relatedDiseases,
      overview:          form.overview,
      causes:            form.causes,
      riskFactors:       form.riskFactors,
      symptoms:          form.symptoms,
      earlyWarningSigns: form.earlyWarningSigns,
      diagnosis:         form.diagnosis,
      treatment:         form.treatment,
      precautions:       form.precautions,
      lifestyle:         form.lifestyle,
      whenToSeeDoctor:   form.whenToSeeDoctor,
      faqs:              form.faqs,
      coverImage:        form.coverImage,
      images:            form.images,
      videos:            form.videos,
      infographics:      form.infographics,
      seo:               form.seo,
      status:            newStatus,
      updatedAt:         serverTimestamp(),
      lastEditedBy:      user?.uid || '',
      visitCount:        0,
    }
    if (submitForApproval) {
      payload.submittedAt = serverTimestamp()
    }
    try {
      if (isEdit && id) {
        await updateDoc(doc(db, 'diseases', id), payload)
        toast.success(submitForApproval ? 'Submitted for doctor approval ✓' : 'Saved ✓')
        if (submitForApproval) setStatus('pending_approval')
      } else {
        payload.createdBy = user?.uid || ''
        payload.createdAt = serverTimestamp()
        payload.visitCount = 0
        const ref = await addDoc(collection(db, 'diseases'), payload)
        toast.success(submitForApproval ? 'Submitted for doctor approval ✓' : 'Draft saved ✓')
        navigate(`/diseases/${ref.id}/edit`, { replace: true })
      }
    } catch (e: any) {
      toast.error('Save failed: ' + e.message)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const canSubmit = status === 'draft' || status === 'changes_requested'

  // ── UI ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-5xl">

      {/* Top bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <Link to="/diseases" className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {isEdit ? (form.title || 'Edit Disease Article') : 'New Disease Article'}
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {isEdit ? `Editing · /diseases/${form.slug}` : 'Creating new article'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isEdit && <DiseaseStatusBadge status={status} />}
          <button
            type="button" disabled={saving} onClick={() => save(false)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Draft
          </button>
          {canSubmit && (
            <button
              type="button" disabled={saving} onClick={() => save(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50 shadow-sm transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Submit for Approval
            </button>
          )}
        </div>
      </div>

      {/* Doctor note (changes requested) */}
      {status === 'changes_requested' && doctorNote && (
        <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-xl">
          <AlertCircle className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-800">Doctor's Feedback</p>
            <p className="text-sm text-orange-700 mt-0.5">{doctorNote}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={clsx(
                'flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all shrink-0',
                tab === t.id
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              )}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">

          {/* ── TAB 1: Basic Info ─────────────────────────────────────── */}
          {tab === 'basic' && (
            <div className="space-y-5 max-w-2xl">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Disease Title <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.title}
                  onChange={e => set('title', e.target.value)}
                  placeholder="e.g. Heart Failure"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tagline</label>
                <input
                  value={form.tagline}
                  onChange={e => set('tagline', e.target.value)}
                  placeholder="One-sentence summary — e.g. When the heart can't pump enough blood"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.category}
                    onChange={e => set('category', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                  >
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ICD-10 Code</label>
                  <input
                    value={form.icdCode}
                    onChange={e => set('icdCode', e.target.value)}
                    placeholder="e.g. I50"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL Slug <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-primary/20">
                  <span className="px-3 py-2.5 text-xs text-gray-400 bg-gray-50 border-r border-gray-200 shrink-0">
                    upbeatheart.com/diseases/
                  </span>
                  <input
                    value={form.slug}
                    onChange={e => { setSlugManual(true); set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')) }}
                    placeholder="heart-failure"
                    className="flex-1 px-3 py-2.5 text-sm outline-none font-mono bg-white"
                  />
                </div>
                {!slugManual && form.title && (
                  <p className="text-xs text-gray-400 mt-1">Auto-generated from title. Click to edit manually.</p>
                )}
              </div>
            </div>
          )}

          {/* ── TAB 2: Medical Content ────────────────────────────────── */}
          {tab === 'content' && (
            <div className="space-y-8">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Overview <span className="text-red-500">*</span>
                  <span className="text-xs font-normal text-gray-400 ml-2">What is this disease?</span>
                </label>
                <RichEditor value={form.overview} onChange={v => set('overview', v)} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Causes <span className="text-red-500">*</span>
                  <span className="text-xs font-normal text-gray-400 ml-2">Why does it happen?</span>
                </label>
                <RichEditor value={form.causes} onChange={v => set('causes', v)} />
              </div>

              <ChipInput
                label="Risk Factors"
                value={form.riskFactors}
                onChange={v => set('riskFactors', v)}
                placeholder="High BP, Obesity, Diabetes — press Enter or comma"
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Symptoms <span className="text-red-500">*</span>
                  <span className="text-xs font-normal text-gray-400 ml-2">What does the patient feel?</span>
                </label>
                <RichEditor value={form.symptoms} onChange={v => set('symptoms', v)} />
              </div>

              <BulletListInput
                label="Early Warning Signs"
                value={form.earlyWarningSigns}
                onChange={v => set('earlyWarningSigns', v)}
                placeholder="Shortness of breath at rest…"
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Diagnosis
                  <span className="text-xs font-normal text-gray-400 ml-2">ECG, Echo, tests — how it's confirmed</span>
                </label>
                <RichEditor value={form.diagnosis} onChange={v => set('diagnosis', v)} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Treatment
                  <span className="text-xs font-normal text-gray-400 ml-2">Medical & surgical options</span>
                </label>
                <RichEditor value={form.treatment} onChange={v => set('treatment', v)} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Precautions & Self-Care <span className="text-red-500">*</span>
                  <span className="text-xs font-normal text-gray-400 ml-2">What can the patient do to help themselves?</span>
                </label>
                <RichEditor value={form.precautions} onChange={v => set('precautions', v)} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Lifestyle Advice
                  <span className="text-xs font-normal text-gray-400 ml-2">Diet, exercise, daily habits</span>
                </label>
                <RichEditor value={form.lifestyle} onChange={v => set('lifestyle', v)} />
              </div>

              <BulletListInput
                label="When to See a Doctor (Red Flag Symptoms)"
                value={form.whenToSeeDoctor}
                onChange={v => set('whenToSeeDoctor', v)}
                placeholder="Sudden chest pain or pressure…"
                danger
              />

              <FAQBuilder value={form.faqs} onChange={v => set('faqs', v)} />
            </div>
          )}

          {/* ── TAB 3: Media ─────────────────────────────────────────── */}
          {tab === 'media' && (
            <div className="space-y-8">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Cover Image</p>
                <ImageCropUpload
                  preset={CLOUDINARY_PRESET_IMG}
                  label="Cover Image"
                  hint="Shown in the hero disease slider and treatment page header"
                  value={typeof form.coverImage === 'string' ? form.coverImage : (form.coverImage as any)?.url ?? ''}
                  onChange={url => set('coverImage', url as unknown as import('@/components/upload/CloudinaryImageUpload').ImageValue)}
                  onRemove={() => set('coverImage', null)}
                  targetW={800}
                  targetH={500}
                  aspectLabel="8:5"
                  websiteUsage="Hero slider card (w-28 h-36) · Disease page full-width header"
                />
              </div>

              <div className="border-t border-gray-100 pt-6">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Additional Images
                  <span className="text-[10px] font-normal ml-2 normal-case">Anatomy diagrams, infographics, clinical images</span>
                </p>
                <MultiImageUpload
                  preset={CLOUDINARY_PRESET_IMG}
                  value={form.images}
                  onChange={v => set('images', v)}
                />
              </div>

              <div className="border-t border-gray-100 pt-6">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Videos
                  <span className="text-[10px] font-normal ml-2 normal-case">Upload to Cloudinary or embed YouTube — each video shown to patient</span>
                </p>
                <div className="space-y-4">
                  {form.videos.map((vid, idx) => (
                    <div key={vid.id} className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                        <span className="text-xs font-semibold text-gray-600">Video {idx + 1}</span>
                        <button type="button" onClick={() => set('videos', form.videos.filter((_, i) => i !== idx))}
                          className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                          <X className="w-3 h-3" /> Remove
                        </button>
                      </div>
                      <div className="p-4">
                        <CloudinaryVideoUpload
                          preset={CLOUDINARY_PRESET_VID}
                          value={vid}
                          onChange={v => { if (v) set('videos', form.videos.map((entry, i) => i === idx ? { ...v, id: vid.id } : entry)) }}
                          label=""
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => { set('videos', [...form.videos, { id: String(newVideoIdx), cloudinaryUrl: '', youtubeUrl: '', title: '', description: '', thumbnailUrl: '', durationSeconds: 0 }]); setNewVideoIdx(n => n + 1) }}
                    className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-200 hover:border-primary/40 rounded-xl text-sm text-gray-500 hover:text-primary transition-all w-full justify-center"
                  >
                    <Plus className="w-4 h-4" /> Add Video
                  </button>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-6">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Infographics</p>
                <InfographicUpload
                  preset={CLOUDINARY_PRESET_INFOG}
                  value={form.infographics}
                  onChange={v => set('infographics', v)}
                />
              </div>
            </div>
          )}

          {/* ── TAB 4: SEO ───────────────────────────────────────────── */}
          {tab === 'seo' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Focus Keyword <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.seo.focusKeyword}
                    onChange={e => setSeo('focusKeyword', e.target.value)}
                    placeholder="e.g. heart failure symptoms"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="text-xs text-gray-400 mt-1">Primary keyword this page should rank for</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-gray-700">Meta Title <span className="text-red-500">*</span></label>
                    <span className={clsx('text-xs font-mono', form.seo.metaTitle.length > 60 ? 'text-red-500' : form.seo.metaTitle.length >= 50 ? 'text-green-600' : 'text-gray-400')}>
                      {form.seo.metaTitle.length}/60
                    </span>
                  </div>
                  <input
                    value={form.seo.metaTitle}
                    onChange={e => setSeo('metaTitle', e.target.value)}
                    placeholder="Heart Failure — Causes, Symptoms & Treatment | UpBeat Heart"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-gray-700">Meta Description <span className="text-red-500">*</span></label>
                    <span className={clsx('text-xs font-mono', form.seo.metaDescription.length > 160 ? 'text-red-500' : form.seo.metaDescription.length >= 140 ? 'text-green-600' : 'text-gray-400')}>
                      {form.seo.metaDescription.length}/160
                    </span>
                  </div>
                  <textarea
                    value={form.seo.metaDescription}
                    onChange={e => setSeo('metaDescription', e.target.value)}
                    rows={3}
                    placeholder="Understand heart failure: causes, warning signs, treatment options and self-care tips. Expert guidance by Dr. [Name], Consultant Cardiologist."
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                  />
                </div>

                <ChipInput
                  label="Keywords"
                  value={form.seo.keywords}
                  onChange={v => setSeo('keywords', v)}
                  placeholder="heart failure, cardiac weakness, CHF — press Enter"
                />

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Canonical URL</label>
                  <input
                    value={form.seo.canonical}
                    onChange={e => setSeo('canonical', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 font-mono text-xs"
                  />
                </div>

                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Open Graph (Social Preview)</p>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">OG Title</label>
                    <input
                      value={form.seo.ogTitle}
                      onChange={e => setSeo('ogTitle', e.target.value)}
                      placeholder={form.seo.metaTitle || 'Defaults to Meta Title'}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">OG Description</label>
                    <textarea
                      value={form.seo.ogDescription}
                      onChange={e => setSeo('ogDescription', e.target.value)}
                      rows={2}
                      placeholder={form.seo.metaDescription || 'Defaults to Meta Description'}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">OG Image URL (1200×630)</label>
                    <input
                      value={form.seo.ogImage}
                      onChange={e => setSeo('ogImage', e.target.value)}
                      placeholder={form.coverImage?.url || 'Paste Cloudinary URL or select from media tab'}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 font-mono text-xs"
                    />
                    {form.coverImage?.url && !form.seo.ogImage && (
                      <button type="button" onClick={() => setSeo('ogImage', form.coverImage!.url)}
                        className="text-xs text-primary hover:underline mt-1">
                        Use cover image
                      </button>
                    )}
                  </div>
                </div>

                {/* Google preview */}
                {form.seo.metaTitle && (
                  <div className="border border-gray-200 rounded-xl p-4 bg-white space-y-1">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Google Preview</p>
                    <p className="text-[13px] text-blue-700 font-medium leading-tight hover:underline cursor-pointer">
                      {form.seo.metaTitle || form.title}
                    </p>
                    <p className="text-[11px] text-green-700 font-mono">
                      {form.seo.canonical || `https://upbeatheart.com/diseases/${form.slug}`}
                    </p>
                    <p className="text-[12px] text-gray-600 leading-snug">
                      {form.seo.metaDescription || 'No meta description set.'}
                    </p>
                  </div>
                )}
              </div>

              {/* SEO Score checker */}
              <div>
                <SEOScoreChecker
                  title={form.title}
                  metaTitle={form.seo.metaTitle}
                  metaDescription={form.seo.metaDescription}
                  focusKeyword={form.seo.focusKeyword}
                  coverImageAlt={form.coverImage?.alt || ''}
                  slug={form.slug}
                  overview={form.overview}
                  faqs={form.faqs}
                  hasVideo={form.videos.length > 0}
                />
              </div>
            </div>
          )}

          {/* ── TAB 5: Approval ──────────────────────────────────────── */}
          {tab === 'approval' && (
            <div className="max-w-xl space-y-6">
              <div className="flex items-center gap-3">
                <p className="text-sm font-medium text-gray-700">Current Status</p>
                <DiseaseStatusBadge status={status} />
              </div>

              {doctorNote && status === 'changes_requested' && (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl">
                  <p className="text-sm font-semibold text-orange-800 mb-1">Doctor's Note</p>
                  <p className="text-sm text-orange-700">{doctorNote}</p>
                </div>
              )}

              {/* Workflow timeline */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Approval Workflow</p>
                <div className="space-y-3">
                  {[
                    {
                      label: 'Draft',
                      desc: 'Admin creates and edits the disease article',
                      done: true,
                    },
                    {
                      label: 'Submitted for Approval',
                      desc: 'Admin submits — Doctor receives FCM notification',
                      done: ['pending_approval', 'changes_requested', 'published'].includes(status),
                    },
                    {
                      label: 'Doctor Reviewed',
                      desc: 'Doctor approves or requests changes via Doctor App',
                      done: ['published', 'changes_requested'].includes(status),
                    },
                    {
                      label: 'Published on Website',
                      desc: 'Visible at upbeatheart.com/diseases/ with full SEO',
                      done: status === 'published',
                    },
                  ].map((step, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <div className={clsx(
                        'w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                        step.done ? 'bg-green-500' : 'bg-gray-200'
                      )}>
                        {step.done
                          ? <CheckCircle className="w-3 h-3 text-white" />
                          : <span className="w-2 h-2 rounded-full bg-gray-400" />}
                      </div>
                      <div>
                        <p className={clsx('text-sm font-medium', step.done ? 'text-gray-900' : 'text-gray-400')}>
                          {step.label}
                        </p>
                        <p className="text-xs text-gray-400">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {canSubmit && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 space-y-3">
                  <div className="flex items-start gap-2">
                    <Stethoscope className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Ready to submit for doctor review?</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        The doctor will receive a push notification and can approve, request changes, or reject the article from the Doctor App.
                        Nothing is published until the doctor approves.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button" disabled={saving} onClick={() => save(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50 shadow-sm transition-colors"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Submit for Doctor Approval
                  </button>
                </div>
              )}

              {status === 'published' && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-green-800">Published</p>
                    <a
                      href={`https://upbeatheart.com/diseases/${form.slug}`}
                      target="_blank" rel="noopener"
                      className="text-xs text-green-700 hover:underline flex items-center gap-1 mt-0.5"
                    >
                      <Globe className="w-3 h-3" />
                      upbeatheart.com/diseases/{form.slug}
                    </a>
                  </div>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button" disabled={saving} onClick={() => save(false)}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save as Draft
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
