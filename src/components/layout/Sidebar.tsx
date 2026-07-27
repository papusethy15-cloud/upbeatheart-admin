import { NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  Heart, LayoutDashboard, Calendar, BookOpen, Megaphone,
  Building2, HandCoins, Star, Images, Settings, Stethoscope, Users, Scale,
  MessageSquare, Bell,
} from 'lucide-react'
import clsx from 'clsx'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const navGroups = [
  {
    label: 'Main',
    items: [
      { to: '/dashboard',    label: 'Dashboard',    icon: LayoutDashboard },
      { to: '/appointments', label: 'Appointments', icon: Calendar },
    ],
  },
  {
    label: 'Content',
    items: [
      { to: '/blogs',     label: 'Blogs',     icon: BookOpen },
      { to: '/diseases',  label: 'Diseases',  icon: Stethoscope },
      { to: '/campaigns', label: 'Campaigns', icon: Megaphone },
      { to: '/reviews',   label: 'Reviews',   icon: Star },
      { to: '/gallery',   label: 'Gallery',   icon: Images },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/contacts',       label: 'Contacts',       icon: MessageSquare },
      { to: '/notifications',  label: 'Notifications',  icon: Bell },
      { to: '/ngos',      label: 'NGO Partners', icon: Building2 },
      { to: '/donations', label: 'Donations',    icon: HandCoins },
      { to: '/team',      label: 'Team & Doctors', icon: Users },
      { to: '/legal',     label: 'Legal & FAQ',  icon: Scale },
      { to: '/settings',  label: 'Settings',     icon: Settings },
    ],
  },
]

export default function Sidebar() {
  const [unreadContacts, setUnreadContacts] = useState(0)

  useEffect(() => {
    const q = query(collection(db, 'contacts'), where('status', '==', 'new'))
    const unsub = onSnapshot(q, snap => setUnreadContacts(snap.size), () => {})
    return unsub
  }, [])

  return (
    <aside className="w-60 h-full bg-white border-r border-gray-100 flex flex-col shrink-0 overflow-hidden">

      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-gray-100 shrink-0">
        <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center shrink-0 shadow-sm">
          <Heart className="w-4 h-4 text-white" fill="white" />
        </div>
        <div>
          <p className="font-bold text-gray-900 text-sm leading-tight tracking-tight">UpBeat Heart</p>
          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest">Admin Panel</p>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {navGroups.map(({ label, items }) => (
          <div key={label}>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 mb-1.5">
              {label}
            </p>
            <div className="space-y-0.5">
              {items.map(({ to, label: itemLabel, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                      isActive
                        ? 'bg-primary text-white shadow-sm shadow-primary/30'
                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={clsx('w-4 h-4 shrink-0', isActive ? 'text-white' : 'text-gray-400')} />
                      <span className="flex-1">{itemLabel}</span>
                      {to === '/contacts' && unreadContacts > 0 && (
                        <span className={clsx(
                          'text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none',
                          isActive ? 'bg-white/25 text-white' : 'bg-blue-500 text-white'
                        )}>
                          {unreadContacts}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer brand strip */}
      <div className="px-4 py-4 border-t border-gray-100 shrink-0">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-xs text-gray-500 font-medium">All systems operational</p>
        </div>
      </div>
    </aside>
  )
}
