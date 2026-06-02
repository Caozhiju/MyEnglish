import { createClient } from '@supabase/supabase-js'

const _rawUrl = import.meta.env.VITE_SUPABASE_URL || ''
const _rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

const supabaseUrl = _rawUrl.replace(/\/+$/, '')
const supabaseAnonKey = _rawKey

function isConfigured() {
  return !!(supabaseUrl && supabaseAnonKey)
}

export function isSupabaseConfigured() {
  return isConfigured()
}

let _supabase = null

export function getSupabase() {
  if (!isConfigured()) return null
  if (!_supabase) {
    _supabase = createClient(supabaseUrl, supabaseAnonKey)
  }
  return _supabase
}
