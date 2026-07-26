/**
 * UpBeat Heart — Admin Dashboard
 * GlobalSearch.tsx — ⌘K / Ctrl+K command palette
 *
 * Searches live across: appointments, blogs, campaigns, contacts,
 * ngos, donations — client-side filter on cached Firestore data.
 * Navigates to the relevant page on selection.
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, X, Calendar, BookOpen, Megaphone,
  Building2, HandCoins, MessageSquare, ArrowRight,
  Loader2, Hash,
} from 'lucide-react'
import {
  collection, getDocs, query, orderBy, limit,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

// ─── Types ────────────────────────────────────────────────────────────────────
interface SearchResult {
  id:       string
  type:     'appointment' | 'blog' | 'campaign' | 'contact' | 'ngo' | 'donation'
  title:    string
  subtitle: string
  path:     string
  badge?:   string
}

interface Props {
  open:    boolean
  onClose: () => void
}

// ─── Config ───────────────────────────────────────────────────────────────────
const TYPE_META: Record<SearchResult['type'], { label: string; icon: any; color: string; bg: string }> = {
  appointment: { label: 'Appointment', icon: Calendar,     color: 'text-blue-600',   bg: 'bg-blue-50'   },
  blog:        { label: 'Blog',        icon: BookOpen,     color: 'text-purple-600', bg: 'bg-purple-50' },
  campaign:    { label: 'Campaign',    icon: Megaphone,    color: 'text-orange-600', bg: 'bg-orange-50' },
  contact:     { label: 'Contact',     icon: MessageSquare,color: 'text-teal-600',   bg: 'bg-teal-50'   },
  ngo:         { label: 'NGO',         icon: Building2,    color: 'text-green-600',  bg: 'bg-green-50'  },
  donation:    { label: 'Donation',    icon: HandCoins,    color: 'text-pink-600',   bg: 'bg-pink-50'   },
}

// Quick nav links always shown when query is empty
const QUICK_LINKS = [
  { label: 'Dashboard',    path: '/dashboard',    icon: Hash },
  { label: 'Appointments', path: '/appointments', icon: Calendar },
  { label: 'Blogs',        path: '/blogs',        icon: BookOpen },
  { label: 'Campaigns',    path: '/campaigns',    icon: Megaphone },
  { label: 'Contacts',     path: '/contacts',     icon: MessageSquare },
  { label: 'NGO Partners', path: '/ngos',         icon: Building2 },
  { label: 'Donations',    path: '/donations',    icon: HandCoins },
]

// ─── Data fetcher ─────────────────────────────────────────────────────────────
async function fetchAll(): Promise<SearchResult[]> {
  const results: SearchResult[] = []

  const fetchers: Array<() => Promise<void>> = [
    async () => {
      const snap = await getDocs(query(collection(db, 'appointments'), orderBy('createdAt', 'desc'), limit(200)))
      snap.docs.forEach(d => {
        const data = d.data()
        results.push({
          id:       d.id,
          type:     'appointment',
          title:    data.patientName ?? 'Unknown Patient',
          subtitle: `${data.preferredDate ?? ''} · ${data.status ?? ''}`.trim().replace(/^·\s*/, ''),
          path:     '/appointments',
          badge:    data.status,
        })
      })
    },
    async () => {
      const snap = await getDocs(query(collection(db, 'blogs'), orderBy('createdAt', 'desc'), limit(200)))
      snap.docs.forEach(d => {
        const data = d.data()
        results.push({
          id:       d.id,
          type:     'blog',
          title:    data.title ?? 'Untitled Blog',
          subtitle: data.excerpt ?? data.category ?? '',
          path:     `/blogs/${d.id}/edit`,
          badge:    data.status,
        })
      })
    },
    async () => {
      const snap = await getDocs(query(collection(db, 'campaigns'), orderBy('createdAt', 'desc'), limit(200)))
      snap.docs.forEach(d => {
        const data = d.data()
        results.push({
          id:       d.id,
          type:     'campaign',
          title:    data.patientName ?? data.title ?? 'Campaign',
          subtitle: data.diagnosis ?? data.description ?? '',
          path:     '/campaigns',
          badge:    data.status,
        })
      })
    },
    async () => {
      const snap = await getDocs(query(collection(db, 'contacts'), orderBy('createdAt', 'desc'), limit(200)))
      snap.docs.forEach(d => {
        const data = d.data()
        results.push({
          id:       d.id,
          type:     'contact',
          title:    data.name ?? 'Contact',
          subtitle: `${data.phone ?? ''} · ${data.subject ?? ''}`.trim().replace(/^·\s*/, ''),
          path:     '/contacts',
          badge:    data.status,
        })
      })
    },
    async () => {
      const snap = await getDocs(query(collection(db, 'ngos'), orderBy('createdAt', 'desc'), limit(200)))
      snap.docs.forEach(d => {
        const data = d.data()
        results.push({
          id:       d.id,
          type:     'ngo',
          title:    data.name ?? 'NGO',
          subtitle: data.email ?? data.contactPerson ?? '',
          path:     '/ngos',
          badge:    data.status,
        })
      })
    },
    async () => {
      const snap = await getDocs(query(collection(db, 'donations'), orderBy('createdAt', 'desc'), limit(200)))
      snap.docs.forEach(d => {
        const data = d.data()
        results.push({
          id:       d.id,
          type:     'donation',
          title:    data.donorName ?? 'Anonymous Donor',
          subtitle: `₹${data.amount ?? 0} · ${data.campaignTitle ?? ''}`.trim().replace(/^·\s*/, ''),
          path:     '/donations',
          badge:    data.status,
        })
      })
    },
  ]

  await Promise.allSettled(fetchers.map(f => f()))
  return results
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function GlobalSearch({ open, onClose }: Props) {
  const navigate                  = useNavigate()
  const inputRef                  = useRef<HTMLInputElement>(null)
  const listRef                   = useRef<HTMLDivElement>(null)

  const [query_,    setQuery]     = useState('')
  const [allData,   setAllData]   = useState<SearchResult[]>([])
  const [loading,   setLoading]   = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)

  // Fetch all data once when modal opens
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIdx(0)
    if (allData.length === 0) {
      setLoading(true)
      fetchAll().then(data => { setAllData(data); setLoading(false) })
    }
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  // Filter results
  const results = useMemo<SearchResult[]>(() => {
    if (!query_.trim()) return []
    const q = query_.toLowerCase()
    return allData
      .filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.subtitle.toLowerCase().includes(q) ||
        r.type.includes(q) ||
        (r.badge ?? '').toLowerCase().includes(q)
      )
      .slice(0, 12)
  }, [query_, allData])

  const showQuick   = !query_.trim()
  const activeItems = showQuick ? QUICK_LINKS.length : results.length

  // Reset active index when results change
  useEffect(() => { setActiveIdx(0) }, [query_])

  // Keyboard navigation
  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, activeItems - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (showQuick) {
        navigate(QUICK_LINKS[activeIdx].path)
        onClose()
      } else if (results[activeIdx]) {
        navigate(results[activeIdx].path)
        onClose()
      }
    } else if (e.key === 'Escape') {
      onClose()
    }
  }, [activeIdx, activeItems, showQuick, results, navigate, onClose])

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col"
        style={{ maxHeight: '72vh' }}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
          {loading
            ? <Loader2 className="w-5 h-5 text-gray-400 animate-spin shrink-0" />
            : <Search className="w-5 h-5 text-gray-400 shrink-0" />
          }
          <input
            ref={inputRef}
            value={query_}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search appointments, blogs, campaigns, contacts…"
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent"
          />
          {query_ && (
            <button onClick={() => setQuery('')} className="text-gray-300 hover:text-gray-500 transition">
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 text-[10px] font-semibold text-gray-400 bg-gray-50">
            ESC
          </kbd>
        </div>

        {/* Results / Quick links */}
        <div ref={listRef} className="overflow-y-auto flex-1">

          {/* Quick nav — shown when no query */}
          {showQuick && (
            <div className="p-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3 pt-2 pb-1.5">
                Quick Navigation
              </p>
              {QUICK_LINKS.map((link, i) => {
                const Icon = link.icon
                return (
                  <button
                    key={link.path}
                    data-idx={i}
                    onClick={() => { navigate(link.path); onClose() }}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm transition-colors ${
                      activeIdx === i ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${activeIdx === i ? 'text-white' : 'text-gray-400'}`} />
                    <span className="font-medium">{link.label}</span>
                    <ArrowRight className={`w-3.5 h-3.5 ml-auto ${activeIdx === i ? 'text-white/70' : 'text-gray-300'}`} />
                  </button>
                )
              })}
            </div>
          )}

          {/* Search results */}
          {!showQuick && results.length > 0 && (
            <div className="p-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3 pt-2 pb-1.5">
                {results.length} result{results.length !== 1 ? 's' : ''}
              </p>
              {results.map((r, i) => {
                const meta = TYPE_META[r.type]
                const Icon = meta.icon
                const isActive = activeIdx === i
                return (
                  <button
                    key={r.id}
                    data-idx={i}
                    onClick={() => { navigate(r.path); onClose() }}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-colors ${
                      isActive ? 'bg-primary text-white' : 'hover:bg-gray-50'
                    }`}
                  >
                    {/* Type icon */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isActive ? 'bg-white/20' : meta.bg
                    }`}>
                      <Icon className={`w-4 h-4 ${isActive ? 'text-white' : meta.color}`} />
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${isActive ? 'text-white' : 'text-gray-900'}`}>
                        {r.title}
                      </p>
                      {r.subtitle && (
                        <p className={`text-xs truncate ${isActive ? 'text-white/70' : 'text-gray-400'}`}>
                          {r.subtitle}
                        </p>
                      )}
                    </div>

                    {/* Type badge */}
                    <div className="flex items-center gap-2 shrink-0">
                      {r.badge && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {r.badge}
                        </span>
                      )}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        isActive ? 'bg-white/15 text-white/80' : `${meta.bg} ${meta.color}`
                      }`}>
                        {meta.label}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Empty state */}
          {!showQuick && !loading && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-gray-300">
              <Search className="w-10 h-10" />
              <p className="text-sm text-gray-400">No results for <strong className="text-gray-600">"{query_}"</strong></p>
              <p className="text-xs text-gray-300">Try a patient name, blog title, or NGO name</p>
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-50 bg-gray-50/50">
          <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
            <kbd className="px-1.5 py-0.5 rounded border border-gray-200 bg-white text-gray-500 font-mono text-[10px]">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
            <kbd className="px-1.5 py-0.5 rounded border border-gray-200 bg-white text-gray-500 font-mono text-[10px]">↵</kbd>
            open
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
            <kbd className="px-1.5 py-0.5 rounded border border-gray-200 bg-white text-gray-500 font-mono text-[10px]">ESC</kbd>
            close
          </span>
          <span className="ml-auto text-[10px] text-gray-300">
            {allData.length > 0 ? `${allData.length} records indexed` : 'Loading index…'}
          </span>
        </div>
      </div>
    </div>
  )
}
