/**
 * UpBeat Heart — Admin Dashboard
 * NotificationsPage.tsx — In-app notification inbox
 *
 * Reads from Firestore: users/{adminUid}/notifications/{autoId}
 * Fields: title, body, type, screen, refId, read, createdAt
 *
 * Features:
 *  • Real-time listener — new notifications appear instantly
 *  • Stats strip: Total / Unread / Read
 *  • Tab filter: All | Unread | Read
 *  • Type filter: all types, appointment, blog, disease, ngo, campaign, donation
 *  • Mark single as read / Mark all as read
 *  • Delete single notification
 *  • Type-based icon and color
 *  • Empty state per tab
 */

import { useEffect, useState, useMemo } from 'react'
import {
  collection, onSnapshot, orderBy, query,
  doc, updateDoc, deleteDoc, writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import {
  Bell, BellOff, CheckCheck, Trash2, Calendar,
  BookOpen, Stethoscope, Megaphone, HandCoins,
  Building2, Loader2, Filter,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface AppNotification {
  id:        string
  title:     string
  body:      string
  type:      string   // appointment | blog | disease | ngo | campaign | donation
  screen:    string
  refId:     string
  read:      boolean
  createdAt: any
}

type TabType = 'all' | 'unread' | 'read'

const TYPE_LABELS: Record<string, string> = {
  appointment: 'Appointment',
  blog:        'Blog',
  disease:     'Disease',
  ngo:         'NGO',
  campaign:    'Campaign',
  donation:    'Donation',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(raw: unknown) {
  if (!raw) return '—'
  try {
    const d = raw && typeof (raw as any).toDate === 'function'
      ? (raw as any).toDate()
      : new Date(raw as string)
    const now = new Date()
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000)
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return '—' }
}

function typeIcon(type: string) {
  switch (type) {
    case 'appointment': return <Calendar   className="w-4 h-4" />
    case 'blog':        return <BookOpen   className="w-4 h-4" />
    case 'disease':     return <Stethoscope className="w-4 h-4" />
    case 'campaign':    return <Megaphone  className="w-4 h-4" />
    case 'donation':    return <HandCoins  className="w-4 h-4" />
    case 'ngo':         return <Building2  className="w-4 h-4" />
    default:            return <Bell       className="w-4 h-4" />
  }
}

function typeColor(type: string) {
  switch (type) {
    case 'appointment': return 'bg-blue-50 text-blue-600'
    case 'blog':        return 'bg-purple-50 text-purple-600'
    case 'disease':     return 'bg-red-50 text-red-600'
    case 'campaign':    return 'bg-orange-50 text-orange-600'
    case 'donation':    return 'bg-green-50 text-green-600'
    case 'ngo':         return 'bg-teal-50 text-teal-600'
    default:            return 'bg-gray-50 text-gray-600'
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function NotificationsPage() {
  const { firebaseUser } = useAuth()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading]             = useState(true)
  const [tab, setTab]                     = useState<TabType>('all')
  const [typeFilter, setTypeFilter]       = useState('all')
  const [markingAll, setMarkingAll]       = useState(false)

  // ── Firestore listener ───────────────────────────────────────────────────
  useEffect(() => {
    const uid = firebaseUser?.uid
    if (!uid) { setLoading(false); return }

    const q = query(
      collection(db, 'users', uid, 'notifications'),
      orderBy('createdAt', 'desc'),
    )

    const unsub = onSnapshot(q, snap => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification)))
      setLoading(false)
    }, () => setLoading(false))

    return unsub
  }, [firebaseUser?.uid])

  // ── Filtered list ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return notifications.filter(n => {
      const tabOk = tab === 'all' ? true : tab === 'unread' ? !n.read : n.read
      const typeOk = typeFilter === 'all' || n.type === typeFilter
      return tabOk && typeOk
    })
  }, [notifications, tab, typeFilter])

  const total  = notifications.length
  const unread = notifications.filter(n => !n.read).length
  const read   = notifications.filter(n => n.read).length

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleMarkRead = async (n: AppNotification) => {
    if (n.read) return
    const uid = firebaseUser?.uid
    if (!uid) return
    try {
      await updateDoc(doc(db, 'users', uid, 'notifications', n.id), { read: true })
    } catch { toast.error('Failed to mark as read') }
  }

  const handleDelete = async (n: AppNotification) => {
    const uid = firebaseUser?.uid
    if (!uid) return
    try {
      await deleteDoc(doc(db, 'users', uid, 'notifications', n.id))
      toast.success('Notification deleted')
    } catch { toast.error('Failed to delete') }
  }

  const handleMarkAllRead = async () => {
    const uid = firebaseUser?.uid
    if (!uid) return
    setMarkingAll(true)
    try {
      const unreadItems = notifications.filter(n => !n.read)
      if (!unreadItems.length) { toast('All notifications already read'); setMarkingAll(false); return }
      const batch = writeBatch(db)
      unreadItems.forEach(n => {
        batch.update(doc(db, 'users', uid, 'notifications', n.id), { read: true })
      })
      await batch.commit()
      toast.success('All marked as read')
    } catch { toast.error('Failed to mark all as read') }
    finally { setMarkingAll(false) }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-400 mt-0.5">Your in-app activity inbox</p>
        </div>
        {unread > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition text-sm font-medium disabled:opacity-50"
          >
            {markingAll
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <CheckCheck className="w-4 h-4" />}
            Mark all as read
          </button>
        )}
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total',  value: total,  color: 'text-gray-900' },
          { label: 'Unread', value: unread, color: 'text-red-600'  },
          { label: 'Read',   value: read,   color: 'text-green-600'},
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-4 text-center shadow-sm">
            <p className={clsx('text-3xl font-bold', s.color)}>{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs + Type filter */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        {/* Tabs */}
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {(['all', 'unread', 'read'] as TabType[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                'px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition',
                tab === t
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {t}
              {t === 'unread' && unread > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {unread}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Filter className="w-4 h-4 shrink-0" />
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="all">All types</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
              <BellOff className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-gray-500 font-medium">No notifications</p>
            <p className="text-gray-400 text-sm mt-1">
              {tab === 'unread' ? 'You\'re all caught up!' : 'Nothing here yet.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {filtered.map(n => (
              <li
                key={n.id}
                onClick={() => handleMarkRead(n)}
                className={clsx(
                  'flex items-start gap-4 px-5 py-4 cursor-pointer transition group',
                  n.read ? 'bg-white hover:bg-gray-50' : 'bg-blue-50/40 hover:bg-blue-50/70'
                )}
              >
                {/* Icon */}
                <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5', typeColor(n.type))}>
                  {typeIcon(n.type)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={clsx('text-sm font-semibold text-gray-900 truncate', !n.read && 'font-bold')}>
                        {n.title}
                      </p>
                      <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!n.read && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1" />
                      )}
                      <span className="text-xs text-gray-400 whitespace-nowrap">{fmtDate(n.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={clsx('text-xs px-2 py-0.5 rounded-lg font-medium', typeColor(n.type))}>
                      {TYPE_LABELS[n.type] ?? n.type}
                    </span>
                  </div>
                </div>

                {/* Delete */}
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(n) }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition shrink-0 mt-0.5"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer count */}
      {!loading && filtered.length > 0 && (
        <p className="text-center text-xs text-gray-400">
          Showing {filtered.length} of {total} notification{total !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}
