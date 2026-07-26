import { useEffect, useState } from 'react'
import { collection, getCountFromServer, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import {
  Calendar, Megaphone, HandCoins, Building2,
  BookOpen, Star, Clock, CheckCircle,
  AlertCircle, ArrowRight, Heart,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import clsx from 'clsx'

/* ─── Stat card config ─────────────────────────────── */
const statCards = [
  { label: 'Appointments', col: 'appointments', icon: Calendar,   color: 'text-blue-600',   bg: 'bg-blue-50',   ring: 'ring-blue-100',   href: '/appointments' },
  { label: 'Campaigns',    col: 'campaigns',    icon: Megaphone,  color: 'text-violet-600', bg: 'bg-violet-50', ring: 'ring-violet-100', href: '/campaigns' },
  { label: 'Donations',    col: 'donations',    icon: HandCoins,  color: 'text-emerald-600',bg: 'bg-emerald-50',ring: 'ring-emerald-100',href: '/donations' },
  { label: 'NGO Partners', col: 'ngos',         icon: Building2,  color: 'text-orange-600', bg: 'bg-orange-50', ring: 'ring-orange-100', href: '/ngos' },
  { label: 'Blog Posts',   col: 'blogs',        icon: BookOpen,   color: 'text-teal-600',   bg: 'bg-teal-50',   ring: 'ring-teal-100',   href: '/blogs' },
  { label: 'Reviews',      col: 'reviews',      icon: Star,       color: 'text-amber-600',  bg: 'bg-amber-50',  ring: 'ring-amber-100',  href: '/reviews' },
]

/* ─── Quick actions ────────────────────────────────── */
const quickActions = [
  { label: 'New Blog Post',      desc: 'Write & publish medical content',    href: '/blogs',        icon: BookOpen,   color: 'text-teal-600',   bg: 'bg-teal-50' },
  { label: 'New Campaign',       desc: 'Create patient assistance campaign',  href: '/campaigns',    icon: Megaphone,  color: 'text-violet-600', bg: 'bg-violet-50' },
  { label: 'View Appointments',  desc: 'Check & confirm pending bookings',    href: '/appointments', icon: Calendar,   color: 'text-blue-600',   bg: 'bg-blue-50' },
  { label: 'NGO Requests',       desc: 'Review new NGO partnership requests', href: '/ngos',         icon: Building2,  color: 'text-orange-600', bg: 'bg-orange-50' },
]

export default function DashboardPage() {
  const { user } = useAuth()
  const [counts, setCounts]         = useState<Record<string, number>>({})
  const [recentAppts, setRecentAppts] = useState<any[]>([])
  const [loading, setLoading]       = useState(true)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  useEffect(() => {
    async function init() {
      // Counts
      const results: Record<string, number> = {}
      await Promise.all(
        statCards.map(async ({ col }) => {
          const snap = await getCountFromServer(collection(db, col))
          results[col] = snap.data().count
        })
      )
      setCounts(results)

      // Recent appointments
      try {
        const q = query(collection(db, 'appointments'), orderBy('createdAt', 'desc'), limit(5))
        const snap = await getDocs(q)
        setRecentAppts(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      } catch (_) {}

      setLoading(false)
    }
    init()
  }, [])

  const apptStatusStyle: Record<string, string> = {
    pending:   'bg-amber-50 text-amber-700 border-amber-200',
    confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
    completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    cancelled: 'bg-red-50 text-red-700 border-red-200',
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* ── Hero welcome banner ─────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-r from-primary via-primary-dark to-[#0d3d6e] rounded-2xl p-6 lg:p-8 text-white">
        {/* decorative circles */}
        <div className="absolute -right-10 -top-10 w-48 h-48 bg-white/5 rounded-full" />
        <div className="absolute right-20 -bottom-8 w-32 h-32 bg-white/5 rounded-full" />
        <div className="absolute right-6 top-6 opacity-20">
          <Heart className="w-20 h-20" fill="currentColor" />
        </div>

        <div className="relative">
          <p className="text-blue-200 text-sm font-medium mb-1">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <h1 className="text-2xl lg:text-3xl font-bold mb-1">
            {greeting}, {user?.name?.split(' ')[0] ?? 'Admin'} 👋
          </h1>
          <p className="text-blue-200 text-sm">
            Here's what's happening with UpBeat Heart today.
          </p>

          {/* Mini stats in banner */}
          <div className="flex flex-wrap gap-6 mt-5">
            {[
              { label: 'Total Appointments', val: counts['appointments'] },
              { label: 'Active Campaigns',   val: counts['campaigns'] },
              { label: 'Total Donations',    val: counts['donations'] },
            ].map(({ label, val }) => (
              <div key={label}>
                <p className="text-2xl font-bold">{loading ? '—' : val ?? 0}</p>
                <p className="text-blue-200 text-xs mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Stats grid ──────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Platform Overview</h2>
          <span className="text-xs text-gray-400">Live counts from Firestore</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {statCards.map(({ label, col, icon: Icon, color, bg, ring, href }) => (
            <Link
              key={col}
              to={href}
              className="group bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:border-gray-200 transition-all duration-200"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center ring-4', bg, ring)}>
                  <Icon className={clsx('w-5 h-5', color)} />
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all" />
              </div>
              <p className="text-3xl font-bold text-gray-900 mb-1">
                {loading ? (
                  <span className="inline-block w-8 h-7 bg-gray-100 rounded-lg animate-pulse" />
                ) : counts[col] ?? 0}
              </p>
              <p className="text-sm text-gray-500 font-medium">{label}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Bottom row: Quick actions + Recent appointments ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Quick actions — 2 cols */}
        <div className="lg:col-span-2">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            {quickActions.map(({ label, desc, href, icon: Icon, color, bg }) => (
              <Link
                key={href}
                to={href}
                className="group flex items-center gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md hover:border-gray-200 transition-all"
              >
                <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', bg)}>
                  <Icon className={clsx('w-5 h-5', color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{label}</p>
                  <p className="text-xs text-gray-400 truncate">{desc}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all shrink-0" />
              </Link>
            ))}
          </div>
        </div>

        {/* Recent appointments — 3 cols */}
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Recent Appointments</h2>
            <Link to="/appointments" className="text-xs font-medium text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="divide-y divide-gray-50">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-4 animate-pulse">
                    <div className="w-8 h-8 bg-gray-100 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-gray-100 rounded w-32" />
                      <div className="h-2.5 bg-gray-100 rounded w-24" />
                    </div>
                    <div className="h-5 bg-gray-100 rounded-full w-16" />
                  </div>
                ))}
              </div>
            ) : recentAppts.length === 0 ? (
              <div className="py-12 text-center">
                <Calendar className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No appointments yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {recentAppts.map((apt) => (
                  <div key={apt.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/50 transition">
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                      {apt.patientName?.charAt(0)?.toUpperCase() ?? 'P'}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{apt.patientName}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {apt.preferredDate
                          ? format(new Date(apt.preferredDate), 'dd MMM') + ' · ' + (apt.preferredTime ?? '')
                          : apt.preferredTime ?? 'Time not set'}
                      </p>
                    </div>
                    {/* Status */}
                    <span className={clsx(
                      'shrink-0 px-2.5 py-1 rounded-full text-xs font-medium border capitalize',
                      apptStatusStyle[apt.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'
                    )}>
                      {apt.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Content approval status strip ─────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Platform Status</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Firebase',   status: 'Connected',  ok: true },
            { label: 'Cloudinary', status: 'boc8bvoc',   ok: true },
            { label: 'Razorpay',   status: 'Test Mode',  ok: true, warn: true },
            { label: 'Doctor App', status: 'Not deployed yet', ok: false },
          ].map(({ label, status, ok, warn }) => (
            <div key={label} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
              {ok && !warn && <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />}
              {ok && warn  && <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />}
              {!ok         && <AlertCircle className="w-4 h-4 text-gray-300 shrink-0" />}
              <div>
                <p className="text-xs font-semibold text-gray-700">{label}</p>
                <p className={clsx('text-xs', ok ? warn ? 'text-amber-600' : 'text-emerald-600' : 'text-gray-400')}>{status}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
