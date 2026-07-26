/**
 * ONE-TIME SETUP PAGE — /seed-admin
 * 
 * Visit this page ONCE while logged in to create your Firestore user document.
 * After it succeeds, remove this route from App.tsx and delete this file.
 */
import { useState } from 'react'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, db } from '@/lib/firebase'
import { Heart, CheckCircle, AlertCircle } from 'lucide-react'

export default function SeedAdminPage() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'already_exists'>('idle')
  const [uid, setUid] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')

  const handleSeed = async () => {
    setStatus('loading')
    try {
      // Get current logged-in user
      const currentUser = await new Promise<any>((resolve) => {
        const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u) })
      })

      if (!currentUser) {
        setMessage('No user is logged in. Please log in first.')
        setStatus('error')
        return
      }

      setUid(currentUser.uid)
      setEmail(currentUser.email)

      // Check if doc already exists
      const existing = await getDoc(doc(db, 'users', currentUser.uid))
      if (existing.exists()) {
        setMessage(`User doc already exists with role: ${existing.data().role}`)
        setStatus('already_exists')
        return
      }

      // Create the user document
      await setDoc(doc(db, 'users', currentUser.uid), {
        uid: currentUser.uid,
        email: currentUser.email,
        name: currentUser.displayName || 'Admin',
        role: 'admin',
        photoURL: currentUser.photoURL || '',
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      })

      setMessage('Admin user document created successfully!')
      setStatus('success')
    } catch (err: any) {
      setMessage(err.message || 'Something went wrong')
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-accent/5 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-2xl shadow-xl mb-4">
            <Heart className="w-8 h-8 text-white" fill="white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">UpBeat Heart</h1>
          <p className="text-orange-600 text-sm font-medium mt-1">⚠ One-Time Admin Setup</p>
        </div>

        <div className="bg-white rounded-2xl shadow-card p-8 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Create Admin User Document</h2>
          <p className="text-sm text-gray-500 mb-6">
            This creates your Firestore <code className="bg-gray-100 px-1 rounded text-xs">users/&#123;uid&#125;</code> document with <code className="bg-gray-100 px-1 rounded text-xs">role: "admin"</code>.
            Run this once, then delete this page.
          </p>

          {status === 'idle' && (
            <button
              onClick={handleSeed}
              className="w-full bg-primary hover:bg-primary-dark text-white font-semibold py-3 rounded-xl transition"
            >
              Create Admin Document
            </button>
          )}

          {status === 'loading' && (
            <div className="flex items-center justify-center gap-3 py-4 text-gray-500">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Creating document…
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-green-50 rounded-xl border border-green-100">
                <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-green-800">✅ Done!</p>
                  <p className="text-sm text-green-700 mt-1">{message}</p>
                  <p className="text-xs text-green-600 mt-1">UID: <code>{uid}</code></p>
                  <p className="text-xs text-green-600">Email: <code>{email}</code></p>
                </div>
              </div>
              <a
                href="/login"
                className="block w-full text-center bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary-dark transition"
              >
                Go to Login →
              </a>
              <p className="text-xs text-gray-400 text-center">
                After logging in successfully, remove <code>/seed-admin</code> route from App.tsx
              </p>
            </div>
          )}

          {status === 'already_exists' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
                <CheckCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-800">Already set up!</p>
                  <p className="text-sm text-blue-700 mt-1">{message}</p>
                </div>
              </div>
              <a href="/login" className="block w-full text-center bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary-dark transition">
                Go to Login →
              </a>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-100">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800">Error</p>
                  <p className="text-sm text-red-700 mt-1">{message}</p>
                </div>
              </div>
              <button onClick={() => setStatus('idle')} className="w-full border border-gray-200 text-gray-700 font-medium py-2.5 rounded-xl hover:bg-gray-50 transition">
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
