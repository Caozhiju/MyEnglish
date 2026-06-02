import { createContext, useContext, useEffect, useState } from 'react'
import { getSupabase, isSupabaseConfigured } from '../utils/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false)
      return
    }
    const sb = getSupabase()
    if (!sb) {
      setLoading(false)
      return
    }
    sb.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    }).catch(() => {}).finally(() => {
      setLoading(false)
    })

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription?.unsubscribe()
  }, [])

  const signIn = async (email, password) => {
    if (!isSupabaseConfigured()) throw new Error('Supabase 未配置，请先设置环境变量')
    const sb = getSupabase()
    const { error } = await sb.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signUp = async (email, password) => {
    if (!isSupabaseConfigured()) throw new Error('Supabase 未配置，请先设置环境变量')
    const sb = getSupabase()
    const { data, error } = await sb.auth.signUp({ email, password })
    if (error) throw error
    return { needsEmailConfirmation: !data.session }
  }

  const signOut = async () => {
    const sb = getSupabase()
    if (sb) await sb.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
