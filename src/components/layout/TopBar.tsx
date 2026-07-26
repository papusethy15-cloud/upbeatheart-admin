import { useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Bell, Search, LogOut, ChevronRight } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import toast from 'react-hot-toast'
import GlobalSearch from './GlobalSearch'

// Map route paths to readable breadcrumb labels
const routeLabels: Record<string, string> = {
  dashboard:    'Dashboard',
  appointments: 'Appointments',
  blogs:        'Blogs',
  diseases:     'Diseases',
  campaigns:    'Patient Campaigns',
  contacts:     'Contacts',
  ngos:         'NGO Partners',
  donations:    'Donations',
  reviews:      'Reviews',
  gallery:      'Gallery',
  settings:     'Settings',
  team:         'Team & Doctors',
  legal:        'Legal & FAQ',
}

export default function TopBar() {
  const { user, signOut } = useAuth()
  const navigate          = useNavigate()
  const { pathname }      = useLocation()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [searchOpen,   setSearchOpen]   = useState(false)

  // Build breadcrumb from path
  const segments    = pathname.split('/').filter(Boolean)
  const currentLabel = routeLabels[segments[segments.length - 1]] ?? 'Dashboard'

  // ⌘K / Ctrl+K global shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleSignOut = async () => {
    await signOut()
    toast.success('Signed out successfully')
    navigate('/login')
  }

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <>
      <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-6 shrink-0 z-10">

        {/* Left — Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-400 font-medium">UpBeat Heart</span>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <span className="font-semibold text-gray-900">{currentLabel}</span>
        </div>

        {/* Right — Actions */}
        <div className="flex items-center gap-3">

          {/* Date */}
          <span className="hidden lg:block text-xs text-gray-400 mr-2">{today}</span>

          {/* Search trigger — click or ⌘K */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 text-sm text-gray-400 border border-gray-200 rounded-xl px-3 py-1.5 hover:border-primary/40 hover:text-gray-600 hover:bg-gray-50 transition hidden md:flex"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="text-xs">Search…</span>
            <span className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-md font-mono">⌘K</span>
          </button>

          {/* Mobile search icon */}
          <button
            onClick={() => setSearchOpen(true)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-50 transition"
          >
            <Search className="w-4 h-4 text-gray-500" />
          </button>

          {/* Notification bell */}
          <button className="relative w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-50 transition">
            <Bell className="w-4 h-4 text-gray-500" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
          </button>

          {/* User avatar + dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(v => !v)}
              className="flex items-center gap-2.5 pl-1 pr-3 py-1 rounded-xl hover:bg-gray-50 transition"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-sm shrink-0">
                {user?.name?.charAt(0)?.toUpperCase() ?? 'A'}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-sm font-semibold text-gray-900 leading-tight">{user?.name ?? 'Admin'}</p>
                <p className="text-xs text-gray-400 capitalize leading-tight">{user?.role ?? 'admin'}</p>
              </div>
            </button>

            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)} />
                <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl border border-gray-100 shadow-lg z-20 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-50">
                    <p className="text-sm font-semibold text-gray-900">{user?.name ?? 'Admin'}</p>
                    <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                  </div>
                  <div className="p-1.5">
                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-xl transition"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Global Search Modal */}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}
