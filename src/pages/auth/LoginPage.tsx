import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, Mail, Lock, Chrome, AlertCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { user, firebaseUser, loading, needsSetup, signInEmail, signInGoogle } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Auto-redirect once auth resolves
  useEffect(() => {
    if (loading) return
    if (user) {
      // Fully set up — go to dashboard
      navigate('/dashboard', { replace: true })
    } else if (needsSetup && firebaseUser) {
      // Logged in but no Firestore doc — go to setup page
      navigate('/seed-admin', { replace: true })
    }
  }, [user, firebaseUser, loading, needsSetup, navigate])

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signInEmail(email, password)
      // Navigation handled by useEffect above once auth state updates
    } catch (err: any) {
      const code = err?.code ?? ''
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('Incorrect email or password.')
      } else if (code === 'auth/too-many-requests') {
        setError('Too many attempts. Try again later.')
      } else {
        setError('Sign-in failed. Check your credentials.')
      }
      toast.error('Sign-in failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError('')
    setSubmitting(true)
    try {
      await signInGoogle()
      // Navigation handled by useEffect
    } catch (err: any) {
      setError('Google sign-in failed.')
      toast.error('Google sign-in failed')
    } finally {
      setSubmitting(false)
    }
  }

  // Show spinner while auth resolves on page load
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-accent/5 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-2xl shadow-xl mb-4">
            <Heart className="w-8 h-8 text-white" fill="white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">UpBeat Heart</h1>
          <p className="text-gray-500 mt-1 text-sm">Admin Dashboard</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-card p-8 border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Sign in to continue</h2>

          {/* Error banner */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl mb-4 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary hover:bg-primary-dark text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in…
                </>
              ) : 'Sign In'}
            </button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-100" />
            </div>
            <div className="relative flex justify-center text-xs text-gray-400 bg-white px-3">or</div>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-3 border border-gray-200 text-gray-700 font-medium py-2.5 rounded-xl hover:bg-gray-50 transition disabled:opacity-60"
          >
            <Chrome className="w-4 h-4" />
            Continue with Google
          </button>

          <p className="text-xs text-gray-400 text-center mt-6">
            Access restricted to authorized personnel only.
          </p>
        </div>
      </div>
    </div>
  )
}
