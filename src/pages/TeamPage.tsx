/**
 * UpBeat Heart — Admin Dashboard
 * TeamPage.tsx — Doctor & Team Management
 *
 * Add Doctor Modal — 4-step wizard (Account / Profile / Credentials / Availability)
 * Edit Doctor Modal — same sections, pre-filled, no email/password change
 * Uses secondary Firebase app instance so admin stays signed in throughout.
 */

import { useState, useEffect, useRef, DragEvent, ChangeEvent } from 'react'
import {
  collection, getDocs, doc, setDoc, updateDoc,
  deleteDoc, serverTimestamp, query, orderBy,
} from 'firebase/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import {
  getAuth,
  createUserWithEmailAndPassword as createUser,
  sendPasswordResetEmail as sendReset,
} from 'firebase/auth'
import { db, auth } from '@/lib/firebase'
import { uploadToCloudinary } from '@/lib/cloudinary'
import {
  UserPlus, Users, Stethoscope, Shield, Mail, Lock,
  RefreshCw, Trash2, CheckCircle2, AlertCircle,
  Loader2, Eye, EyeOff, X, User, KeyRound,
  ToggleLeft, ToggleRight, Crown, Camera, Plus,
  Minus, GraduationCap, Building2, Clock, Calendar,
  Phone, BadgeCheck, ChevronRight, ChevronLeft,
  FileText, MapPin, Pencil,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import ImageCropUpload from '@/components/upload/ImageCropUpload'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Degree { degree: string; institution: string; year: string }

interface TeamMember {
  uid:             string
  email:           string
  name:            string
  role:            'admin' | 'doctor'
  phone?:          string
  designation?:    string
  photoURL?:       string
  active?:         boolean
  createdAt?:      string
  specialisation?: string
  bio?:            string
  degrees?:        Degree[]
  regNumber?:      string
  experience?:     string
  hospital?:       string
  clinicAddress?:  string
  opdDays?:        string[]
  consultHours?:   string
}

// ─── Wizard step definitions ──────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Profile',      icon: Camera,        desc: 'Photo & details'   },
  { id: 2, label: 'Credentials',  icon: GraduationCap, desc: 'Degrees & reg.'    },
  { id: 3, label: 'Availability', icon: Calendar,      desc: 'Hospital & hours'  },
]

const ADD_STEPS = [
  { id: 1, label: 'Account',      icon: User,          desc: 'Login credentials' },
  { id: 2, label: 'Profile',      icon: Camera,        desc: 'Photo & details'   },
  { id: 3, label: 'Credentials',  icon: GraduationCap, desc: 'Degrees & reg.'    },
  { id: 4, label: 'Availability', icon: Calendar,      desc: 'Hospital & hours'  },
]

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

// ─── Secondary Firebase App ───────────────────────────────────────────────────

function getSecondaryAuth() {
  const config = {
    apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  }
  const secondaryApp = initializeApp(config, `secondary-auth-${Date.now()}`)
  return { app: secondaryApp, auth: getAuth(secondaryApp) }
}

// ─── Shared UI Helpers ────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-700">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

function IconInput({ icon: Icon, ...props }: { icon: React.ElementType } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      <input className={`${inputCls} pl-9`} {...props} />
    </div>
  )
}

// ─── Photo Upload ─────────────────────────────────────────────────────────────

