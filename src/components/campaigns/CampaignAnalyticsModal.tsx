/**
 * CampaignAnalyticsModal
 * Shows visit & engagement statistics for a patient campaign.
 *
 * Data source: Firestore subcollection  campaigns/{id}/analytics/{YYYY-MM-DD}
 * Schema per day doc:
 *   { visits: number, shares: number, donationClicks: number, contactClicks: number, date: string }
 *
 * The public website increments these counters via Firebase callable Function
 * (onCampaignView / onCampaignShare). The admin reads the aggregated totals here.
 *
 * In this file we also define the aggregation helper `useCampaignAnalytics` that
 * reads the subcollection. If no real data exists yet, mock data is shown so the
 * UI is always meaningful during development.
 */
import { useEffect, useState } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import {
  X, TrendingUp, Eye, Share2, Heart, Phone,
  MousePointer, Calendar, BarChart2, ArrowUp, ArrowDown, Minus
} from 'lucide-react'
import type { Campaign } from '@/types'
import clsx from 'clsx'

// ── types ─────────────────────────────────────────────────────────────────────

interface DayStats {
  date: string           // 'YYYY-MM-DD'
  visits: number
  shares: number
  donationClicks: number
  contactClicks: number
}

interface Totals {
  visits: number
  shares: number
  donationClicks: number
  contactClicks: number
  engagementRate: number   // (shares+donationClicks+contactClicks) / visits * 100
}

interface Props {
  campaign: Campaign
  onClose: () => void
}

// ── mock data generator (used when no real analytics exist yet) ───────────────

function generateMockData(daysBack = 30): DayStats[] {
  const result: DayStats[] = []
  const base = { visits: 12, shares: 1, donationClicks: 2, contactClicks: 1 }
  for (let i = daysBack; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const date = d.toISOString().slice(0, 10)
    const spike = Math.random() > 0.85 ? 4 : 1
    result.push({
      date,
      visits: Math.round((base.visits + Math.random() * 20) * spike),
      shares: Math.round((base.shares + Math.random() * 3) * spike),
      donationClicks: Math.round((base.donationClicks + Math.random() * 5) * spike),
      contactClicks: Math.round((base.contactClicks + Math.random() * 2) * spike),
    })
  }
  return result
}

// ── helpers ───────────────────────────────────────────────────────────────────

function sum(data: DayStats[], key: keyof Omit<DayStats, 'date'>) {
  return data.reduce((s, d) => s + (d[key] as number), 0)
}

function calcTotals(data: DayStats[]): Totals {
  const visits = sum(data, 'visits')
  const shares = sum(data, 'shares')
  const donationClicks = sum(data, 'donationClicks')
  const contactClicks = sum(data, 'contactClicks')
  const engagementRate = visits > 0 ? ((shares + donationClicks + contactClicks) / visits) * 100 : 0
  return { visits, shares, donationClicks, contactClicks, engagementRate }
}

function weekOverWeekChange(data: DayStats[], key: keyof Omit<DayStats, 'date'>): number {
  if (data.length < 14) return 0
  const thisWeek = data.slice(-7)
  const lastWeek = data.slice(-14, -7)
  const t = sum(thisWeek, key)
  const l = sum(lastWeek, key)
  if (l === 0) return t > 0 ? 100 : 0
  return Math.round(((t - l) / l) * 100)
}

// ── MiniBar chart (SVG, no library) ──────────────────────────────────────────

function MiniBarChart({ data, dataKey, color }: {
  data: DayStats[]
  dataKey: keyof Omit<DayStats, 'date'>
  color: string
}) {
  const values = data.map(d => d[dataKey] as number)
  const max = Math.max(...values, 1)
  const W = 500, H = 80

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20" preserveAspectRatio="none">
      {values.map((v, i) => {
        const barW = W / values.length - 2
        const barH = (v / max) * (H - 8)
        const x = i * (W / values.length) + 1
        const y = H - barH
        return (
          <rect key={i} x={x} y={y} width={barW} height={barH}
            rx="2" fill={color} opacity={i === values.length - 1 ? 1 : 0.5} />
        )
      })}
    </svg>
  )
}

// ── LineChart (SVG) ───────────────────────────────────────────────────────────

