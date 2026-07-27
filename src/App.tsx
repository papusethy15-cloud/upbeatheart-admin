import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'

import LoginPage       from '@/pages/auth/LoginPage'
import SeedAdminPage   from '@/pages/auth/SeedAdminPage'
import DashboardLayout from '@/components/layout/DashboardLayout'
import DashboardPage   from '@/pages/DashboardPage'
import AppointmentsPage from '@/pages/AppointmentsPage'
import BlogsListPage   from '@/pages/blogs/BlogsListPage'
import BlogAddPage     from '@/pages/blogs/BlogAddPage'
import BlogEditPage    from '@/pages/blogs/BlogEditPage'
import CampaignsPage   from '@/pages/CampaignsPage'
import NGOsPage        from '@/pages/NGOsPage'
import DonationsPage   from '@/pages/DonationsPage'
import ReviewsPage     from '@/pages/ReviewsPage'
import GalleryPage     from '@/pages/GalleryPage'
import SettingsPage    from '@/pages/SettingsPage'
import TeamPage        from '@/pages/TeamPage'
import LegalPage       from '@/pages/LegalPage'
import DiseasesListPage from '@/pages/diseases/DiseasesListPage'
import DiseaseEditorPage from '@/pages/diseases/DiseaseEditorPage'
import ContactsPage     from '@/pages/ContactsPage'
import NotificationsPage from '@/pages/NotificationsPage'

const queryClient = new QueryClient()

/**
 * PrivateRoute — allows through if:
 *   1. user (Firestore doc exists) → full access
 *   2. firebaseUser only (no doc yet) → still allow; SeedAdminPage handles redirect
 * Blocks only when truly not logged in at all.
 */
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, firebaseUser, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Not logged in at all
  if (!firebaseUser && !user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* One-time admin setup — no auth guard needed, page is harmless */}
          <Route path="/seed-admin" element={<SeedAdminPage />} />

          {/* Protected */}
          <Route path="/" element={<PrivateRoute><DashboardLayout /></PrivateRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"    element={<DashboardPage />} />
            <Route path="appointments" element={<AppointmentsPage />} />

            {/* Blog routes — list, new, edit */}
            <Route path="blogs"              element={<BlogsListPage />} />
            <Route path="blogs/new"          element={<BlogAddPage />} />
            <Route path="blogs/:id/edit"     element={<BlogEditPage />} />

            {/* Disease routes */}
            <Route path="diseases"              element={<DiseasesListPage />} />
            <Route path="diseases/new"          element={<DiseaseEditorPage />} />
            <Route path="diseases/:id/edit"     element={<DiseaseEditorPage />} />

            <Route path="campaigns"    element={<CampaignsPage />} />
            <Route path="ngos"         element={<NGOsPage />} />
            <Route path="donations"    element={<DonationsPage />} />
            <Route path="reviews"      element={<ReviewsPage />} />
            <Route path="gallery"      element={<GalleryPage />} />
            <Route path="settings"     element={<SettingsPage />} />
            <Route path="team"         element={<TeamPage />} />
            <Route path="legal"        element={<LegalPage />} />
            <Route path="contacts"       element={<ContactsPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