// @ts-ignore -- PhotoUpload kept for future use
function PhotoUpload({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [dragOver, setDragOver]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file.'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('File must be under 5 MB.'); return }
    setUploading(true); setProgress(0)
    try {
      const res = await uploadToCloudinary(file, 'upbeat_public', setProgress)
      onChange(res.url)
      toast.success('Photo uploaded!')
    } catch (e: any) {
      toast.error('Upload failed: ' + e.message)
    } finally { setUploading(false) }
  }

  function onDrop(e: DragEvent) { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }
  function onInput(e: ChangeEvent<HTMLInputElement>) { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <div className="w-28 h-28 rounded-full border-4 border-primary/20 bg-primary/5 overflow-hidden flex items-center justify-center">
          {value ? <img src={value} alt="Doctor photo" className="w-full h-full object-cover" /> : <User className="w-12 h-12 text-primary/30" />}
        </div>
        {value && (
          <button type="button" onClick={() => onChange('')}
            className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 transition">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      <div onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)}
        onDrop={onDrop} onClick={() => inputRef.current?.click()}
        className={clsx('w-full border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all',
          dragOver ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-primary/50 hover:bg-gray-50')}>
        {uploading ? (
          <div className="space-y-2">
            <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" />
            <div className="w-40 mx-auto h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-gray-400">Uploading… {progress}%</p>
          </div>
        ) : (
          <div className="space-y-1">
            <Camera className="w-6 h-6 text-gray-400 mx-auto" />
            <p className="text-sm font-medium text-gray-600">{value ? 'Replace photo' : 'Upload doctor photo'}</p>
            <p className="text-xs text-gray-400">JPG, PNG, WebP · max 5 MB</p>
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onInput} />
    </div>
  )
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, steps }: { current: number; steps: typeof ADD_STEPS }) {
  return (
    <div className="flex items-center justify-between mb-6">
      {steps.map((step, i) => {
        const done = current > step.id; const active = current === step.id
        const Icon = step.icon
        return (
          <div key={step.id} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div className={clsx('w-9 h-9 rounded-full flex items-center justify-center transition-all',
                done ? 'bg-primary text-white shadow-sm' : active ? 'bg-primary/10 text-primary border-2 border-primary' : 'bg-gray-100 text-gray-400')}>
                {done ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              </div>
              <span className={clsx('text-[10px] font-semibold tracking-wide hidden sm:block',
                active ? 'text-primary' : done ? 'text-gray-500' : 'text-gray-300')}>{step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={clsx('flex-1 h-0.5 mx-1 rounded-full transition-all', current > step.id ? 'bg-primary' : 'bg-gray-100')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Degrees Editor (shared) ─────────────────────────────────────────────────

function DegreesEditor({ degrees, setDegrees }: { degrees: Degree[]; setDegrees: (d: Degree[]) => void }) {
  function add() { setDegrees([...degrees, { degree: '', institution: '', year: '' }]) }
  function remove(i: number) { setDegrees(degrees.filter((_, idx) => idx !== i)) }
  function set(i: number, field: keyof Degree, v: string) {
    setDegrees(degrees.map((row, idx) => idx === i ? { ...row, [field]: v } : row))
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-gray-700">Degrees & Qualifications *</label>
        <button type="button" onClick={add} className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-dark transition">
          <Plus className="w-3.5 h-3.5" /> Add Degree
        </button>
      </div>
      {degrees.map((d, i) => (
        <div key={i} className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Degree {i + 1}</span>
            {degrees.length > 1 && (
              <button type="button" onClick={() => remove(i)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                <Minus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} placeholder="Degree (e.g. MBBS)" value={d.degree} onChange={e => set(i, 'degree', e.target.value)} />
            <input className={inputCls} placeholder="Year (e.g. 2005)" value={d.year} onChange={e => set(i, 'year', e.target.value)} maxLength={4} />
          </div>
          <input className={inputCls} placeholder="Institution (e.g. AIIMS New Delhi)" value={d.institution} onChange={e => set(i, 'institution', e.target.value)} />
        </div>
      ))}
    </div>
  )
}

// ─── OPD Days Picker (shared) ────────────────────────────────────────────────

function OpdDaysPicker({ opdDays, setOpdDays }: { opdDays: string[]; setOpdDays: (d: string[]) => void }) {
  function toggle(day: string) {
    setOpdDays(opdDays.includes(day) ? opdDays.filter(d => d !== day) : [...opdDays, day])
  }
  return (
    <Field label="OPD Days" hint="Days the doctor holds OPD.">
      <div className="flex flex-wrap gap-2 mt-0.5">
        {DAYS.map(day => (
          <button key={day} type="button" onClick={() => toggle(day)}
            className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
              opdDays.includes(day) ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:border-primary/50 hover:text-primary')}>
            {day.slice(0, 3)}
          </button>
        ))}
      </div>
      {opdDays.length > 0 && <p className="text-xs text-gray-400 mt-1.5">{opdDays.join(', ')}</p>}
    </Field>
  )
}

// ─── Add Doctor Modal (4-step wizard) ────────────────────────────────────────

interface AddDoctorModalProps { onClose: () => void; onSuccess: () => void }

function AddDoctorModal({ onClose, onSuccess }: AddDoctorModalProps) {
  const [step, setStep]         = useState(1)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [showPass, setShowPass] = useState(false)

  const [s1, setS1] = useState({ name: '', email: '', password: '', phone: '' })
  const [s2, setS2] = useState({ photoURL: '', designation: 'Consultant Cardiologist', specialisation: 'Interventional Cardiology', bio: '' })
  const [degrees, setDegrees]   = useState<Degree[]>([{ degree: 'MBBS', institution: '', year: '' }])
  const [s3, setS3]             = useState({ regNumber: '', experience: '' })
  const [s4, setS4]             = useState({ hospital: '', clinicAddress: '', consultHours: '10:00 AM – 1:00 PM' })
  const [opdDays, setOpdDays]   = useState<string[]>(['Monday', 'Wednesday', 'Friday'])

  function validate(): string {
    if (step === 1) {
      if (!s1.name.trim())  return 'Full name is required.'
      if (!s1.email.trim()) return 'Email is required.'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s1.email)) return 'Enter a valid email address.'
      if (!s1.password)     return 'Password is required.'
      if (s1.password.length < 8) return 'Password must be at least 8 characters.'
    }
    if (step === 2 && !s2.designation.trim()) return 'Designation is required.'
    if (step === 3) { for (const d of degrees) if (!d.degree.trim()) return 'Each degree entry needs a name.' }
    if (step === 4 && !s4.hospital.trim()) return 'Hospital / clinic name is required.'
    return ''
  }

  function next() { const err = validate(); if (err) { setError(err); return }; setError(''); if (step < 4) setStep(s => s + 1); else handleCreate() }
  function back() { setError(''); setStep(s => s - 1) }

  async function handleCreate() {
    setLoading(true); setError('')
    let secondaryApp: any = null
    try {
      const secondary = getSecondaryAuth()
      secondaryApp    = secondary.app
      const cred      = await createUser(secondary.auth, s1.email.trim(), s1.password)
      const newUid    = cred.user.uid
      await setDoc(doc(db, 'users', newUid), {
        uid: newUid, email: s1.email.trim().toLowerCase(), name: s1.name.trim(),
        role: 'doctor', phone: s1.phone.trim(), photoURL: s2.photoURL,
        designation: s2.designation.trim(), specialisation: s2.specialisation.trim(),
        bio: s2.bio.trim(), degrees: degrees.filter(d => d.degree.trim()),
        regNumber: s3.regNumber.trim(), experience: s3.experience.trim(),
        hospital: s4.hospital.trim(), clinicAddress: s4.clinicAddress.trim(),
        opdDays, consultHours: s4.consultHours.trim(),
        active: true, createdAt: serverTimestamp(), lastLogin: null,
      })
      await deleteApp(secondaryApp)
      toast.success(`Dr. ${s1.name} added successfully!`)
      onSuccess(); onClose()
    } catch (err: any) {
      if (secondaryApp) { try { await deleteApp(secondaryApp) } catch {} }
      const msg =
        err.code === 'auth/email-already-in-use' ? 'This email is already registered.' :
        err.code === 'auth/invalid-email'         ? 'Invalid email address.' :
        err.code === 'auth/weak-password'         ? 'Password is too weak.' :
        err.message ?? 'Failed to create account.'
      setError(msg)
    } finally { setLoading(false) }
  }

  const stepMeta = ADD_STEPS[step - 1]
  const StepIcon = stepMeta.icon

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-3 sm:p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <StepIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-base">Add Doctor Account</h2>
              <p className="text-xs text-gray-400">{stepMeta.desc} · Step {step} of 4</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 pt-5 shrink-0">
          <StepIndicator current={step} steps={ADD_STEPS} />
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-4">
          {/* Step 1 — Account */}
          {step === 1 && <>
            <Field label="Full Name *">
              <IconInput icon={User} placeholder="Dr. Arjun Sharma" value={s1.name} onChange={e => setS1(f => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Email Address *" hint="This will be the doctor's login email for the app.">
              <IconInput icon={Mail} type="email" placeholder="doctor@upbeatheart.com" value={s1.email} onChange={e => setS1(f => ({ ...f, email: e.target.value }))} />
            </Field>
            <Field label="Initial Password *" hint="Share with the doctor. They can change it after first login.">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type={showPass ? 'text' : 'password'} className={`${inputCls} pl-9 pr-10`} placeholder="Min. 8 characters"
                  value={s1.password} onChange={e => setS1(f => ({ ...f, password: e.target.value }))} />
                <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>
            <Field label="Phone Number" hint="Optional — for internal records only.">
              <IconInput icon={Phone} placeholder="+91 9876543210" value={s1.phone} onChange={e => setS1(f => ({ ...f, phone: e.target.value }))} />
            </Field>
            <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
              <p className="text-xs text-blue-700 leading-relaxed">
                <strong>How it works:</strong> A Firebase Auth account is created via a temporary secondary app instance so you stay logged in. A Firestore <code className="bg-blue-100 px-1 rounded">users/&#123;uid&#125;</code> doc with <code className="bg-blue-100 px-1 rounded">role: "doctor"</code> grants app access.
              </p>
            </div>
          </>}

          {/* Step 2 — Profile */}
          {step === 2 && <>
            <ImageCropUpload
              preset="upbeat_public"
              label="Doctor Photo"
              hint="Professional headshot shown in team cards, hero section, and About page"
              targetW={600}
              targetH={800}
              aspectLabel="3:4"
              websiteUsage="Doctor Intro hero (3:4 portrait) · About page · Team card (w-12 h-12 rounded-2xl)"
              value={s2.photoURL}
              onChange={url => setS2(f => ({ ...f, photoURL: url }))}
              onRemove={() => setS2(f => ({ ...f, photoURL: '' }))}
            />
            <Field label="Designation *" hint='e.g. "Consultant Cardiologist"'>
              <IconInput icon={Stethoscope} value={s2.designation} onChange={e => setS2(f => ({ ...f, designation: e.target.value }))} />
            </Field>
            <Field label="Specialisation">
              <input className={inputCls} placeholder="Interventional Cardiology" value={s2.specialisation} onChange={e => setS2(f => ({ ...f, specialisation: e.target.value }))} />
            </Field>
            <Field label="Short Bio" hint="1–2 sentences (optional).">
              <textarea rows={3} className={`${inputCls} resize-none`} value={s2.bio} onChange={e => setS2(f => ({ ...f, bio: e.target.value }))} />
            </Field>
          </>}

          {/* Step 3 — Credentials */}
          {step === 3 && <>
            <DegreesEditor degrees={degrees} setDegrees={setDegrees} />
            <Field label="Medical Registration Number" hint="State Medical Council registration (optional).">
              <IconInput icon={BadgeCheck} placeholder="e.g. AP-2005-12345" value={s3.regNumber} onChange={e => setS3(f => ({ ...f, regNumber: e.target.value }))} />
            </Field>
            <Field label="Years of Experience">
              <IconInput icon={FileText} placeholder="15+ years" value={s3.experience} onChange={e => setS3(f => ({ ...f, experience: e.target.value }))} />
            </Field>
          </>}

          {/* Step 4 — Availability */}
          {step === 4 && <>
            <Field label="Hospital / Clinic Name *">
              <IconInput icon={Building2} placeholder="CARE Hospitals, Hyderabad" value={s4.hospital} onChange={e => setS4(f => ({ ...f, hospital: e.target.value }))} />
            </Field>
            <Field label="Clinic / OPD Address" hint="Full address shown on the website (optional).">
              <div className="relative">
                <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                <textarea rows={2} className={`${inputCls} pl-9 resize-none`} value={s4.clinicAddress} onChange={e => setS4(f => ({ ...f, clinicAddress: e.target.value }))} />
              </div>
            </Field>
            <Field label="Consultation Hours">
              <IconInput icon={Clock} placeholder="10:00 AM – 1:00 PM" value={s4.consultHours} onChange={e => setS4(f => ({ ...f, consultHours: e.target.value }))} />
            </Field>
            <OpdDaysPicker opdDays={opdDays} setOpdDays={setOpdDays} />
            {/* Summary */}
            <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 space-y-2">
              <p className="text-xs font-bold text-primary uppercase tracking-wide">Review before saving</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                <span className="text-gray-400">Name</span>        <span className="font-medium truncate">{s1.name || '—'}</span>
                <span className="text-gray-400">Email</span>       <span className="font-medium truncate">{s1.email || '—'}</span>
                <span className="text-gray-400">Designation</span> <span className="font-medium truncate">{s2.designation || '—'}</span>
                <span className="text-gray-400">Degrees</span>     <span className="font-medium">{degrees.filter(d => d.degree).map(d => d.degree).join(', ') || '—'}</span>
                <span className="text-gray-400">Hospital</span>    <span className="font-medium truncate">{s4.hospital || '—'}</span>
                <span className="text-gray-400">Photo</span>       <span className="font-medium">{s2.photoURL ? '✓ Uploaded' : 'Not uploaded'}</span>
              </div>
            </div>
          </>}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl border border-red-100">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          {step > 1
            ? <button onClick={back} className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"><ChevronLeft className="w-4 h-4" /> Back</button>
            : <button onClick={onClose} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition">Cancel</button>
          }
          <button onClick={next} disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary-dark transition disabled:opacity-60">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
              : step < 4 ? <>Next <ChevronRight className="w-4 h-4" /></>
              : <><UserPlus className="w-4 h-4" /> Create Doctor Account</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit Doctor Modal (3-step, no email/password) ────────────────────────────

interface EditDoctorModalProps { member: TeamMember; onClose: () => void; onSuccess: () => void }

function EditDoctorModal({ member, onClose, onSuccess }: EditDoctorModalProps) {
  const [step, setStep]       = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  // Step 1 — Profile
  const [name, setName]           = useState(member.name ?? '')
  const [phone, setPhone]         = useState(member.phone ?? '')
  const [photoURL, setPhotoURL]   = useState(member.photoURL ?? '')
  const [designation, setDesignation]   = useState(member.designation ?? '')
  const [specialisation, setSpecialisation] = useState(member.specialisation ?? '')
  const [bio, setBio]             = useState(member.bio ?? '')

  // Step 2 — Credentials
  const [degrees, setDegrees]   = useState<Degree[]>(
    member.degrees?.length ? member.degrees : [{ degree: '', institution: '', year: '' }]
  )
  const [regNumber, setRegNumber]   = useState(member.regNumber ?? '')
  const [experience, setExperience] = useState(member.experience ?? '')

  // Step 3 — Availability
  const [hospital, setHospital]         = useState(member.hospital ?? '')
  const [clinicAddress, setClinicAddress] = useState(member.clinicAddress ?? '')
  const [consultHours, setConsultHours] = useState(member.consultHours ?? '')
  const [opdDays, setOpdDays]           = useState<string[]>(member.opdDays ?? [])

  function validate(): string {
    if (step === 1) {
      if (!name.trim()) return 'Full name is required.'
      if (!designation.trim()) return 'Designation is required.'
    }
    if (step === 2) {
      for (const d of degrees) if (!d.degree.trim()) return 'Each degree entry needs a name.'
    }
    if (step === 3) {
      if (!hospital.trim()) return 'Hospital / clinic name is required.'
    }
    return ''
  }

  function next() { const err = validate(); if (err) { setError(err); return }; setError(''); if (step < 3) setStep(s => s + 1); else handleSave() }
  function back() { setError(''); setStep(s => s - 1) }

  async function handleSave() {
    setLoading(true); setError('')
    try {
      await updateDoc(doc(db, 'users', member.uid), {
        name: name.trim(), phone: phone.trim(), photoURL,
        designation: designation.trim(), specialisation: specialisation.trim(),
        bio: bio.trim(), degrees: degrees.filter(d => d.degree.trim()),
        regNumber: regNumber.trim(), experience: experience.trim(),
        hospital: hospital.trim(), clinicAddress: clinicAddress.trim(),
        consultHours: consultHours.trim(), opdDays,
        updatedAt: serverTimestamp(),
      })
      toast.success(`Dr. ${name} updated successfully!`)
      onSuccess(); onClose()
    } catch (err: any) {
      setError(err.message ?? 'Failed to save changes.')
    } finally { setLoading(false) }
  }

  const stepMeta = STEPS[step - 1]
  const StepIcon = stepMeta.icon

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-3 sm:p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
              <StepIcon className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-base">Edit Doctor Profile</h2>
              <p className="text-xs text-gray-400">{member.email} · Step {step} of 3</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>

        {/* Step indicator */}
        <div className="px-5 pt-5 shrink-0">
          <StepIndicator current={step} steps={STEPS} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-4">

          {/* Step 1 — Profile */}
          {step === 1 && <>
            <ImageCropUpload
              preset="upbeat_public"
              label="Doctor Photo"
              hint="Professional headshot shown in team cards, hero section, and About page"
              targetW={600}
              targetH={800}
              aspectLabel="3:4"
              websiteUsage="Doctor Intro hero (3:4 portrait) · About page · Team card (w-12 h-12 rounded-2xl)"
              value={photoURL}
              onChange={setPhotoURL}
              onRemove={() => setPhotoURL('')}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Full Name *">
                <IconInput icon={User} placeholder="Dr. Arjun Sharma" value={name} onChange={e => setName(e.target.value)} />
              </Field>
              <Field label="Phone">
                <IconInput icon={Phone} placeholder="+91 9876543210" value={phone} onChange={e => setPhone(e.target.value)} />
              </Field>
            </div>
            <Field label="Designation *">
              <IconInput icon={Stethoscope} value={designation} onChange={e => setDesignation(e.target.value)} />
            </Field>
            <Field label="Specialisation">
              <input className={inputCls} placeholder="Interventional Cardiology" value={specialisation} onChange={e => setSpecialisation(e.target.value)} />
            </Field>
            <Field label="Short Bio" hint="1–2 sentences (optional).">
              <textarea rows={3} className={`${inputCls} resize-none`} value={bio} onChange={e => setBio(e.target.value)} />
            </Field>
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
              <p className="text-xs text-amber-700">
                <strong>Note:</strong> Email and password cannot be edited here. Use <em>Reset Password</em> to send a password-reset link.
              </p>
            </div>
          </>}

          {/* Step 2 — Credentials */}
          {step === 2 && <>
            <DegreesEditor degrees={degrees} setDegrees={setDegrees} />
            <Field label="Medical Registration Number">
              <IconInput icon={BadgeCheck} placeholder="e.g. AP-2005-12345" value={regNumber} onChange={e => setRegNumber(e.target.value)} />
            </Field>
            <Field label="Years of Experience">
              <IconInput icon={FileText} placeholder="15+ years" value={experience} onChange={e => setExperience(e.target.value)} />
            </Field>
          </>}

          {/* Step 3 — Availability */}
          {step === 3 && <>
            <Field label="Hospital / Clinic Name *">
              <IconInput icon={Building2} placeholder="CARE Hospitals, Hyderabad" value={hospital} onChange={e => setHospital(e.target.value)} />
            </Field>
            <Field label="Clinic / OPD Address">
              <div className="relative">
                <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                <textarea rows={2} className={`${inputCls} pl-9 resize-none`} value={clinicAddress} onChange={e => setClinicAddress(e.target.value)} />
              </div>
            </Field>
            <Field label="Consultation Hours">
              <IconInput icon={Clock} placeholder="10:00 AM – 1:00 PM" value={consultHours} onChange={e => setConsultHours(e.target.value)} />
            </Field>
            <OpdDaysPicker opdDays={opdDays} setOpdDays={setOpdDays} />
          </>}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl border border-red-100">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          {step > 1
            ? <button onClick={back} className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"><ChevronLeft className="w-4 h-4" /> Back</button>
            : <button onClick={onClose} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition">Cancel</button>
          }
          <button onClick={next} disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-60">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : step < 3 ? <>Next <ChevronRight className="w-4 h-4" /></>
              : <><CheckCircle2 className="w-4 h-4" /> Save Changes</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Reset Password Modal ─────────────────────────────────────────────────────

function ResetPasswordModal({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const [sent, setSent]       = useState(false)
  const [loading, setLoading] = useState(false)

  const handle = async () => {
    setLoading(true)
    try {
      await sendReset(auth, member.email)
      setSent(true); toast.success('Password reset email sent!')
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to send reset email')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center"><KeyRound className="w-5 h-5 text-amber-600" /></div>
          <div><h3 className="font-semibold text-gray-900">Reset Password</h3><p className="text-xs text-gray-400">{member.email}</p></div>
        </div>
        {!sent ? (
          <>
            <p className="text-sm text-gray-600 mb-6">A password reset link will be sent to <strong>{member.email}</strong>.</p>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition">Cancel</button>
              <button onClick={handle} disabled={loading} className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 transition disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Send Reset Email
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-xl border border-green-100 mb-4">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <p className="text-sm text-green-700">Reset email sent to {member.email}</p>
            </div>
            <button onClick={onClose} className="w-full py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-dark transition">Done</button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Member Card ──────────────────────────────────────────────────────────────

function MemberCard({ member, onEdit, onReset, onToggle, onDelete }: {
  member: TeamMember; onEdit: () => void; onReset: () => void; onToggle: () => void; onDelete: () => void
}) {
  const isDoctor = member.role === 'doctor'
  const isActive = member.active !== false

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow flex flex-col">
      {/* Badges */}
      <div className="flex items-start justify-between mb-4">
        <div className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
          isDoctor ? 'bg-primary/10 text-primary' : 'bg-violet-100 text-violet-700')}>
          {isDoctor ? <Stethoscope className="w-3 h-3" /> : <Crown className="w-3 h-3" />}
          {isDoctor ? 'Doctor' : 'Admin'}
        </div>
        <div className="flex items-center gap-2">
          {/* Edit button — doctors only */}
          {isDoctor && (
            <button onClick={onEdit}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition"
              title="Edit profile">
              <Pencil className="w-3 h-3" /> Edit
            </button>
          )}
          <div className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
            isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
            <span className={clsx('w-1.5 h-1.5 rounded-full', isActive ? 'bg-green-500' : 'bg-gray-400')} />
            {isActive ? 'Active' : 'Inactive'}
          </div>
        </div>
      </div>

      {/* Avatar + name */}
      <div className="flex items-center gap-3 mb-3">
        {member.photoURL ? (
          <img src={member.photoURL} alt={member.name} className="w-12 h-12 rounded-2xl object-cover border border-gray-100" />
        ) : (
          <div className={clsx('w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold text-white',
            isDoctor ? 'bg-gradient-to-br from-primary to-primary-dark' : 'bg-gradient-to-br from-violet-500 to-violet-700')}>
            {member.name?.[0]?.toUpperCase() ?? '?'}
          </div>
        )}
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{member.name || '—'}</p>
          {member.designation && <p className="text-xs text-gray-400 truncate">{member.designation}</p>}
        </div>
      </div>

      {/* Details */}
      <div className="space-y-1.5 mb-4 flex-1">
        <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" /><span className="text-xs text-gray-600 truncate">{member.email}</span></div>
        {member.phone     && <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" /><span className="text-xs text-gray-600">{member.phone}</span></div>}
        {member.hospital  && <div className="flex items-center gap-2"><Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" /><span className="text-xs text-gray-600 truncate">{member.hospital}</span></div>}
        {member.degrees && member.degrees.length > 0 && (
          <div className="flex items-center gap-2"><GraduationCap className="w-3.5 h-3.5 text-gray-400 shrink-0" /><span className="text-xs text-gray-600 truncate">{member.degrees.map(d => d.degree).join(', ')}</span></div>
        )}
        {member.opdDays && member.opdDays.length > 0 && (
          <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" /><span className="text-xs text-gray-600 truncate">{member.opdDays.map(d => d.slice(0, 3)).join(', ')}</span></div>
        )}
        {member.specialisation && (
          <div className="flex items-center gap-2"><Stethoscope className="w-3.5 h-3.5 text-gray-400 shrink-0" /><span className="text-xs text-gray-600 truncate">{member.specialisation}</span></div>
        )}
      </div>

      {/* Actions — doctors only */}
      {isDoctor && (
        <div className="flex gap-2 pt-3 border-t border-gray-50">
          <button onClick={onReset}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition">
            <KeyRound className="w-3.5 h-3.5" /> Reset Password
          </button>
          <button onClick={onToggle}
            className={clsx('flex items-center justify-center px-3 py-2 text-xs font-medium rounded-lg transition',
              isActive ? 'text-gray-600 bg-gray-100 hover:bg-gray-200' : 'text-green-600 bg-green-50 hover:bg-green-100')}
            title={isActive ? 'Deactivate' : 'Activate'}>
            {isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
          </button>
          <button onClick={onDelete}
            className="flex items-center justify-center px-3 py-2 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition"
            title="Remove doctor access">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const [members, setMembers]         = useState<TeamMember[]>([])
  const [loading, setLoading]         = useState(true)
  const [showAdd, setShowAdd]         = useState(false)
  const [editTarget, setEditTarget]   = useState<TeamMember | null>(null)
  const [resetTarget, setResetTarget] = useState<TeamMember | null>(null)
  const [filter, setFilter]           = useState<'all' | 'doctor' | 'admin'>('all')

  const fetchMembers = async () => {
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')))
      setMembers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as TeamMember)))
    } catch { toast.error('Failed to load team members') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchMembers() }, [])

  const handleToggle = async (member: TeamMember) => {
    const next = member.active === false
    await updateDoc(doc(db, 'users', member.uid), { active: next })
    toast.success(next ? `${member.name} activated` : `${member.name} deactivated`)
    fetchMembers()
  }

  const handleDelete = async (member: TeamMember) => {
    if (!confirm(`Remove ${member.name}'s doctor access? Their Firebase Auth account remains but they won't be able to log in.`)) return
    await deleteDoc(doc(db, 'users', member.uid))
    toast.success(`${member.name} removed`)
    fetchMembers()
  }

  const filtered    = members.filter(m => filter === 'all' || m.role === filter)
  const doctorCount = members.filter(m => m.role === 'doctor').length
  const adminCount  = members.filter(m => m.role === 'admin').length

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team & Doctor Accounts</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage doctor logins for the UpBeat Heart Doctor App</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary-dark transition shadow-sm">
          <UserPlus className="w-4 h-4" /> Add Doctor
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Members', value: members.length, icon: Users,       color: 'text-gray-600',   bg: 'bg-gray-100'   },
          { label: 'Doctors',       value: doctorCount,    icon: Stethoscope, color: 'text-primary',    bg: 'bg-primary/10' },
          { label: 'Admins',        value: adminCount,     icon: Shield,      color: 'text-violet-600', bg: 'bg-violet-100' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
        {(['all', 'doctor', 'admin'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={clsx('px-4 py-1.5 rounded-full text-sm font-medium capitalize transition',
              filter === f ? 'bg-primary text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50')}>
            {f === 'all' ? 'All Members' : f === 'doctor' ? 'Doctors' : 'Admins'}
          </button>
        ))}
        <button onClick={fetchMembers} className="ml-auto p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Members grid */}
      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <Users className="w-12 h-12 text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium">No {filter !== 'all' ? filter : ''} members found</p>
          {filter === 'doctor' && <button onClick={() => setShowAdd(true)} className="mt-3 text-sm text-primary font-medium hover:underline">+ Add your first doctor</button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(m => (
            <MemberCard key={m.uid} member={m}
              onEdit={() => setEditTarget(m)}
              onReset={() => setResetTarget(m)}
              onToggle={() => handleToggle(m)}
              onDelete={() => handleDelete(m)}
            />
          ))}
        </div>
      )}

      {showAdd    && <AddDoctorModal   onClose={() => setShowAdd(false)}    onSuccess={fetchMembers} />}
      {editTarget && <EditDoctorModal  member={editTarget} onClose={() => setEditTarget(null)}  onSuccess={fetchMembers} />}
      {resetTarget && <ResetPasswordModal member={resetTarget} onClose={() => setResetTarget(null)} />}
    </div>
  )
}
