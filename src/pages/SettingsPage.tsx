/**
 * UpBeat Heart — Admin Dashboard
 * SettingsPage.tsx — Full advanced tab-based settings
 *
 * Tabs:
 *  1. Branding      — Logo, Favicon, OG Image (Cloudinary: upbeatheart/branding)
 *  2. Doctor Profile — Name, designation, bio, qualifications, photo, hospital
 *  3. Contact       — Phone, WhatsApp, email, address, clinic hours, Google Maps
 *  4. Social Media  — Facebook, Instagram, YouTube, LinkedIn, Twitter/X, Google Business
 *  5. Website       — Site title, meta desc, GA4, Razorpay mode, appointment toggle
 *  6. Account       — Current user info, sign-out
 *
 * Firestore: settings/site  (merged doc for all tabs)
 */

import { useState, useRef, useEffect, type ReactNode } from 'react'
import {
  Upload, Globe, Image as ImageIcon, User,
  Phone, MapPin, Clock, Share2, Shield, LogOut, Info,
  CheckCircle2, AlertCircle, Loader2, Eye, Trash2,
  ExternalLink, Facebook, Instagram, Youtube, Linkedin,
  Twitter, MessageCircle, Star, ChevronRight,
  Building2, GraduationCap, Stethoscope,
  BarChart3, CreditCard, Calendar, Video, IndianRupee,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import LogoCropUpload from '@/components/upload/LogoCropUpload'
import DoctorPhotoCropUpload from '@/components/upload/DoctorPhotoCropUpload'
import ImageCropUpload from '@/components/upload/ImageCropUpload'
import toast from 'react-hot-toast'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// ─── Cloudinary ───────────────────────────────────────────────────────────────
const CLOUD_NAME    = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'boc8bvoc'
const MAPS_API_KEY  = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
const BRANDING_FOLDER = 'upbeatheart/branding'

async function uploadToBranding(file: File, onProgress?: (pct: number) => void): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('upload_preset', 'upbeat_public') // swap → upbeat_branding once created
  fd.append('folder', BRANDING_FOLDER)
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`)
    xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => {
      try { const d = JSON.parse(xhr.responseText); if (d.secure_url) resolve(d.secure_url); else reject(new Error(d.error?.message || 'Upload failed')) }
      catch { reject(new Error('Invalid response')) }
    }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.send(fd)
  })
}


async function uploadVideoToCloudinary(file: File, onProgress?: (pct: number) => void): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('upload_preset', 'upbeat_videos')
  fd.append('folder', 'upbeatheart/videos')
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`)
    xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => {
      try { const d = JSON.parse(xhr.responseText); if (d.secure_url) resolve(d.secure_url); else reject(new Error(d.error?.message || 'Upload failed')) }
      catch { reject(new Error('Invalid response')) }
    }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.send(fd)
  })
}

// ─── Settings shape ───────────────────────────────────────────────────────────
interface ClinicHour { day: string; open: string; close: string; closed: boolean }

interface SiteSettings {
  // Branding
  logoUrl:          string
  faviconUrl:       string
  ogImageUrl:       string

  // Doctor Profile
  doctorName:       string
  doctorTitle:      string      // e.g. "Consultant Cardiologist"
  doctorBio:        string
  doctorPhotoUrl:   string
  doctorQuals:      string      // e.g. "MBBS, MD, DM (Cardiology)"
  doctorExperience: string      // e.g. "15+ years"
  hospitalName:     string      // e.g. "CARE Hospitals"
  hospitalAddress:  string

  // Contact
  phone:            string
  phoneAlt:         string
  whatsapp:         string
  email:            string
  emailAlt:         string
  address:          string
  mapsEmbedUrl:     string
  mapsLink:         string
  clinicHours:      ClinicHour[]

  // Social
  facebook:         string
  instagram:        string
  youtube:          string
  linkedin:         string
  twitter:          string
  googleBusiness:   string
  googleMapsProfile:string

  // Website / SEO
  siteTitle:        string
  siteTitleSuffix:  string
  siteDescription:  string
  gaId:             string
  razorpayMode:     'test' | 'live'
  appointmentsOpen: boolean
  appointmentNote:  string

  // Education Video
  educationVideoUrl:   string
  educationVideoTitle: string
  educationVideoDesc:  string

  // Donations / Payment
  donationEnabled:     boolean  // show donate section on website
  razorpayKeyId:       string   // Razorpay Key ID (publishable)
  upiId:               string   // e.g. upbeatheart@hdfcbank
  upiName:             string   // Display name for UPI
  upiQrUrl:            string   // Cloudinary URL of QR image (optional)
  bankAccountName:     string   // Account holder name
  bankAccountNumber:   string   // Account number
  bankIfsc:            string   // IFSC code
  bankName:            string   // Bank name
  bankBranch:          string   // Branch name
  chequePayableTo:     string   // "Pay to" name on cheque
  donationNote:        string   // Short note shown to donors

  // ── Home Page Section Visibility ────────────────────────────────────────────
  homeSections: {
    hero:        boolean   // Hero banner (always recommended ON)
    stats:       boolean   // Animated stats strip
    video:       boolean   // Education video section
    diseases:    boolean   // Diseases / treatments section
    campaigns:   boolean   // Active patient campaigns
    ngo:         boolean   // NGO partners section
    blogs:       boolean   // Latest blogs preview
    gallery:     boolean   // Gallery mosaic section
    reviews:     boolean   // Patient reviews carousel
    donate:      boolean   // Donate / payment section
    appointment: boolean   // Appointment CTA section
  }

  updatedAt?: any
  updatedBy?: string
}

const DEFAULT_HOURS: ClinicHour[] = [
  { day: 'Monday',    open: '09:00', close: '17:00', closed: false },
  { day: 'Tuesday',   open: '09:00', close: '17:00', closed: false },
  { day: 'Wednesday', open: '09:00', close: '17:00', closed: false },
  { day: 'Thursday',  open: '09:00', close: '17:00', closed: false },
  { day: 'Friday',    open: '09:00', close: '17:00', closed: false },
  { day: 'Saturday',  open: '09:00', close: '13:00', closed: false },
  { day: 'Sunday',    open: '09:00', close: '13:00', closed: true  },
]

