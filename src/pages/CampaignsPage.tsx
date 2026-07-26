import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  collection, getDocs, orderBy, query, where,
  doc, updateDoc, addDoc, serverTimestamp,
  onSnapshot,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Campaign, CampaignStatus } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { Plus, X, Eye, Pencil, CheckCircle, XCircle, FileText, Image, Video, Link, HandCoins, Phone, Mail, CreditCard, Clock, IndianRupee } from 'lucide-react'

/* ── status badge colours ─────────────────────────── */
const statusColors: Record<CampaignStatus, string> = {
  draft:            'bg-gray-50 text-gray-600 border-gray-200',
  pending_approval: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  published:        'bg-blue-50 text-blue-700 border-blue-200',
  active:           'bg-green-50 text-green-700 border-green-200',
  paused:           'bg-orange-50 text-orange-700 border-orange-200',
  completed:        'bg-teal-50 text-teal-700 border-teal-200',
  closed:           'bg-red-50 text-red-700 border-red-200',
}

/* ── helpers ──────────────────────────────────────── */
function fmtDate(raw: unknown) {
  if (!raw) return '—'
  try {
    let date: Date
    if (raw && typeof raw === 'object' && 'seconds' in raw) {
      date = new Date((raw as { seconds: number }).seconds * 1000)
    } else if (raw instanceof Date) {
      date = raw
    } else if (typeof raw === 'number') {
      date = new Date(raw)
    } else {
      date = new Date(raw as string)
    }
    if (isNaN(date.getTime())) return '—'
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return '—' }
}

function fmtCurrency(n: number | undefined) {
  return n != null ? `₹${n.toLocaleString('en-IN')}` : '—'
}

function progressPct(raised: number, target: number) {
  if (!target) return 0
  return Math.min(100, Math.round((raised / target) * 100))
}

/** Generate a URL-safe slug from a string */
function slugify(str: string) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

/* ── small helper sub-components ──────────────────── */
function InfoBlock({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      {children ?? <p className="text-sm text-gray-800 font-medium">{value || '—'}</p>}
    </div>
  )
}

