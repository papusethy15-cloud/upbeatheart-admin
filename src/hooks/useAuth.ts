import { useState, useEffect } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db, googleProvider } from '@/lib/firebase'
import type { AppUser } from '@/types'

export interface AuthState {
  /** Fully resolved app user with Firestore role — null if not logged in or doc missing */
  user: AppUser | null
  /** Raw Firebase Auth user — present even if Firestore doc doesn't exist yet */
  firebaseUser: User | null
  /** True while auth state is being resolved */
  loading: boolean
  /** True when Firebase says logged in but no Firestore users/{uid} doc exists */
  needsSetup: boolean
}

export function useAuth(): AuthState & {
  signInEmail: (email: string, password: string) => Promise<any>
  signInGoogle: () => Promise<any>
  signOut: () => Promise<void>
} {
  const [user, setUser] = useState<AppUser | null>(null)
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser: User | null) => {
      setFirebaseUser(fbUser)

      if (fbUser) {
        try {
          const snap = await getDoc(doc(db, 'users', fbUser.uid))
          if (snap.exists()) {
            // ✅ Normal case: logged in + Firestore doc exists
            setUser({ uid: fbUser.uid, ...snap.data() } as AppUser)
            setNeedsSetup(false)
          } else {
            // ⚠️ Logged in but no Firestore doc — needs one-time setup
            setUser(null)
            setNeedsSetup(true)
          }
        } catch (err) {
          // Firestore permission error — rules not updated yet
          console.warn('useAuth: Firestore read failed (rules?)', err)
          setUser(null)
          setNeedsSetup(true)
        }
      } else {
        setUser(null)
        setNeedsSetup(false)
      }

      setLoading(false)
    })

    return unsubscribe
  }, [])

  const signInEmail = (email: string, password: string) =>
    signInWithEmailAndPassword(auth, email, password)

  const signInGoogle = () => signInWithPopup(auth, googleProvider)

  const signOut = () => firebaseSignOut(auth)

  return { user, firebaseUser, loading, needsSetup, signInEmail, signInGoogle, signOut }
}