const DEFAULTS: SiteSettings = {
  logoUrl: '', faviconUrl: '', ogImageUrl: '',
  doctorName: '', doctorTitle: 'Consultant Cardiologist', doctorBio: '',
  doctorPhotoUrl: '', doctorQuals: 'MBBS, MD, DM (Cardiology)',
  doctorExperience: '', hospitalName: 'CARE Hospitals', hospitalAddress: '',
  phone: '', phoneAlt: '', whatsapp: '', email: '', emailAlt: '',
  address: '', mapsEmbedUrl: '', mapsLink: '',
  clinicHours: DEFAULT_HOURS,
  facebook: '', instagram: '', youtube: '', linkedin: '',
  twitter: '', googleBusiness: '', googleMapsProfile: '',
  siteTitle: 'UpBeat Heart', siteTitleSuffix: '| Cardiology Care',
  siteDescription: 'Expert cardiac care, patient assistance programs, and health education.',
  gaId: '', razorpayMode: 'test',
  appointmentsOpen: true, appointmentNote: '',
  educationVideoUrl: '', educationVideoTitle: '', educationVideoDesc: '',
  donationEnabled: false,
  razorpayKeyId: '', upiId: '', upiName: '', upiQrUrl: '',
  bankAccountName: '', bankAccountNumber: '', bankIfsc: '',
  bankName: '', bankBranch: '', chequePayableTo: '', donationNote: '',
  homeSections: {
    hero:        true,
    stats:       true,
    video:       true,
    diseases:    true,
    campaigns:   true,
    ngo:         true,
    blogs:       true,
    gallery:     true,
    reviews:     true,
    donate:      true,
    appointment: true,
  },
}

async function loadSettings(): Promise<SiteSettings> {
  const snap = await getDoc(doc(db, 'settings', 'site'))
  if (!snap.exists()) return DEFAULTS
  const data = snap.data()
  return {
    ...DEFAULTS,
    ...data,
    clinicHours: data.clinicHours ?? DEFAULT_HOURS,
    homeSections: {
      hero:        data.homeSections?.hero        ?? true,
      stats:       data.homeSections?.stats       ?? true,
      video:       data.homeSections?.video       ?? true,
      diseases:    data.homeSections?.diseases    ?? true,
      campaigns:   data.homeSections?.campaigns   ?? true,
      ngo:         data.homeSections?.ngo         ?? true,
      blogs:       data.homeSections?.blogs       ?? true,
      gallery:     data.homeSections?.gallery     ?? true,
      reviews:     data.homeSections?.reviews     ?? true,
      donate:      data.homeSections?.donate      ?? true,
      appointment: data.homeSections?.appointment ?? true,
    },
  } as SiteSettings
}

async function saveSettings(data: Partial<SiteSettings>, uid: string) {
  await setDoc(doc(db, 'settings', 'site'), { ...data, updatedAt: serverTimestamp(), updatedBy: uid }, { merge: true })
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────
function Label({ children }: { children: ReactNode }) {
  return <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{children}</label>
}

function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-50 disabled:text-gray-400 placeholder:text-gray-300 ${className}`}
    />
  )
}

function Textarea({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none disabled:bg-gray-50 disabled:text-gray-400 placeholder:text-gray-300 ${className}`}
    />
  )
}

function FieldGroup({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function Divider() { return <div className="border-t border-gray-100 my-2" /> }

function InfoBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
      <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>{children}</span>
    </div>
  )
}

// ─── Brand upload widget ──────────────────────────────────────────────────────
interface UploadWidgetProps {
  label: string; hint: string; recommended: string
  currentUrl: string; accept: string
  onUploaded: (url: string) => void; onRemove: () => void; disabled?: boolean
}

