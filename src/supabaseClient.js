import { createClient } from '@supabase/supabase-js'

const _rawUrl = import.meta.env.VITE_SUPABASE_URL || ''
const _rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

console.log('【Supabase Debug】raw URL from env:', JSON.stringify(_rawUrl))
console.log('【Supabase Debug】raw Key present:', !!_rawKey)

const supabaseUrl = _rawUrl.replace(/\/+$/, '')
const supabaseAnonKey = _rawKey

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('【Supabase】环境变量为空，云同步不可用')
}

export function isSupabaseConfigured() {
  return !!(supabaseUrl && supabaseAnonKey)
}

let _supabase = null

export function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(supabaseUrl, supabaseAnonKey)
  }
  return _supabase
}

export const supabase = isSupabaseConfigured() ? createClient(supabaseUrl, supabaseAnonKey) : null
