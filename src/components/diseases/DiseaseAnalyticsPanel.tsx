// ── components/diseases/DiseaseAnalyticsPanel.tsx ────────────────────────
// Slide-in panel showing visit analytics for a single disease article
import { useEffect, useState } from 'react'
import {
  collection, getDocs, query, orderBy, limit,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { X, BarChart2, Smartphone, Monitor, Tablet, Globe, Clock, Eye } from 'lucide-react'
import clsx from 'clsx'

interface VisitRecord {
  sessionId:   string
  visitedAt:   Timestamp
  source:      string
  deviceType:  string
  readTimeSec: number
  scrollDepth: number
}

interface Props {
  diseaseId:    string
  diseaseTitle: string
  totalVisits:  number
  onClose:      () => void
}

function avg(arr: number[]) {
  if (!arr.length) return 0
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
}

function fmtSecs(s: number) {
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

export default function DiseaseAnalyticsPanel({ diseaseId, diseaseTitle, totalVisits, onClose }: Props) {
  const [visits,  setVisits]  = useState<VisitRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const q    = query(
          collection(db, 'diseases', diseaseId, 'visits'),
          orderBy('visitedAt', 'desc'),
          limit(200),
        )
        const snap = await getDocs(q)
        setVisits(snap.docs.map(d => d.data() as VisitRecord))
      } catch { /* visits sub-collection may not exist yet */ }
      setLoading(false)
    }
    load()
  }, [diseaseId])

  // Aggregations
  const sourceMap:  Record<string, number> = {}
  const deviceMap:  Record<string, number> = {}
  const readTimes:  number[] = []
  const scrollDeps: number[] = []

  visits.forEach(v => {
    const src = v.source || 'direct'
    sourceMap[src] = (sourceMap[src] || 0) + 1
    const dev = v.deviceType || 'unknown'
    deviceMap[dev] = (deviceMap[dev] || 0) + 1
    if (v.readTimeSec)  readTimes.push(v.readTimeSec)
    if (v.scrollDepth)  scrollDeps.push(v.scrollDepth)
  })

  const topSources = Object.entries(sourceMap).sort((a, b) => b[1] - a[1])
  const topDevices = Object.entries(deviceMap).sort((a, b) => b[1] - a[1])

  const DeviceIcon = ({ type }: { type: string }) => {
    if (type === 'mobile') return <Smartphone className="w-3.5 h-3.5" />
    if (type === 'tablet') return <Tablet className="w-3.5 h-3.5" />
    return <Monitor className="w-3.5 h-3.5" />
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">Visit Analytics</h3>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[220px]">{diseaseTitle}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-7 h-7 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">

            {/* Top stats */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Total Visits',   value: totalVisits.toLocaleString(), icon: Eye,      color: 'text-primary bg-primary/10' },
                { label: 'Tracked (200)',  value: visits.length,                icon: BarChart2, color: 'text-blue-600 bg-blue-50' },
                { label: 'Avg Read Time', value: fmtSecs(avg(readTimes)),      icon: Clock,     color: 'text-green-600 bg-green-50' },
                { label: 'Avg Scroll',    value: avg(scrollDeps) + '%',        icon: BarChart2, color: 'text-orange-600 bg-orange-50' },
              ].map(s => (
                <div key={s.label} className="border border-gray-100 rounded-xl p-3 flex items-center gap-2">
                  <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', s.color)}>
                    <s.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500">{s.label}</p>
                    <p className="text-sm font-bold text-gray-900">{s.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {visits.length === 0 ? (
              <div className="text-center py-8">
                <BarChart2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No visit data yet</p>
                <p className="text-xs text-gray-300 mt-1">Data appears once the article is published & visited</p>
              </div>
            ) : (
              <>
                {/* Traffic sources */}
                {topSources.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Traffic Sources</p>
                    <div className="space-y-2">
                      {topSources.map(([src, count]) => {
                        const pct = Math.round((count / visits.length) * 100)
                        return (
                          <div key={src}>
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="capitalize text-gray-700 flex items-center gap-1">
                                <Globe className="w-3 h-3 text-gray-400" /> {src}
                              </span>
                              <span className="text-gray-500">{count} ({pct}%)</span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Device split */}
                {topDevices.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Devices</p>
                    <div className="space-y-2">
                      {topDevices.map(([dev, count]) => {
                        const pct = Math.round((count / visits.length) * 100)
                        return (
                          <div key={dev}>
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="capitalize text-gray-700 flex items-center gap-1.5">
                                <DeviceIcon type={dev} /> {dev}
                              </span>
                              <span className="text-gray-500">{count} ({pct}%)</span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}
