const BASE_URL = (import.meta.env.VITE_LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
const API_KEY = import.meta.env.VITE_LLM_API_KEY || ''

export function isSTTConfigured() {
  return !!API_KEY
}

export async function transcribeAudio(audioBlob) {
  if (!API_KEY) throw new Error('Speech-to-text requires an API key. Set VITE_LLM_API_KEY in .env')
  const formData = new FormData()
  formData.append('file', audioBlob, 'recording.webm')
  formData.append('model', 'whisper-1')
  formData.append('language', 'en')
  const res = await fetch(`${BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: formData,
  })
  if (!res.ok) {
    let detail = ''
    try { const e = await res.json(); detail = e.error?.message || '' } catch { /* */ }
    throw new Error(`STT API error (${res.status}): ${detail || 'Unknown error'}`)
  }
  const data = await res.json()
  return (data.text || '').trim()
}
