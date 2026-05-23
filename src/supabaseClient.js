import { createClient } from '@supabase/supabase-js'

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
const supabaseUrl = rawUrl || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export function isSupabaseConfigured() {
  return !!(supabaseUrl && supabaseAnonKey)
}

if (!isSupabaseConfigured()) {
  console.warn('[supabase] VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY 未配置，云同步功能不可用')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
