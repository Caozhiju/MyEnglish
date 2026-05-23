import { createClient } from '@supabase/supabase-js'

function getSupabaseUrl() {
  const url = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
  return url
}

function getSupabaseKey() {
  return import.meta.env.VITE_SUPABASE_ANON_KEY || ''
}

export function isSupabaseConfigured() {
  return !!(getSupabaseUrl() && getSupabaseKey())
}

let _supabase = null

export function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(getSupabaseUrl(), getSupabaseKey())
  }
  return _supabase
}

// For backward compatibility with existing imports
export const supabase = isSupabaseConfigured() ? createClient(getSupabaseUrl(), getSupabaseKey()) : null