function BrandUpload({ label, hint, recommended, currentUrl, accept, onUploaded, onRemove, disabled }: UploadWidgetProps) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [error, setError]         = useState('')
  const [preview, setPreview]     = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Only image files accepted'); return }
    if (file.size > 5 * 1024 * 1024)    { setError('Max 5 MB'); return }
    setError(''); setUploading(true); setProgress(0)
    try { const url = await uploadToBranding(file, setProgress); onUploaded(url) }
    catch (e: any) { setError(e.message || 'Upload failed') }
    setUploading(false); setProgress(0)
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
      </div>

      {currentUrl ? (
        <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
          <div className="w-16 h-16 rounded-xl overflow-hidden bg-white border border-gray-200 flex items-center justify-center shrink-0">
            <img src={currentUrl} alt={label} className="max-w-full max-h-full object-contain p-1" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-gray-500 font-mono truncate">{currentUrl.split('/').slice(-2).join('/')}</p>
            <p className="text-xs text-emerald-600 font-medium mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Saved to Cloudinary
            </p>
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={() => setPreview(true)} className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-white transition">
                <Eye className="w-3 h-3" /> Preview
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={disabled} className="flex items-center gap-1 px-2.5 py-1 text-xs text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition disabled:opacity-40">
                <Upload className="w-3 h-3" /> Replace
              </button>
              <button type="button" onClick={onRemove} disabled={disabled} className="flex items-center gap-1 px-2.5 py-1 text-xs text-red-500 border border-red-100 rounded-lg hover:bg-red-50 transition disabled:opacity-40">
                <Trash2 className="w-3 h-3" /> Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          onClick={() => !disabled && !uploading && fileRef.current?.click()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          onDragOver={e => e.preventDefault()}
          className={`border-2 border-dashed rounded-2xl p-7 text-center transition cursor-pointer
            ${uploading ? 'border-primary/40 bg-primary/5' : 'border-gray-200 hover:border-primary/40 hover:bg-gray-50'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-7 h-7 text-primary animate-spin" />
              <div className="w-48 mx-auto h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-primary font-medium">Uploading… {progress}%</p>
            </div>
          ) : (
            <>
              <Upload className="w-7 h-7 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-gray-500">Click or drag to upload</p>
              <p className="text-xs text-gray-300 mt-1">{recommended}</p>
            </>
          )}
        </div>
      )}

      {error && <p className="flex items-center gap-1 text-xs text-red-500"><AlertCircle className="w-3 h-3" />{error}</p>}
      <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />

      {preview && currentUrl && (
        <div className="fixed inset-0 bg-black/70 z-[500] flex items-center justify-center p-6" onClick={() => setPreview(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-4">
              <p className="font-semibold text-gray-900">{label}</p>
              <button onClick={() => setPreview(false)} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
            </div>
            <div className="bg-gray-50 rounded-xl p-6 flex items-center justify-center">
              <img src={currentUrl} alt={label} className="max-w-full max-h-[260px] object-contain" />
            </div>
            <a href={currentUrl} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center gap-1 text-xs text-primary hover:underline">
              <ExternalLink className="w-3 h-3" /> Open in Cloudinary
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Social row ───────────────────────────────────────────────────────────────
function SocialRow({
  icon, label, placeholder, value, onChange, prefix, disabled
}: {
  icon: ReactNode; label: string; placeholder: string; value: string
  onChange: (v: string) => void; prefix?: string; disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
        <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-primary/30">
          {prefix && <span className="px-3 py-2.5 text-xs text-gray-400 bg-gray-50 border-r border-gray-200 shrink-0 font-mono">{prefix}</span>}
          <input
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className="flex-1 px-3 py-2.5 text-sm focus:outline-none disabled:bg-gray-50 disabled:text-gray-400 placeholder:text-gray-300"
          />
        </div>
      </div>
      {value && (
        <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer"
          className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 hover:text-primary hover:border-primary/40 transition shrink-0">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  )
}


// ─── Doctor Video Upload component ───────────────────────────────────────────
type VideoInputMode = 'none' | 'upload' | 'youtube'

function DoctorVideoUpload({
  value, title, desc, disabled,
  onChange, onRemove,
}: {
  value: string; title: string; desc: string; disabled?: boolean
  onChange: (url: string, title: string, desc: string) => void
  onRemove: () => void
}) {
  const [mode, setMode]     = useState<VideoInputMode>(value ? (value.includes('cloudinary') ? 'upload' : 'youtube') : 'none')
  const [ytInput, setYt]    = useState(value && !value.includes('cloudinary') ? value : '')
  const [uploading, setUpl] = useState(false)
  const [progress, setPct]  = useState(0)
  const [err, setErr]       = useState('')
  const fileRef             = useRef<HTMLInputElement>(null)

  const ytMatch = value?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  const ytId    = ytMatch?.[1]
  const isCloud = value?.includes('cloudinary.com')
  const hasVideo = !!ytId || isCloud

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('video/')) { setErr('Only video files accepted'); return }
    if (file.size > 200 * 1024 * 1024)   { setErr('Max 200 MB'); return }
    setErr(''); setUpl(true); setPct(0)
    try {
      const url = await uploadVideoToCloudinary(file, setPct)
      onChange(url, title, desc)
      setMode('upload')
    } catch (e: any) { setErr(e.message || 'Upload failed') }
    setUpl(false); setPct(0)
  }

  const applyYoutube = () => {
    const yt = ytInput.trim()
    if (!yt) return
    const m = yt.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)
    if (!m) { setErr('Invalid YouTube URL. Use https://youtube.com/watch?v=XXX or https://youtu.be/XXX'); return }
    setErr('')
    onChange(yt, title, desc)
    setMode('youtube')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Video className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-gray-800">Patient Education Video</p>
        <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-medium">Shown on website home</span>
      </div>

      {hasVideo ? (
        <div className="rounded-2xl overflow-hidden border border-gray-200 bg-gray-50 space-y-4 p-4">
          <div className="rounded-xl overflow-hidden aspect-video bg-black">
            {ytId ? (
              <iframe
                src={`https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1`}
                className="w-full h-full"
                title="Education video preview"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <video src={value} controls className="w-full h-full object-cover" />
            )}
          </div>
          <div className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              {isCloud
                ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /><span className="text-xs text-emerald-600 font-medium">Cloudinary video</span></>
                : <><Youtube className="w-3.5 h-3.5 text-red-500" /><span className="text-xs text-red-600 font-medium">YouTube embed</span></>
              }
            </div>
            <button type="button" onClick={onRemove} disabled={disabled}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-500 border border-red-100 rounded-lg hover:bg-red-50 transition disabled:opacity-40">
              <Trash2 className="w-3 h-3" /> Remove video
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button type="button" onClick={() => { setMode('upload'); setErr('') }} disabled={disabled}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition
                ${mode === 'upload' ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
              <Upload className="w-4 h-4" /> Upload from device
            </button>
            <button type="button" onClick={() => { setMode('youtube'); setErr('') }} disabled={disabled}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition
                ${mode === 'youtube' ? 'border-red-400 bg-red-50 text-red-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
              <Youtube className="w-4 h-4" /> YouTube URL
            </button>
          </div>

          {mode === 'upload' && (
            <div
              onClick={() => !disabled && !uploading && fileRef.current?.click()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
              onDragOver={e => e.preventDefault()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition cursor-pointer
                ${uploading ? 'border-primary/40 bg-primary/5' : 'border-gray-200 hover:border-primary/40 hover:bg-gray-50'}
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <div className="w-56 mx-auto h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-sm text-primary font-medium">Uploading video… {progress}%</p>
                  <p className="text-xs text-gray-400">Large files may take a minute</p>
                </div>
              ) : (
                <>
                  <Video className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-gray-500">Click or drag video file here</p>
                  <p className="text-xs text-gray-400 mt-1">MP4, MOV, WebM · Max 200 MB · Stored in Cloudinary upbeatheart/videos</p>
                </>
              )}
            </div>
          )}

          {mode === 'youtube' && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1 flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-red-400/30">
                  <span className="px-3 py-2.5 bg-gray-50 border-r border-gray-200 shrink-0">
                    <Youtube className="w-4 h-4 text-red-500" />
                  </span>
                  <input
                    value={ytInput}
                    onChange={e => setYt(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && applyYoutube()}
                    placeholder="https://youtube.com/watch?v=... or https://youtu.be/..."
                    disabled={disabled}
                    className="flex-1 px-3 py-2.5 text-sm focus:outline-none disabled:bg-gray-50 placeholder:text-gray-300"
                  />
                </div>
                <button type="button" onClick={applyYoutube} disabled={disabled || !ytInput.trim()}
                  className="px-4 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 transition disabled:opacity-40">
                  Add
                </button>
              </div>
              <p className="text-xs text-gray-400">Paste the full YouTube video URL. This will be embedded on the website.</p>
            </div>
          )}
        </div>
      )}

      {err && <p className="flex items-center gap-1 text-xs text-red-500"><AlertCircle className="w-3 h-3" />{err}</p>}
      <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />

      <div className="space-y-3 pt-1">
        <FieldGroup label="Video Section Title" hint="Heading shown next to the video on the home page">
          <Input
            value={title}
            onChange={e => onChange(value, e.target.value, desc)}
            disabled={disabled}
            placeholder="Understanding Your Heart Health"
          />
        </FieldGroup>
        <FieldGroup label="Video Section Description" hint="Short paragraph shown below the title">
          <Textarea
            value={desc}
            onChange={e => onChange(value, title, e.target.value)}
            disabled={disabled}
            rows={3}
            placeholder="Watch expert-led videos on cardiology topics — from understanding risk factors to post-procedure care."
          />
        </FieldGroup>
      </div>

      <InfoBox>
        Upload videos to Cloudinary under folder <strong>upbeatheart/videos</strong> using preset <strong>upbeat_videos</strong>.
        For YouTube, paste the public or unlisted video URL above.
        The video autoplays (muted) when the section enters the viewport on the home page.
      </InfoBox>
    </div>
  )
}

// ─── Tab definitions ──────────────────────────────────────────────────────────
const TABS = [
  { id: 'branding',  label: 'Branding',        icon: ImageIcon },
  { id: 'doctor',    label: 'Doctor Profile',   icon: User },
  { id: 'contact',   label: 'Contact',          icon: Phone },
  { id: 'social',    label: 'Social Media',     icon: Share2 },
  { id: 'website',   label: 'Website & SEO',    icon: Globe },
  { id: 'donations', label: 'Donations',         icon: IndianRupee },
  { id: 'sections',  label: 'Page Sections',    icon: Eye },
  { id: 'account',   label: 'Account',          icon: Shield },
] as const
type TabId = typeof TABS[number]['id']

// ─── Toggle switch ────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={() => !disabled && onChange(!checked)} disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none
        ${checked ? 'bg-primary' : 'bg-gray-200'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [activeTab, setActiveTab] = useState<TabId>('branding')
  const [settings,  setSettings]  = useState<SiteSettings>(DEFAULTS)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [saveErr,   setSaveErr]   = useState('')

  useEffect(() => {
    loadSettings().then(s => { setSettings(s); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const update = (patch: Partial<SiteSettings>) => setSettings(prev => ({ ...prev, ...patch }))

  const updateHour = (idx: number, patch: Partial<ClinicHour>) => {
    const hours = settings.clinicHours.map((h, i) => i === idx ? { ...h, ...patch } : h)
    update({ clinicHours: hours })
  }

  const handleSave = async () => {
    if (!user) return
    setSaving(true); setSaved(false); setSaveErr('')
    try {
      await saveSettings(settings, user.uid)
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (e: any) { setSaveErr(e.message || 'Save failed') }
    setSaving(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-72 text-gray-300">
      <Loader2 className="w-8 h-8 animate-spin" />
    </div>
  )

  // ── Tab content renderers ──────────────────────────────────────────────────

  const renderBranding = () => (
    <div className="space-y-8">
      <div>
        <h3 className="font-semibold text-gray-900 text-sm mb-0.5">Site Branding Assets</h3>
        <p className="text-xs text-gray-400">All assets are uploaded to <span className="font-mono">upbeatheart/branding</span> on Cloudinary.</p>
      </div>

      {!isAdmin && <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
        <AlertCircle className="w-4 h-4 shrink-0" /> Only admins can edit branding assets.
      </div>}

      <LogoCropUpload
        label="Website Logo"
        hint="Shown in the site header, emails, and print materials. Upload any image — you'll crop and zoom it to exactly 400 × 120px before it's saved."
        targetW={400}
        targetH={120}
        preset="upbeat_public"
        value={settings.logoUrl}
        disabled={!isAdmin}
        onChange={url => update({ logoUrl: url })}
        onRemove={() => update({ logoUrl: '' })}
      />
      <Divider />
      <BrandUpload
        label="Favicon"
        hint="Shown in browser tabs and bookmarks. Upload a square PNG — Next.js generates all sizes."
        recommended="PNG 512 × 512px square"
        currentUrl={settings.faviconUrl}
        accept="image/png,image/x-icon"
        disabled={!isAdmin}
        onUploaded={url => update({ faviconUrl: url })}
        onRemove={() => update({ faviconUrl: '' })}
      />
      <Divider />
      <ImageCropUpload
        preset="upbeat_public"
        label="Default OG / Social Share Image"
        hint="Used as the social share image on pages without their own cover (home, about, contact). Must be exactly 1200×630px for WhatsApp, Facebook, and Twitter previews."
        targetW={1200}
        targetH={630}
        aspectLabel="1.91:1"
        websiteUsage="Social share preview on WhatsApp / Facebook / Twitter for all pages"
        value={settings.ogImageUrl}
        onChange={url => update({ ogImageUrl: url })}
        onRemove={() => update({ ogImageUrl: '' })}
        disabled={!isAdmin}
      />

      <InfoBox>
        Create an upload preset called <strong>upbeat_branding</strong> in Cloudinary → Settings → Upload Presets, with folder <strong>upbeatheart/branding</strong>. Then swap the preset in the code. This keeps branding assets isolated from public content.
      </InfoBox>
    </div>
  )

  const renderDoctor = () => (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-gray-900 text-sm mb-0.5">Doctor Profile</h3>
        <p className="text-xs text-gray-400">Used on the public website's About page, structured data (schema.org/Physician), and patient-facing content.</p>
      </div>

      {/* Photo — crop+zoom modal so it always saves at the correct portrait size */}
      <DoctorPhotoCropUpload
        value={settings.doctorPhotoUrl}
        onChange={url => update({ doctorPhotoUrl: url })}
        onRemove={() => update({ doctorPhotoUrl: '' })}
        disabled={!isAdmin}
      />
      <Divider />

      <div className="grid grid-cols-2 gap-4">
        <FieldGroup label="Full Name">
          <Input value={settings.doctorName} onChange={e => update({ doctorName: e.target.value })} disabled={!isAdmin} placeholder="Dr. Full Name" />
        </FieldGroup>
        <FieldGroup label="Title / Designation">
          <Input value={settings.doctorTitle} onChange={e => update({ doctorTitle: e.target.value })} disabled={!isAdmin} placeholder="Consultant Cardiologist" />
        </FieldGroup>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FieldGroup label="Qualifications" hint="Shown after the doctor's name (e.g. MBBS, MD, DM)">
          <Input value={settings.doctorQuals} onChange={e => update({ doctorQuals: e.target.value })} disabled={!isAdmin} placeholder="MBBS, MD, DM (Cardiology)" />
        </FieldGroup>
        <FieldGroup label="Years of Experience">
          <Input value={settings.doctorExperience} onChange={e => update({ doctorExperience: e.target.value })} disabled={!isAdmin} placeholder="15+ years" />
        </FieldGroup>
      </div>

      <FieldGroup label="Short Biography" hint="2–4 sentences shown on the About page and used in schema markup. Max 500 characters.">
        <Textarea
          value={settings.doctorBio}
          onChange={e => update({ doctorBio: e.target.value })}
          disabled={!isAdmin}
          rows={4}
          maxLength={500}
          placeholder="Dr. [Name] is a Consultant Cardiologist with over 15 years of experience in interventional cardiology..."
        />
        <p className={`text-xs mt-1 text-right font-mono ${settings.doctorBio.length > 480 ? 'text-amber-500' : 'text-gray-400'}`}>
          {settings.doctorBio.length}/500
        </p>
      </FieldGroup>

      <Divider />
      <div className="flex items-center gap-2 mb-1">
        <Building2 className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-gray-800">Hospital Association</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FieldGroup label="Hospital Name">
          <Input value={settings.hospitalName} onChange={e => update({ hospitalName: e.target.value })} disabled={!isAdmin} placeholder="CARE Hospitals" />
        </FieldGroup>
        <FieldGroup label="Hospital / Clinic Address">
          <Input value={settings.hospitalAddress} onChange={e => update({ hospitalAddress: e.target.value })} disabled={!isAdmin} placeholder="123, Medical Street, City" />
        </FieldGroup>
      </div>

      <Divider />

      {/* ── Education Video ───────────────────────────────── */}
      <DoctorVideoUpload
        value={settings.educationVideoUrl}
        title={settings.educationVideoTitle}
        desc={settings.educationVideoDesc}
        disabled={!isAdmin}
        onChange={(url, title, desc) => update({ educationVideoUrl: url, educationVideoTitle: title, educationVideoDesc: desc })}
        onRemove={() => update({ educationVideoUrl: '', educationVideoTitle: '', educationVideoDesc: '' })}
      />
    </div>
  )

  const renderContact = () => (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-gray-900 text-sm mb-0.5">Contact & Location</h3>
        <p className="text-xs text-gray-400">Used on the Contact page, footer, and appointment confirmation emails.</p>
      </div>

      {/* Phone & Email */}
      <div className="grid grid-cols-2 gap-4">
        <FieldGroup label="Primary Phone">
          <Input type="tel" value={settings.phone} onChange={e => update({ phone: e.target.value })} disabled={!isAdmin} placeholder="+91 98765 43210" />
        </FieldGroup>
        <FieldGroup label="Alternate Phone (optional)">
          <Input type="tel" value={settings.phoneAlt} onChange={e => update({ phoneAlt: e.target.value })} disabled={!isAdmin} placeholder="+91 98765 43211" />
        </FieldGroup>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FieldGroup label="WhatsApp Number" hint="Patients can click to chat directly">
          <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-primary/30">
            <span className="px-3 py-2.5 bg-gray-50 border-r border-gray-200 shrink-0">
              <MessageCircle className="w-4 h-4 text-emerald-500" />
            </span>
            <input type="tel" value={settings.whatsapp} onChange={e => update({ whatsapp: e.target.value })} disabled={!isAdmin} placeholder="+91 98765 43210" className="flex-1 px-3 py-2.5 text-sm focus:outline-none disabled:bg-gray-50 placeholder:text-gray-300" />
          </div>
        </FieldGroup>
        <FieldGroup label="Primary Email">
          <Input type="email" value={settings.email} onChange={e => update({ email: e.target.value })} disabled={!isAdmin} placeholder="doctor@upbeatheart.com" />
        </FieldGroup>
      </div>

      <FieldGroup label="Alternate Email (optional)" hint="For appointments or admin contact">
        <Input type="email" value={settings.emailAlt} onChange={e => update({ emailAlt: e.target.value })} disabled={!isAdmin} placeholder="appointments@upbeatheart.com" />
      </FieldGroup>

      <Divider />

      <FieldGroup label="Full Clinic / Hospital Address" hint="Displayed on Contact page and in structured data">
        <Textarea value={settings.address} onChange={e => update({ address: e.target.value })} disabled={!isAdmin} rows={3} placeholder="CARE Hospitals, 4th Floor, Cardiac Wing&#10;Street Name, Area&#10;City, State — PIN" />
      </FieldGroup>

      {/* ── Google Maps ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-gray-800">Google Maps</p>
          </div>
          {isAdmin && settings.address && MAPS_API_KEY && (
            <button
              type="button"
              onClick={() => {
                const encoded = encodeURIComponent(settings.address)
                const embedUrl = `https://www.google.com/maps/embed/v1/place?key=${MAPS_API_KEY}&q=${encoded}&zoom=16`
                const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encoded}`
                update({ mapsEmbedUrl: embedUrl, mapsLink })
                toast.success('Map URLs generated from address!')
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-primary hover:bg-primary/90 transition"
            >
              <MapPin className="w-3 h-3" />
              Auto-generate from Address
            </button>
          )}
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FieldGroup label="Embed URL" hint="Auto-generated or paste from Google Maps → Share → Embed a map">
              <Input value={settings.mapsEmbedUrl} onChange={e => update({ mapsEmbedUrl: e.target.value })} disabled={!isAdmin} placeholder="https://www.google.com/maps/embed/v1/place?key=..." />
            </FieldGroup>
            <FieldGroup label="Directions Link" hint="'Get directions' button on the Contact page">
              <Input value={settings.mapsLink} onChange={e => update({ mapsLink: e.target.value })} disabled={!isAdmin} placeholder="https://goo.gl/maps/..." />
            </FieldGroup>
          </div>

          {/* Live map preview using Maps Embed API */}
          {settings.mapsEmbedUrl ? (
            <div className="rounded-xl overflow-hidden border border-gray-200 h-52 relative">
              <iframe
                key={settings.mapsEmbedUrl}
                src={settings.mapsEmbedUrl}
                width="100%" height="100%"
                style={{ border: 0 }}
                allowFullScreen loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Clinic Location Preview"
              />
              <div className="absolute bottom-2 right-2">
                <a
                  href={settings.mapsLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.address)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-primary shadow-md border border-gray-200 hover:bg-primary/5 transition"
                >
                  <MapPin className="w-3 h-3" /> Open in Maps
                </a>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-300 h-52 flex flex-col items-center justify-center gap-2 text-center bg-gray-50">
              <MapPin className="w-8 h-8 text-gray-300" />
              <p className="text-xs text-gray-400 font-medium">
                {settings.address
                  ? 'Click "Auto-generate from Address" above to load the map'
                  : 'Enter the clinic address first, then generate the map'}
              </p>
            </div>
          )}

          {!MAPS_API_KEY && (
            <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⚠ VITE_GOOGLE_MAPS_API_KEY not set in .env — auto-generate is disabled. Add the key and restart the dev server.
            </p>
          )}
        </div>
      </div>

      <Divider />

      {/* Clinic hours */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold text-gray-800">Clinic Hours</p>
        </div>
        <div className="space-y-2">
          {settings.clinicHours.map((h, idx) => (
            <div key={h.day} className="flex items-center gap-3 py-2.5 px-4 rounded-xl border border-gray-100 bg-gray-50/50">
              <div className="w-24 shrink-0">
                <span className="text-sm font-medium text-gray-700">{h.day.slice(0, 3)}</span>
              </div>
              <Toggle checked={!h.closed} onChange={v => updateHour(idx, { closed: !v })} disabled={!isAdmin} />
              {h.closed ? (
                <span className="text-xs text-gray-400 font-medium">Closed</span>
              ) : (
                <div className="flex items-center gap-2 flex-1">
                  <input type="time" value={h.open}  onChange={e => updateHour(idx, { open: e.target.value })}  disabled={!isAdmin}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-100" />
                  <span className="text-gray-400 text-xs">to</span>
                  <input type="time" value={h.close} onChange={e => updateHour(idx, { close: e.target.value })} disabled={!isAdmin}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-100" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const renderSocial = () => (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-gray-900 text-sm mb-0.5">Social Media & Online Presence</h3>
        <p className="text-xs text-gray-400">Links appear in the website footer, contact page, and structured data. Leave blank to hide.</p>
      </div>

      <div className="space-y-4">
        <SocialRow icon={<Facebook className="w-4 h-4 text-[#1877F2]" />} label="Facebook Page" placeholder="upbeatheart" prefix="facebook.com/" value={settings.facebook} onChange={v => update({ facebook: v })} disabled={!isAdmin} />
        <SocialRow icon={<Instagram className="w-4 h-4 text-[#E4405F]" />} label="Instagram" placeholder="upbeatheart" prefix="instagram.com/" value={settings.instagram} onChange={v => update({ instagram: v })} disabled={!isAdmin} />
        <SocialRow icon={<Youtube className="w-4 h-4 text-[#FF0000]" />} label="YouTube Channel" placeholder="https://youtube.com/@upbeatheart" value={settings.youtube} onChange={v => update({ youtube: v })} disabled={!isAdmin} />
        <SocialRow icon={<Linkedin className="w-4 h-4 text-[#0A66C2]" />} label="LinkedIn" placeholder="https://linkedin.com/in/dr-name" value={settings.linkedin} onChange={v => update({ linkedin: v })} disabled={!isAdmin} />
        <SocialRow icon={<Twitter className="w-4 h-4 text-[#1DA1F2]" />} label="Twitter / X" placeholder="upbeatheart" prefix="x.com/" value={settings.twitter} onChange={v => update({ twitter: v })} disabled={!isAdmin} />
      </div>

      <Divider />

      <div className="flex items-center gap-2 mb-2">
        <Star className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-gray-800">Google Business</p>
      </div>
      <div className="space-y-4">
        <SocialRow icon={<Star className="w-4 h-4 text-amber-400" />} label="Google Business Profile URL" placeholder="https://g.page/upbeatheart" value={settings.googleBusiness} onChange={v => update({ googleBusiness: v })} disabled={!isAdmin} />
        <SocialRow icon={<MapPin className="w-4 h-4 text-red-500" />} label="Google Maps Business Listing" placeholder="https://maps.google.com/?cid=..." value={settings.googleMapsProfile} onChange={v => update({ googleMapsProfile: v })} disabled={!isAdmin} />
      </div>

      <InfoBox>
        These links are used in the <strong>Organization</strong> and <strong>Physician</strong> schema structured data blocks, which improve Google search appearance and local SEO.
      </InfoBox>
    </div>
  )

  const renderWebsite = () => (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-gray-900 text-sm mb-0.5">Website & SEO Configuration</h3>
        <p className="text-xs text-gray-400">Global defaults for the Next.js public website. Individual pages can override these.</p>
      </div>

      {/* Title & SEO */}
      <div className="grid grid-cols-2 gap-4">
        <FieldGroup label="Site Name">
          <Input value={settings.siteTitle} onChange={e => update({ siteTitle: e.target.value })} disabled={!isAdmin} placeholder="UpBeat Heart" />
        </FieldGroup>
        <FieldGroup label="Page Title Suffix">
          <Input value={settings.siteTitleSuffix} onChange={e => update({ siteTitleSuffix: e.target.value })} disabled={!isAdmin} placeholder="| Cardiology Care" />
        </FieldGroup>
      </div>
      {settings.siteTitle && (
        <div className="text-xs text-gray-500 -mt-2 bg-gray-50 rounded-xl px-4 py-2.5 border border-gray-100">
          <span className="text-gray-400">Example tab title: </span>
          <span className="font-mono text-gray-700">Heart Attack Treatment {settings.siteTitleSuffix} — {settings.siteTitle}</span>
        </div>
      )}

      <FieldGroup label="Default Meta Description" hint="Shown in Google search results for pages without a specific description. 120–160 characters.">
        <Textarea value={settings.siteDescription} onChange={e => update({ siteDescription: e.target.value })} disabled={!isAdmin} rows={3} maxLength={160} placeholder="Expert cardiac care, patient assistance programs, and health education by Dr. [Name], Consultant Cardiologist." />
        <div className="flex justify-end">
          <span className={`text-xs font-mono mt-1 ${settings.siteDescription.length > 155 ? 'text-amber-500' : 'text-gray-400'}`}>
            {settings.siteDescription.length}/160
          </span>
        </div>
      </FieldGroup>

      <FieldGroup label="Google Analytics 4 — Measurement ID" hint="From GA4 → Admin → Data Streams → your web stream.">
        <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-primary/30">
          <span className="px-3 py-2.5 bg-gray-50 border-r border-gray-200">
            <BarChart3 className="w-4 h-4 text-gray-400" />
          </span>
          <input value={settings.gaId} onChange={e => update({ gaId: e.target.value })} disabled={!isAdmin} placeholder="G-XXXXXXXXXX" className="flex-1 px-3 py-2.5 text-sm font-mono focus:outline-none disabled:bg-gray-50 placeholder:text-gray-300" />
        </div>
      </FieldGroup>

      <Divider />

      {/* Razorpay */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <CreditCard className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold text-gray-800">Razorpay Payment Mode</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            {(['test', 'live'] as const).map(mode => (
              <button key={mode} type="button" disabled={!isAdmin} onClick={() => update({ razorpayMode: mode })}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition
                  ${settings.razorpayMode === mode
                    ? mode === 'live' ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-amber-500 text-white border-amber-500 shadow-sm'
                    : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'}
                  disabled:opacity-50 disabled:cursor-not-allowed`}>
                {mode === 'test' ? '🧪 Test Mode' : '✅ Live Mode'}
              </button>
            ))}
          </div>
          <p className={`text-xs font-medium flex items-center gap-1 ${settings.razorpayMode === 'live' ? 'text-emerald-600' : 'text-amber-600'}`}>
            {settings.razorpayMode === 'live'
              ? <><CheckCircle2 className="w-3.5 h-3.5" /> Live — real transactions</>
              : <><AlertCircle className="w-3.5 h-3.5" /> Sandboxed — no real money</>
            }
          </p>
        </div>
      </div>

      <Divider />

      {/* Appointment toggle */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold text-gray-800">Online Appointment Booking</p>
        </div>
        <div className="flex items-center justify-between p-4 border border-gray-100 rounded-2xl bg-gray-50/50">
          <div>
            <p className="text-sm font-medium text-gray-800">Accept online bookings</p>
            <p className="text-xs text-gray-400 mt-0.5">Disable to temporarily pause new appointment requests</p>
          </div>
          <Toggle checked={settings.appointmentsOpen} onChange={v => update({ appointmentsOpen: v })} disabled={!isAdmin} />
        </div>
        {!settings.appointmentsOpen && (
          <div className="mt-3">
            <FieldGroup label="Message shown to patients when booking is closed" hint="e.g. 'Dr. [Name] is on leave until 15 Aug. Call +91 98765 for urgent consultations.'">
              <Textarea value={settings.appointmentNote} onChange={e => update({ appointmentNote: e.target.value })} disabled={!isAdmin} rows={2} placeholder="Appointments are temporarily unavailable. Please call us for urgent consultations." />
            </FieldGroup>
          </div>
        )}
      </div>
    </div>
  )

  const updateSection = (key: keyof SiteSettings['homeSections'], value: boolean) => {
    update({ homeSections: { ...settings.homeSections, [key]: value } })
  }

  const SECTIONS: { key: keyof SiteSettings['homeSections']; label: string; desc: string; icon: any }[] = [
    { key: 'hero',        label: 'Hero Banner',           desc: 'Full-screen hero with doctor photo and CTA buttons',       icon: Star },
    { key: 'stats',       label: 'Stats Strip',           desc: 'Animated counters — patients, years, campaigns, NGOs',     icon: BarChart3 },
    { key: 'video',       label: 'Education Video',       desc: 'Patient education video section',                          icon: Video },
    { key: 'diseases',    label: 'Diseases & Treatments', desc: 'Categorised disease library with browse cards',            icon: Stethoscope },
    { key: 'campaigns',   label: 'Patient Campaigns',     desc: 'Active patient assistance campaigns with donate CTAs',     icon: MessageCircle },
    { key: 'ngo',         label: 'NGO Partners',          desc: 'NGO directory preview and partnership CTA',                icon: Building2 },
    { key: 'blogs',       label: 'Latest Blogs',          desc: 'Three most recent published blog posts',                   icon: GraduationCap },
    { key: 'gallery',     label: 'Gallery',               desc: 'Photo & video mosaic grid from the gallery collection',    icon: ImageIcon },
    { key: 'reviews',     label: 'Patient Reviews',       desc: 'Auto-scroll carousel of published patient testimonials',   icon: Star },
    { key: 'donate',      label: 'Donate Section',        desc: 'Donation payment options (also controlled by Donations tab)', icon: IndianRupee },
    { key: 'appointment', label: 'Appointment CTA',       desc: 'Full-width call-to-action strip with booking button',     icon: Calendar },
  ]

  const renderSections = () => (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-gray-900 text-sm mb-0.5">Home Page Sections</h3>
        <p className="text-xs text-gray-400">
          Control which sections are visible on the public website home page. Changes take effect within 60 seconds.
        </p>
      </div>

      <InfoBox>
        Hiding a section removes it entirely from the home page for all visitors. The data (gallery photos, blogs, etc.) is NOT deleted — only the section display is toggled.
      </InfoBox>

      <div className="space-y-2">
        {SECTIONS.map(({ key, label, desc, icon: Icon }) => {
          const isOn = settings.homeSections?.[key] ?? true
          const isHero = key === 'hero'
          return (
            <div
              key={key}
              className={`flex items-center gap-4 p-4 rounded-2xl border transition-all duration-200 ${
                isOn
                  ? 'bg-white border-gray-100 shadow-sm'
                  : 'bg-gray-50/70 border-gray-100 opacity-70'
              }`}
            >
              {/* Icon */}
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                isOn ? 'bg-primary/10' : 'bg-gray-100'
              }`}>
                <Icon className={`w-4 h-4 ${isOn ? 'text-primary' : 'text-gray-400'}`} />
              </div>

              {/* Label + desc */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-semibold ${isOn ? 'text-gray-900' : 'text-gray-400'}`}>
                    {label}
                  </p>
                  {isHero && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
                      Always On
                    </span>
                  )}
                  {!isOn && !isHero && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-500 font-semibold">
                      Hidden
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{desc}</p>
              </div>

              {/* Toggle */}
              <Toggle
                checked={isOn}
                onChange={v => updateSection(key, v)}
                disabled={!isAdmin || isHero}
              />
            </div>
          )
        })}
      </div>

      <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-xs text-emerald-700">
        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          <strong>Tip:</strong> Use "Save Settings" below to push visibility changes to the website. The site refreshes its settings every 60 seconds automatically.
        </span>
      </div>
    </div>
  )

  const renderAccount = () => (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-gray-900 text-sm mb-0.5">Account</h3>
        <p className="text-xs text-gray-400">Your login credentials are managed by Firebase Authentication.</p>
      </div>

      <div className="rounded-2xl border border-gray-100 overflow-hidden">
        {[
          { label: 'Name',  value: user?.name  || '—' },
          { label: 'Email', value: user?.email || '—' },
          {
            label: 'Role',
            value: <span className={`capitalize px-2.5 py-1 rounded-lg text-xs font-semibold
              ${user?.role === 'admin' ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'}`}>
              {user?.role || '—'}
            </span>
          },
          { label: 'UID', value: <span className="font-mono text-xs text-gray-400 break-all">{user?.uid || '—'}</span> },
        ].map(({ label, value }, i, arr) => (
          <div key={label} className={`flex items-center justify-between px-5 py-3.5 ${i < arr.length - 1 ? 'border-b border-gray-50' : ''}`}>
            <span className="text-sm text-gray-500 shrink-0 w-20">{label}</span>
            <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
          </div>
        ))}
      </div>

      <InfoBox>
        To change your name, password, or email — go to Firebase Console → Authentication → Users.
      </InfoBox>

      <Divider />

      <div>
        <p className="text-sm font-semibold text-gray-800 mb-3">Cloudinary Reference</p>
        <div className="rounded-2xl border border-gray-100 overflow-hidden text-xs">
          <div className="grid grid-cols-3 px-4 py-2.5 bg-gray-50 border-b border-gray-100 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">
            <span>Folder</span><span className="text-right">Preset</span><span className="text-right">Type</span>
          </div>
          {[
            { folder: 'upbeatheart/public',   preset: 'upbeat_public',   type: 'Unsigned', color: 'text-emerald-600' },
            { folder: 'upbeatheart/patients', preset: 'upbeat_patients', type: 'Signed',   color: 'text-amber-600'  },
            { folder: 'upbeatheart/videos',   preset: 'upbeat_videos',   type: 'Signed',   color: 'text-amber-600'  },
            { folder: 'upbeatheart/branding', preset: 'upbeat_branding', type: 'Signed',   color: 'text-amber-600'  },
          ].map(({ folder, preset, type, color }, i, arr) => (
            <div key={folder} className={`grid grid-cols-3 px-4 py-3 ${i < arr.length - 1 ? 'border-b border-gray-50' : ''}`}>
              <span className="font-mono text-gray-700">{folder}</span>
              <span className="text-right font-mono text-gray-500">{preset}</span>
              <span className={`text-right font-semibold ${color}`}>{type}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">Cloud: <span className="font-mono">{CLOUD_NAME}</span></p>
      </div>

      <Divider />

      <div>
        <p className="text-sm font-semibold text-gray-800 mb-3">Session</p>
        <button type="button" onClick={() => signOut()}
          className="flex items-center gap-2 px-5 py-2.5 text-sm text-red-600 border border-red-100 rounded-xl hover:bg-red-50 transition font-medium">
          <LogOut className="w-4 h-4" /> Sign out from this device
        </button>
        <p className="text-xs text-gray-400 mt-2">To revoke all sessions, use Firebase Console → Authentication → Users → Revoke tokens.</p>
      </div>
    </div>
  )

  const renderDonations = () => (
    <div className="space-y-8">
      <div>
        <h3 className="font-semibold text-gray-900 text-sm mb-0.5">Donation Settings</h3>
        <p className="text-xs text-gray-400">Configure how donors can contribute — shown on the website's Donate section and page.</p>
      </div>

      {!isAdmin && <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
        <AlertCircle className="w-4 h-4 shrink-0" /> Only admins can edit donation settings.
      </div>}

      {/* Enable toggle */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
        <div>
          <p className="text-sm font-semibold text-gray-800">Show Donate Section on Website</p>
          <p className="text-xs text-gray-400 mt-0.5">Enables the donation section on the home page and /donate page</p>
        </div>
        <Toggle checked={settings.donationEnabled} onChange={v => update({ donationEnabled: v })} disabled={!isAdmin} />
      </div>

      <Divider />

      {/* Razorpay */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Razorpay (Online Payment)</h4>
        <FieldGroup label="Razorpay Key ID" hint="Your publishable key (starts with rzp_test_ or rzp_live_). Secret key stays server-side only.">
          <Input value={settings.razorpayKeyId} onChange={e => update({ razorpayKeyId: e.target.value })} disabled={!isAdmin} placeholder="rzp_live_XXXXXXXXXXXX" className="font-mono" />
        </FieldGroup>
      </div>

      <Divider />

      {/* UPI */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">UPI Details</h4>
        <div className="grid grid-cols-2 gap-4">
          <FieldGroup label="UPI ID" hint="e.g. upbeatheart@hdfcbank">
            <Input value={settings.upiId} onChange={e => update({ upiId: e.target.value })} disabled={!isAdmin} placeholder="name@bankname" className="font-mono" />
          </FieldGroup>
          <FieldGroup label="Display Name" hint="Name shown below UPI ID">
            <Input value={settings.upiName} onChange={e => update({ upiName: e.target.value })} disabled={!isAdmin} placeholder="UpBeat Heart Foundation" />
          </FieldGroup>
        </div>
        <FieldGroup label="UPI QR Code Image" hint="Upload a QR code image for direct scanning (optional — auto-generated QR shown if blank)">
          <ImageCropUpload
            preset="upbeat_public"
            label="UPI QR Code"
            hint="Square QR code image shown to donors — 400×400px"
            targetW={400}
            targetH={400}
            aspectLabel="1:1"
            websiteUsage="Donate page UPI section (200×200px display)"
            value={settings.upiQrUrl}
            onChange={url => update({ upiQrUrl: url })}
            onRemove={() => update({ upiQrUrl: '' })}
            disabled={!isAdmin}
          />
        </FieldGroup>
      </div>

      <Divider />

      {/* Bank transfer */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Bank Account (NEFT / RTGS / IMPS)</h4>
        <div className="grid grid-cols-2 gap-4">
          <FieldGroup label="Account Name">
            <Input value={settings.bankAccountName} onChange={e => update({ bankAccountName: e.target.value })} disabled={!isAdmin} placeholder="UpBeat Heart Foundation" />
          </FieldGroup>
          <FieldGroup label="Account Number">
            <Input value={settings.bankAccountNumber} onChange={e => update({ bankAccountNumber: e.target.value })} disabled={!isAdmin} placeholder="1234567890" className="font-mono" />
          </FieldGroup>
          <FieldGroup label="IFSC Code">
            <Input value={settings.bankIfsc} onChange={e => update({ bankIfsc: e.target.value.toUpperCase() })} disabled={!isAdmin} placeholder="HDFC0001234" className="font-mono uppercase" />
          </FieldGroup>
          <FieldGroup label="Bank Name">
            <Input value={settings.bankName} onChange={e => update({ bankName: e.target.value })} disabled={!isAdmin} placeholder="HDFC Bank" />
          </FieldGroup>
          <div className="col-span-2"><FieldGroup label="Branch">
            <Input value={settings.bankBranch} onChange={e => update({ bankBranch: e.target.value })} disabled={!isAdmin} placeholder="Bhubaneswar Main Branch" />
          </FieldGroup></div>
        </div>
      </div>

      <Divider />

      {/* Cheque */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Cheque / DD</h4>
        <FieldGroup label="Cheque Payable To" hint="Exact name to write on the cheque">
          <Input value={settings.chequePayableTo} onChange={e => update({ chequePayableTo: e.target.value })} disabled={!isAdmin} placeholder="UpBeat Heart Foundation" />
        </FieldGroup>
      </div>

      <Divider />

      {/* Note */}
      <FieldGroup label="Donation Note" hint="Short message shown to donors (e.g. tax exemption info, acknowledgment)">
        <Textarea value={settings.donationNote} onChange={e => update({ donationNote: e.target.value })} disabled={!isAdmin} rows={3}
          placeholder="All donations are eligible for tax deduction under Section 80G of the Income Tax Act." />
      </FieldGroup>

      <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl text-xs text-blue-700 space-y-1.5">
        <p className="font-bold">How it works</p>
        <p>• Razorpay handles online card/UPI/netbanking payments — donors get instant confirmation.</p>
        <p>• UPI / Bank / Cheque are offline methods — admin manually records them in the Donations page.</p>
        <p>• Approved donations (marked Paid by admin) appear on the website donor wall, grouped by month.</p>
        <p>• Only donor names are shown publicly — emails and phones are never exposed.</p>
      </div>
    </div>
  )

  const tabContent: Record<TabId, ReactNode> = {
    branding: renderBranding(),
    doctor:   renderDoctor(),
    contact:  renderContact(),
    social:     renderSocial(),
    website:    renderWebsite(),
    donations:  renderDonations(),
    sections:   renderSections(),
    account:    renderAccount(),
  }

  return (
    <div className="max-w-4xl mx-auto pb-16">

      {/* ── Header ── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-400 text-sm mt-1">Configure your site branding, doctor profile, contact info, social links, and platform settings.</p>
      </div>

      {/* ── Tab layout ── */}
      <div className="flex gap-6 items-start">

        {/* Sidebar tabs */}
        <div className="w-52 shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 text-sm font-medium transition-all text-left border-b border-gray-50 last:border-0
                ${activeTab === id
                  ? 'bg-primary text-white'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${activeTab === id ? 'text-white' : 'text-gray-400'}`} />
              <span>{label}</span>
              {activeTab === id && <ChevronRight className="w-3.5 h-3.5 ml-auto text-white/70" />}
            </button>
          ))}
        </div>

        {/* Content area */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-7">
            {tabContent[activeTab]}
          </div>

          {/* Save bar — not shown on account tab (no editable fields) */}
          {activeTab !== 'account' && isAdmin && (
            <div className="mt-4 flex items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4">
              <div>
                {saved    && <p className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium"><CheckCircle2 className="w-4 h-4" /> Settings saved</p>}
                {saveErr  && <p className="flex items-center gap-1.5 text-sm text-red-500"><AlertCircle className="w-4 h-4" /> {saveErr}</p>}
                {!saved && !saveErr && <p className="text-xs text-gray-400">Changes are saved to Firestore → <span className="font-mono">settings/site</span></p>}
              </div>
              <button type="button" onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-60 shadow-md shadow-primary/20">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save Settings'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