function MediaBadge({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className={clsx(
      'flex items-center gap-2 px-3 py-2 rounded-xl text-sm border',
      count > 0 ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 bg-gray-50 text-gray-400'
    )}>
      {icon}
      <span>{label}</span>
      <span className="font-bold">{count}</span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputCls = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
const selectCls = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"

/* ══ Donation Records Panel ═══════════════════════════════════════════════ */
interface DonorRecord {
  id: string
  donorName: string
  donorPhone: string
  donorEmail: string
  amount: number
  anonymous: boolean
  status: string
  razorpayPaymentId: string
  razorpayOrderId: string
  createdAt: any
}

function CampaignDonationsPanel({ campaignId }: { campaignId: string }) {
  const [donations, setDonations] = useState<DonorRecord[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setDonations([])

    // Primary query: campaignId filter + createdAt desc (requires composite index)
    const qPrimary = query(
      collection(db, 'donations'),
      where('campaignId', '==', campaignId),
      orderBy('createdAt', 'desc'),
    )

    const unsub = onSnapshot(
      qPrimary,
      snap => {
        setDonations(snap.docs.map(d => ({ id: d.id, ...d.data() } as DonorRecord)))
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.warn('CampaignDonationsPanel primary query failed:', err.message)
        // Fallback: query without orderBy (no index required) then sort client-side
        const qFallback = query(
          collection(db, 'donations'),
          where('campaignId', '==', campaignId),
        )
        const unsubFallback = onSnapshot(
          qFallback,
          snap => {
            const rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as DonorRecord))
            rows.sort((a, b) => {
              const ta = a.createdAt?.seconds ?? 0
              const tb = b.createdAt?.seconds ?? 0
              return tb - ta
            })
            setDonations(rows)
            setLoading(false)
            setError(null)
          },
          (fallbackErr) => {
            console.error('CampaignDonationsPanel fallback failed:', fallbackErr.message)
            setError('Could not load donations: ' + fallbackErr.message)
            setLoading(false)
          }
        )
        // Replace cleanup with fallback unsub
        // (primary listener already errored, no need to call unsub())
        return unsubFallback
      }
    )
    return unsub
  }, [campaignId])

  const total = useMemo(() => donations.reduce((s, d) => s + (d.amount ?? 0), 0), [donations])

  function fmtTs(raw: any) {
    if (!raw) return '—'
    try {
      const d = raw?.seconds ? new Date(raw.seconds * 1000) : new Date(raw)
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch { return '—' }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error) return (
    <div className="flex flex-col items-center justify-center py-14 gap-3 text-center px-4">
      <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
        <XCircle className="w-5 h-5 text-red-400" />
      </div>
      <p className="text-sm font-semibold text-gray-700">Failed to load donations</p>
      <p className="text-xs text-gray-400 font-mono break-all max-w-xs">{error}</p>
      <p className="text-xs text-gray-400">Check that the Firestore index for <span className="font-mono">donations(campaignId, createdAt)</span> is deployed.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
          <p className="text-xs text-green-600 font-semibold uppercase tracking-wide mb-0.5">Total Raised</p>
          <p className="text-lg font-extrabold text-green-700">₹{total.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
          <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide mb-0.5">Donors</p>
          <p className="text-lg font-extrabold text-blue-700">{donations.length}</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
          <p className="text-xs text-purple-600 font-semibold uppercase tracking-wide mb-0.5">Avg. Donation</p>
          <p className="text-lg font-extrabold text-purple-700">
            {donations.length ? `₹${Math.round(total / donations.length).toLocaleString('en-IN')}` : '—'}
          </p>
        </div>
      </div>

      {donations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 gap-3 text-gray-300">
          <HandCoins className="w-10 h-10" />
          <p className="text-sm text-gray-400">No donations yet for this campaign</p>
        </div>
      ) : (
        <div className="space-y-2">
          {donations.map(d => (
            <div key={d.id} className="bg-gray-50 border border-gray-100 rounded-xl p-4 hover:border-primary/20 transition">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                {/* Donor info */}
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                    d.anonymous ? 'bg-gray-200 text-gray-500' : 'bg-primary/10 text-primary'
                  }`}>
                    {d.anonymous ? '?' : (d.donorName?.charAt(0) ?? 'D').toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">
                      {d.anonymous ? 'Anonymous Donor' : (d.donorName || 'Unknown')}
                    </p>
                    {!d.anonymous && d.donorPhone && (
                      <a href={`tel:${d.donorPhone}`}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary transition">
                        <Phone className="w-3 h-3" /> {d.donorPhone}
                      </a>
                    )}
                    {!d.anonymous && d.donorEmail && (
                      <a href={`mailto:${d.donorEmail}`}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary transition">
                        <Mail className="w-3 h-3" /> {d.donorEmail}
                      </a>
                    )}
                  </div>
                </div>

                {/* Amount */}
                <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-xl px-3 py-1.5">
                  <IndianRupee className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-base font-extrabold text-green-700">{d.amount?.toLocaleString('en-IN')}</span>
                  <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    d.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>{d.status ?? 'paid'}</span>
                </div>
              </div>

              {/* Payment IDs + date */}
              <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                {d.razorpayPaymentId && (
                  <span className="flex items-center gap-1 bg-white border border-gray-200 px-2 py-1 rounded-lg font-mono text-gray-500">
                    <CreditCard className="w-3 h-3 text-blue-400" />
                    {d.razorpayPaymentId}
                  </span>
                )}
                {d.razorpayOrderId && (
                  <span className="flex items-center gap-1 bg-white border border-gray-200 px-2 py-1 rounded-lg font-mono text-gray-500">
                    # {d.razorpayOrderId}
                  </span>
                )}
                <span className="flex items-center gap-1 bg-white border border-gray-200 px-2 py-1 rounded-lg text-gray-400">
                  <Clock className="w-3 h-3" /> {fmtTs(d.createdAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ══ Campaign View Modal ══════════════════════════════════════════════════ */
function CampaignViewModal({
  campaign, onClose, onStatusChange, onEdit,
}: {
  campaign: Campaign
  onClose: () => void
  onStatusChange: (id: string, status: CampaignStatus) => void
  onEdit: (campaign: Campaign) => void
}) {
  const pct = progressPct(campaign.amountRaised ?? 0, campaign.estimatedCost ?? 0)
  const [activeTab, setActiveTab] = useState<'details' | 'donations'>('details')

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={handleBackdrop}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* header */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 truncate">{campaign.patientName}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{campaign.hospital || 'Hospital not specified'}</p>
            {campaign.slug && (
              <p className="text-xs text-primary/70 mt-0.5 flex items-center gap-1">
                <Link className="w-3 h-3" />
                /patient-assistance/{campaign.slug}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={clsx('px-3 py-1 rounded-full text-xs font-semibold border capitalize', statusColors[campaign.status])}>
              {campaign.status.replace('_', ' ')}
            </span>
            <button
              onClick={() => { onClose(); onEdit(campaign) }}
              className="flex items-center gap-1.5 text-xs border border-gray-200 text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 transition"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-100 px-6 gap-1">
          {([
            { id: 'details',   label: 'Campaign Details', icon: FileText },
            { id: 'donations', label: 'Donations',         icon: HandCoins },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-3 text-sm font-semibold border-b-2 transition-colors -mb-px',
                activeTab === id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-400 hover:text-gray-700'
              )}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {/* scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

        {activeTab === 'donations' ? (
          <CampaignDonationsPanel campaignId={campaign.id} />
        ) : (<>

          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2 text-sm">
              <span className="text-gray-500">Fundraising Progress</span>
              <span className="font-semibold text-gray-700">{pct}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-3">
              <div className="bg-green-500 h-2.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between text-sm">
              <div>
                <p className="text-xs text-gray-400">Raised</p>
                <p className="font-bold text-green-600 text-base">{fmtCurrency(campaign.amountRaised)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">Target</p>
                <p className="font-bold text-gray-700 text-base">{fmtCurrency(campaign.estimatedCost)}</p>
              </div>
            </div>
          </div>

          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Medical Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InfoBlock label="Diagnosis" value={campaign.diagnosis} />
              <InfoBlock label="Treatment Required" value={campaign.treatmentRequired} />
              <InfoBlock label="Hospital" value={campaign.hospital} />
              <InfoBlock label="Category" value={campaign.category || '—'} />
              <InfoBlock label="Doctor Verified">
                {campaign.doctorVerified
                  ? <span className="flex items-center gap-1 text-green-600 text-sm font-medium"><CheckCircle className="w-4 h-4" /> Verified</span>
                  : <span className="flex items-center gap-1 text-orange-500 text-sm font-medium"><XCircle className="w-4 h-4" /> Pending</span>
                }
              </InfoBlock>
              <InfoBlock label="Consent Signed">
                {campaign.consentSigned
                  ? <span className="flex items-center gap-1 text-green-600 text-sm font-medium"><CheckCircle className="w-4 h-4" /> Yes</span>
                  : <span className="flex items-center gap-1 text-red-500 text-sm font-medium"><XCircle className="w-4 h-4" /> No</span>
                }
              </InfoBlock>
            </div>
          </section>

          {campaign.patientStory && (
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Patient Story</h3>
              <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-xl p-4 whitespace-pre-line">
                {campaign.patientStory}
              </p>
            </section>
          )}

          {campaign.photos && campaign.photos.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Photos ({campaign.photos.length})
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {campaign.photos.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                    className="relative group aspect-square rounded-xl overflow-hidden border border-gray-100 bg-gray-50 hover:border-primary/40 transition">
                    <img src={url} alt={`Photo ${i + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center">
                      <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition drop-shadow" />
                    </div>
                  </a>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Media & Documents</h3>
            <div className="flex flex-wrap gap-3">
              <MediaBadge icon={<Image className="w-4 h-4" />} label="Photos" count={campaign.photos?.length ?? 0} />
              <MediaBadge icon={<Video className="w-4 h-4" />} label="Videos" count={campaign.videos?.length ?? 0} />
              <MediaBadge icon={<FileText className="w-4 h-4" />} label="Medical Docs" count={campaign.medicalDocs?.length ?? 0} />
            </div>
          </section>

          {campaign.updates && campaign.updates.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Campaign Updates</h3>
              <div className="space-y-2">
                {campaign.updates.map((u, i) => (
                  <div key={i} className="bg-blue-50 rounded-xl p-3 text-sm">
                    <p className="text-blue-800">{u.text}</p>
                    <p className="text-blue-400 text-xs mt-1">{fmtDate(u.date)}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Timeline</h3>
            <div className="grid grid-cols-2 gap-3">
              <InfoBlock label="Created On" value={fmtDate(campaign.createdAt)} />
              <InfoBlock label="Last Updated" value={fmtDate(campaign.updatedAt)} />
            </div>
          </section>
        </>)}
        </div>

        {/* footer: status change */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/60 rounded-b-2xl flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide sm:whitespace-nowrap">Change Status</label>
          <select
            value={campaign.status}
            onChange={e => { onStatusChange(campaign.id, e.target.value as CampaignStatus); onClose() }}
            className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="draft">Draft</option>
            <option value="pending_approval">Send for Approval</option>
            <option value="published">Publish</option>
            <option value="active">Active</option>
            <option value="paused">Pause</option>
            <option value="completed">Complete</option>
            <option value="closed">Close</option>
          </select>
          <button onClick={onClose}
            className="sm:w-auto w-full text-sm border border-gray-200 text-gray-600 px-5 py-2 rounded-xl hover:bg-gray-100 transition">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══ Campaign Edit Modal ══════════════════════════════════════════════════ */
type EditForm = {
  patientName: string
  hospital: string
  diagnosis: string
  treatmentRequired: string
  estimatedCost: string
  amountRaised: string
  patientStory: string
  category: string
  tags: string           // comma-separated
  slug: string
  status: CampaignStatus
  doctorVerified: boolean
  consentSigned: boolean
}

function CampaignEditModal({
  campaign,
  onClose,
  onSaved,
}: {
  campaign: Campaign
  onClose: () => void
  onSaved: (updated: Campaign) => void
}) {
  const [form, setForm] = useState<EditForm>({
    patientName:      campaign.patientName ?? '',
    hospital:         campaign.hospital ?? '',
    diagnosis:        campaign.diagnosis ?? '',
    treatmentRequired: campaign.treatmentRequired ?? '',
    estimatedCost:    String(campaign.estimatedCost ?? ''),
    amountRaised:     String(campaign.amountRaised ?? ''),
    patientStory:     campaign.patientStory ?? '',
    category:         campaign.category ?? '',
    tags:             (campaign.tags ?? []).join(', '),
    slug:             campaign.slug ?? '',
    status:           campaign.status,
    doctorVerified:   campaign.doctorVerified ?? false,
    consentSigned:    campaign.consentSigned ?? false,
  })
  const [saving, setSaving] = useState(false)
  const [slugManual, setSlugManual] = useState(!!campaign.slug)

  const set = useCallback(<K extends keyof EditForm>(key: K, val: EditForm[K]) =>
    setForm(p => ({ ...p, [key]: val })), [])

  // Auto-generate slug from patient name unless admin manually edited it
  useEffect(() => {
    if (!slugManual && form.patientName) {
      set('slug', slugify(form.patientName + '-' + form.diagnosis))
    }
  }, [form.patientName, form.diagnosis, slugManual, set])

  async function handleSave() {
    if (!form.patientName.trim() || !form.diagnosis.trim()) {
      toast.error('Patient name and diagnosis are required')
      return
    }
    if (!form.slug.trim()) {
      toast.error('Slug is required for SEO-friendly URL')
      return
    }
    setSaving(true)
    const payload = {
      patientName:      form.patientName.trim(),
      hospital:         form.hospital.trim(),
      diagnosis:        form.diagnosis.trim(),
      treatmentRequired: form.treatmentRequired.trim(),
      estimatedCost:    Number(form.estimatedCost) || 0,
      amountRaised:     Number(form.amountRaised) || 0,
      patientStory:     form.patientStory.trim(),
      category:         form.category.trim(),
      tags:             form.tags.split(',').map(t => t.trim()).filter(Boolean),
      slug:             slugify(form.slug),
      status:           form.status,
      doctorVerified:   form.doctorVerified,
      consentSigned:    form.consentSigned,
      updatedAt:        serverTimestamp(),
    }
    await updateDoc(doc(db, 'campaigns', campaign.id), payload)
    const updated: Campaign = {
      ...campaign,
      ...payload,
      slug:      slugify(form.slug),
      updatedAt: new Date().toISOString(),
    }
    onSaved(updated)
    setSaving(false)
    toast.success('Campaign updated successfully')
    onClose()
  }

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={handleBackdrop}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Edit Campaign</h2>
            <p className="text-sm text-gray-400 mt-0.5">ID: {campaign.id}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* ── SEO Slug ── */}
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-primary uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Link className="w-3.5 h-3.5" /> SEO-Friendly URL (Slug)
            </h3>
            <Field label="URL Slug *">
              <input
                value={form.slug}
                onChange={e => { setSlugManual(true); set('slug', e.target.value) }}
                className={inputCls}
                placeholder="e.g. help-raju-heart-surgery"
              />
            </Field>
            <p className="text-xs text-gray-400 mt-1.5">
              Public URL: <span className="text-primary font-medium">/patient-assistance/{slugify(form.slug) || 'your-slug-here'}</span>
            </p>
            <button
              type="button"
              onClick={() => { setSlugManual(false); set('slug', slugify(form.patientName + '-' + form.diagnosis)) }}
              className="text-xs text-primary underline mt-1"
            >
              Auto-generate from name + diagnosis
            </button>
          </div>

          {/* ── Basic Info ── */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Basic Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Patient Display Name *">
                <input value={form.patientName} onChange={e => set('patientName', e.target.value)} className={inputCls} placeholder="e.g. Raju S." />
              </Field>
              <Field label="Hospital">
                <input value={form.hospital} onChange={e => set('hospital', e.target.value)} className={inputCls} placeholder="e.g. CARE Hospitals" />
              </Field>
              <Field label="Diagnosis *">
                <input value={form.diagnosis} onChange={e => set('diagnosis', e.target.value)} className={inputCls} placeholder="e.g. Severe Aortic Stenosis" />
              </Field>
              <Field label="Treatment Required">
                <input value={form.treatmentRequired} onChange={e => set('treatmentRequired', e.target.value)} className={inputCls} placeholder="e.g. Valve Replacement Surgery" />
              </Field>
              <Field label="Category">
                <select value={form.category} onChange={e => set('category', e.target.value)} className={selectCls}>
                  <option value="">Select category</option>
                  <option value="surgery">Surgery</option>
                  <option value="medication">Medication</option>
                  <option value="device">Device / Implant</option>
                  <option value="rehabilitation">Rehabilitation</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Tags (comma-separated)">
                <input value={form.tags} onChange={e => set('tags', e.target.value)} className={inputCls} placeholder="e.g. heart, child, urgent" />
              </Field>
            </div>
          </div>

          {/* ── Financials ── */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Financials</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Estimated Cost (₹)">
                <input type="number" value={form.estimatedCost} onChange={e => set('estimatedCost', e.target.value)} className={inputCls} placeholder="500000" />
              </Field>
              <Field label="Amount Raised (₹)">
                <input type="number" value={form.amountRaised} onChange={e => set('amountRaised', e.target.value)} className={inputCls} placeholder="0" />
              </Field>
            </div>
          </div>

          {/* ── Patient Story ── */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Patient Story</h3>
            <textarea
              value={form.patientStory}
              onChange={e => set('patientStory', e.target.value)}
              rows={5}
              className={inputCls + ' resize-none'}
              placeholder="Write a compelling story that explains the patient's situation..."
            />
          </div>

          {/* ── Status & Verification ── */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Status & Verification</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Campaign Status">
                <select value={form.status} onChange={e => set('status', e.target.value as CampaignStatus)} className={selectCls}>
                  <option value="draft">Draft</option>
                  <option value="pending_approval">Pending Approval</option>
                  <option value="published">Published</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                  <option value="closed">Closed</option>
                </select>
              </Field>
              <div className="flex flex-col gap-3 justify-center">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.doctorVerified}
                    onChange={e => set('doctorVerified', e.target.checked)}
                    className="w-4 h-4 rounded accent-primary"
                  />
                  <span className="text-sm text-gray-700 font-medium">Doctor Verified</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.consentSigned}
                    onChange={e => set('consentSigned', e.target.checked)}
                    className="w-4 h-4 rounded accent-primary"
                  />
                  <span className="text-sm text-gray-700 font-medium">Consent Signed</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/60 rounded-b-2xl flex items-center justify-end gap-3">
          <button onClick={onClose}
            className="text-sm border border-gray-200 text-gray-600 px-5 py-2 rounded-xl hover:bg-gray-100 transition">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="text-sm bg-primary text-white px-6 py-2 rounded-xl hover:bg-primary/90 transition disabled:opacity-60 font-medium">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══ Main Page ════════════════════════════════════════════════════════════ */
export default function CampaignsPage() {
  const { user } = useAuth()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [viewCampaign, setViewCampaign] = useState<Campaign | null>(null)
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null)
  const [form, setForm] = useState({
    patientName: '', diagnosis: '', treatmentRequired: '',
    estimatedCost: '', patientStory: '', hospital: '', category: '',
    slug: '',
  })
  const [slugManualCreate, setSlugManualCreate] = useState(false)

  useEffect(() => {
    async function fetchCampaigns() {
      const q = query(collection(db, 'campaigns'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() } as Campaign)))
      setLoading(false)
    }
    fetchCampaigns()
  }, [])

  // Auto-slug on create form
  useEffect(() => {
    if (!slugManualCreate) {
      setForm(p => ({ ...p, slug: slugify(p.patientName + '-' + p.diagnosis) }))
    }
  }, [form.patientName, form.diagnosis, slugManualCreate])

  const handleCreate = async () => {
    if (!form.patientName.trim() || !form.diagnosis.trim())
      return toast.error('Patient name and diagnosis required')
    setSaving(true)
    const data = {
      ...form,
      estimatedCost: Number(form.estimatedCost) || 0,
      amountRaised: 0,
      slug: slugify(form.slug || form.patientName + '-' + form.diagnosis),
      photos: [], videos: [], medicalDocs: [],
      consentSigned: false,
      status: 'draft' as CampaignStatus,
      doctorVerified: false,
      createdBy: user?.uid ?? '',
      updates: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    const ref = await addDoc(collection(db, 'campaigns'), data)
    setCampaigns(prev => [
      { id: ref.id, ...data, tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as unknown as Campaign,
      ...prev,
    ])
    setForm({ patientName: '', diagnosis: '', treatmentRequired: '', estimatedCost: '', patientStory: '', hospital: '', category: '', slug: '' })
    setSlugManualCreate(false)
    setShowForm(false)
    setSaving(false)
    toast.success('Campaign draft created — awaiting doctor approval')
  }

  const updateStatus = async (id: string, status: CampaignStatus) => {
    await updateDoc(doc(db, 'campaigns', id), { status, updatedAt: serverTimestamp() })
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status } : c))
    setViewCampaign(prev => prev?.id === id ? { ...prev, status } : prev)
    toast.success(`Status updated to "${status.replace('_', ' ')}"`)
  }

  const handleSaved = (updated: Campaign) => {
    setCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c))
  }

  return (
    <div>
      {/* page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Patient Assistance Campaigns</h1>
          <p className="text-gray-500 text-sm mt-1">Create and manage verified patient campaigns</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90 transition"
        >
          <Plus className="w-4 h-4" /> New Campaign
        </button>
      </div>

      {/* create form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">New Patient Campaign</h2>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input placeholder="Patient display name *" value={form.patientName}
              onChange={e => setForm(p => ({ ...p, patientName: e.target.value }))}
              className={inputCls} />
            <input placeholder="Hospital" value={form.hospital}
              onChange={e => setForm(p => ({ ...p, hospital: e.target.value }))}
              className={inputCls} />
            <input placeholder="Diagnosis *" value={form.diagnosis}
              onChange={e => setForm(p => ({ ...p, diagnosis: e.target.value }))}
              className={inputCls} />
            <input placeholder="Treatment required" value={form.treatmentRequired}
              onChange={e => setForm(p => ({ ...p, treatmentRequired: e.target.value }))}
              className={inputCls} />
            <input placeholder="Estimated cost (₹)" type="number" value={form.estimatedCost}
              onChange={e => setForm(p => ({ ...p, estimatedCost: e.target.value }))}
              className={inputCls} />
            <div>
              <input placeholder="URL slug (auto-generated)" value={form.slug}
                onChange={e => { setSlugManualCreate(true); setForm(p => ({ ...p, slug: e.target.value })) }}
                className={inputCls} />
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                <Link className="w-3 h-3" /> /patient-assistance/{slugify(form.slug) || '…'}
              </p>
            </div>
          </div>
          <textarea placeholder="Patient story (for campaign page)" value={form.patientStory}
            onChange={e => setForm(p => ({ ...p, patientStory: e.target.value }))}
            rows={4} className={inputCls + ' mt-3 resize-none'} />
          <button onClick={handleCreate} disabled={saving}
            className="mt-3 bg-primary text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-primary/90 transition disabled:opacity-60">
            {saving ? 'Saving…' : 'Save as Draft (Send to Doctor)'}
          </button>
        </div>
      )}

      {/* campaigns table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading
          ? <div className="p-12 text-center text-gray-400">Loading…</div>
          : campaigns.length === 0
            ? <div className="p-12 text-center text-gray-400">No campaigns yet.</div>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {['Patient', 'Diagnosis', 'Target', 'Raised', 'Slug', 'Status', 'Actions'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {campaigns.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3 font-medium text-gray-900">{c.patientName}</td>
                        <td className="px-4 py-3 text-gray-600">{c.diagnosis}</td>
                        <td className="px-4 py-3 text-gray-600">{fmtCurrency(c.estimatedCost)}</td>
                        <td className="px-4 py-3 text-green-600 font-medium">{fmtCurrency(c.amountRaised)}</td>
                        <td className="px-4 py-3">
                          {c.slug
                            ? <span className="text-xs text-primary/80 font-mono bg-primary/5 px-2 py-0.5 rounded">{c.slug}</span>
                            : <span className="text-xs text-orange-500 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">No slug</span>
                          }
                        </td>
                        <td className="px-4 py-3">
                          <span className={clsx('px-2.5 py-1 rounded-full text-xs font-medium border capitalize', statusColors[c.status])}>
                            {c.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setViewCampaign(c)}
                              className="flex items-center gap-1.5 text-xs border border-gray-200 text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 transition"
                            >
                              <Eye className="w-3.5 h-3.5" /> View
                            </button>
                            <button
                              onClick={() => setEditCampaign(c)}
                              className="flex items-center gap-1.5 text-xs border border-primary/30 text-primary px-2.5 py-1.5 rounded-lg hover:bg-primary/5 transition"
                            >
                              <Pencil className="w-3.5 h-3.5" /> Edit
                            </button>
                            <select
                              value={c.status}
                              onChange={e => updateStatus(c.id, e.target.value as CampaignStatus)}
                              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none"
                            >
                              <option value="draft">Draft</option>
                              <option value="pending_approval">Send for Approval</option>
                              <option value="published">Publish</option>
                              <option value="active">Active</option>
                              <option value="paused">Pause</option>
                              <option value="completed">Complete</option>
                              <option value="closed">Close</option>
                            </select>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        }
      </div>

      {/* view modal */}
      {viewCampaign && (
        <CampaignViewModal
          campaign={viewCampaign}
          onClose={() => setViewCampaign(null)}
          onStatusChange={updateStatus}
          onEdit={c => setEditCampaign(c)}
        />
      )}

      {/* edit modal */}
      {editCampaign && (
        <CampaignEditModal
          campaign={editCampaign}
          onClose={() => setEditCampaign(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
