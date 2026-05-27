const API_KEY = import.meta.env.VITE_LLM_API_KEY || ''

function getSTTBaseURL() {
  return (import.meta.env.VITE_STT_BASE_URL || import.meta.env.VITE_LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
}

function getSTTModel() {
  return import.meta.env.VITE_STT_MODEL || 'whisper-1'
}

export function isSTTConfigured() {
  return !!API_KEY
}

export async function transcribeAudio(audioBlob) {
  if (!API_KEY) throw new Error('STT requires an API key. Set VITE_LLM_API_KEY in .env')
  const url = `${getSTTBaseURL()}/audio/transcriptions`
  const formData = new FormData()
  formData.append('file', audioBlob, 'recording.webm')
  formData.append('model', getSTTModel())
  formData.append('language', 'en')
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: formData,
  })
  if (!res.ok) {
    let detail = ''
    try { const e = await res.json(); detail = e.error?.message || '' } catch { /* */ }
    if (res.status === 404 || res.status === 405) {
      console.warn(`STT endpoint failed (${res.status}). Please check if VITE_STT_BASE_URL supports the OpenAI /audio/transcriptions format. URL: ${url}`)
      throw new Error(`STT endpoint not supported (${res.status}). Check if your provider supports /audio/transcriptions, or set VITE_STT_BASE_URL.`)
    }
    throw new Error(`STT API error (${res.status}): ${detail || 'Unknown error'}`)
  }
  const data = await res.json()
  return (data.text || '').trim()
}