function LineChart({ data }: { data: DayStats[] }) {
  const W = 600, H = 120, PAD = 20
  const innerW = W - PAD * 2, innerH = H - PAD * 2
  const maxV = Math.max(...data.map(d => d.visits), 1)
  const maxD = Math.max(...data.map(d => d.donationClicks), 1)

  const toPath = (values: number[], maxVal: number) => {
    const pts = values.map((v, i) => {
      const x = PAD + (i / (values.length - 1)) * innerW
      const y = PAD + innerH - (v / maxVal) * innerH
      return `${x},${y}`
    })
    return 'M' + pts.join(' L')
  }

  const visitPath = toPath(data.map(d => d.visits), maxV)
  const donationPath = toPath(data.map(d => d.donationClicks), maxD)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32">
      {/* grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(p => (
        <line key={p} x1={PAD} y1={PAD + innerH * (1 - p)} x2={W - PAD} y2={PAD + innerH * (1 - p)}
          stroke="#f1f5f9" strokeWidth="1" />
      ))}
      {/* visit area */}
      <path d={visitPath + ` L${W - PAD},${H - PAD} L${PAD},${H - PAD} Z`}
        fill="#1B6CA8" fillOpacity="0.08" />
      <path d={visitPath} fill="none" stroke="#1B6CA8" strokeWidth="2" strokeLinejoin="round" />
      {/* donation click line */}
      <path d={donationPath} fill="none" stroke="#0EA5A8" strokeWidth="2"
        strokeLinejoin="round" strokeDasharray="4 2" />
    </svg>
  )
}

// ── Change badge ──────────────────────────────────────────────────────────────

function ChangeBadge({ pct }: { pct: number }) {
  if (pct === 0) return <span className="text-xs text-gray-400 flex items-center gap-0.5"><Minus className="w-3 h-3" />—</span>
  const up = pct > 0
  return (
    <span className={clsx('text-xs font-semibold flex items-center gap-0.5', up ? 'text-emerald-600' : 'text-red-500')}>
      {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {Math.abs(pct)}% vs last week
    </span>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

type Range = '7d' | '30d' | '90d' | 'all'

export default function CampaignAnalyticsModal({ campaign, onClose }: Props) {
  const [allData, setAllData] = useState<DayStats[]>([])
  const [loading, setLoading] = useState(true)
  const [isMock, setIsMock] = useState(false)
  const [range, setRange] = useState<Range>('30d')

  useEffect(() => {
    ;(async () => {
      try {
        const q = query(
          collection(db, 'campaigns', campaign.id, 'analytics'),
          orderBy('date', 'asc')
        )
        const snap = await getDocs(q)
        if (snap.empty) {
          setAllData(generateMockData(90))
          setIsMock(true)
        } else {
          setAllData(snap.docs.map(d => d.data() as DayStats))
          setIsMock(false)
        }
      } catch {
        setAllData(generateMockData(90))
        setIsMock(true)
      }
      setLoading(false)
    })()
  }, [campaign.id])

  const rangedData = (() => {
    if (range === 'all') return allData
    const n = range === '7d' ? 7 : range === '30d' ? 30 : 90
    return allData.slice(-n)
  })()

  const totals = calcTotals(rangedData)

  const STATS = [
    {
      label: 'Page Visits',
      value: totals.visits.toLocaleString(),
      icon: Eye,
      color: 'bg-blue-50 text-blue-600',
      barColor: '#1B6CA8',
      dataKey: 'visits' as const,
      change: weekOverWeekChange(rangedData, 'visits'),
    },
    {
      label: 'Donate Clicks',
      value: totals.donationClicks.toLocaleString(),
      icon: Heart,
      color: 'bg-rose-50 text-rose-600',
      barColor: '#f43f5e',
      dataKey: 'donationClicks' as const,
      change: weekOverWeekChange(rangedData, 'donationClicks'),
    },
    {
      label: 'Shares',
      value: totals.shares.toLocaleString(),
      icon: Share2,
      color: 'bg-emerald-50 text-emerald-600',
      barColor: '#10b981',
      dataKey: 'shares' as const,
      change: weekOverWeekChange(rangedData, 'shares'),
    },
    {
      label: 'Contact Clicks',
      value: totals.contactClicks.toLocaleString(),
      icon: Phone,
      color: 'bg-purple-50 text-purple-600',
      barColor: '#8b5cf6',
      dataKey: 'contactClicks' as const,
      change: weekOverWeekChange(rangedData, 'contactClicks'),
    },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[400] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <BarChart2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">Campaign Analytics</h2>
              <p className="text-xs text-gray-400">{campaign.patientName} — {campaign.diagnosis}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isMock && (
              <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-1 rounded-lg font-medium">
                Sample data — real tracking starts once campaign is live
              </span>
            )}
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          {loading ? (
            <div className="py-16 text-center text-gray-400 text-sm">Loading analytics…</div>
          ) : (
            <>
              {/* range selector */}
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">
                  {rangedData.length} days of data
                </p>
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                  {(['7d', '30d', '90d', 'all'] as Range[]).map(r => (
                    <button key={r} onClick={() => setRange(r)}
                      className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold transition',
                        range === r ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                      {r === 'all' ? 'All' : r}
                    </button>
                  ))}
                </div>
              </div>

              {/* stat cards */}
              <div className="grid grid-cols-2 gap-4">
                {STATS.map(s => {
                  const Icon = s.icon
                  return (
                    <div key={s.label} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm overflow-hidden">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center mb-2', s.color)}>
                            <Icon className="w-4.5 h-4.5" />
                          </div>
                          <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                          <p className="text-xs text-gray-400">{s.label}</p>
                        </div>
                        <ChangeBadge pct={s.change} />
                      </div>
                      <MiniBarChart data={rangedData} dataKey={s.dataKey} color={s.barColor} />
                    </div>
                  )
                })}
              </div>

              {/* engagement rate */}
              <div className="bg-gradient-to-br from-[#1B6CA8]/5 to-[#0EA5A8]/5 border border-[#1B6CA8]/10 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <MousePointer className="w-4 h-4 text-[#1B6CA8]" />
                    <p className="font-semibold text-gray-800">Overall Engagement Rate</p>
                  </div>
                  <p className="text-2xl font-bold text-[#1B6CA8]">{totals.engagementRate.toFixed(1)}%</p>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  (Donation clicks + Shares + Contact clicks) ÷ Total visits
                </p>
                <div className="w-full bg-white/60 rounded-full h-2.5">
                  <div className="bg-[#1B6CA8] h-2.5 rounded-full transition-all"
                    style={{ width: `${Math.min(100, totals.engagementRate)}%` }} />
                </div>
              </div>

              {/* visits vs donation trend chart */}
              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-gray-800">Visits vs Donation Clicks</p>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-[#1B6CA8] inline-block rounded" /> Visits
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 border-t-2 border-dashed border-[#0EA5A8] inline-block" /> Donate clicks
                    </span>
                  </div>
                </div>
                <LineChart data={rangedData} />
                <div className="flex justify-between text-[10px] text-gray-300 mt-1 px-1">
                  <span>{rangedData[0]?.date}</span>
                  <span>{rangedData[rangedData.length - 1]?.date}</span>
                </div>
              </div>

              {/* top days */}
              <div>
                <p className="font-semibold text-gray-800 mb-3">Top 5 Days by Visits</p>
                <div className="space-y-2">
                  {[...rangedData]
                    .sort((a, b) => b.visits - a.visits)
                    .slice(0, 5)
                    .map((d, i) => (
                      <div key={d.date} className="flex items-center gap-3">
                        <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {i + 1}
                        </span>
                        <div className="flex-1">
                          <div className="flex justify-between text-xs text-gray-600 mb-1">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </span>
                            <span className="font-semibold">{d.visits} visits</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div className="bg-[#1B6CA8] h-1.5 rounded-full"
                              style={{ width: `${(d.visits / rangedData[0]?.visits || 1) * 100}%` }} />
                          </div>
                        </div>
                        <div className="flex gap-2 text-[10px] text-gray-400">
                          <span className="text-rose-500 font-medium">{d.donationClicks} don.</span>
                          <span className="text-emerald-500 font-medium">{d.shares} shr.</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* how tracking works */}
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" /> How Analytics Are Tracked
                </p>
                <ul className="text-xs text-gray-500 space-y-1.5">
                  <li>• <strong>Visits</strong> — Page views on upbeatheart.com/patient-assistance/[id]</li>
                  <li>• <strong>Donate Clicks</strong> — Clicks on "Donate Now" button</li>
                  <li>• <strong>Shares</strong> — WhatsApp / Social share button clicks</li>
                  <li>• <strong>Contact Clicks</strong> — "Contact Doctor" button clicks</li>
                  <li>• Data stored in Firestore: <code className="bg-gray-200 px-1 rounded">campaigns/{'{id}'}/analytics/{'{YYYY-MM-DD}'}</code></li>
                  <li>• Incremented by Firebase Cloud Function <code className="bg-gray-200 px-1 rounded">onCampaignInteraction</code></li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
