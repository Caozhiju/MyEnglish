/* ═══════════════════════════════════════════════════════════════
   LLM API Service — OpenAI-compatible interface
   Supports: OpenAI, DeepSeek, and other compatible providers.
   Config priority: localStorage > import.meta.env > defaults
   ═══════════════════════════════════════════════════════════════ */

const STORAGE_KEY = 'llmConfig'

/* ── Configuration ── */

export function getLLMConfig() {
  const stored = (() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  })()

  return {
    apiKey:
      stored.apiKey ||
      import.meta.env.VITE_LLM_API_KEY ||
      '',
    baseURL:
      stored.baseURL ||
      import.meta.env.VITE_LLM_BASE_URL ||
      'https://api.openai.com/v1',
    model:
      stored.model ||
      import.meta.env.VITE_LLM_MODEL ||
      'gpt-4o-mini',
  }
}

export function saveLLMConfig({ apiKey, baseURL, model }) {
  const prev = (() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
    } catch {
      return {}
    }
  })()
  const next = {
    apiKey: apiKey !== undefined ? apiKey : prev.apiKey,
    baseURL: baseURL !== undefined ? baseURL : prev.baseURL,
    model: model !== undefined ? model : prev.model,
  }
  // Remove empty fields so env fallback can take effect
  for (const k of Object.keys(next)) {
    if (!next[k]) delete next[k]
  }
  if (Object.keys(next).length === 0) {
    localStorage.removeItem(STORAGE_KEY)
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function isLLMConfigured() {
  return !!getLLMConfig().apiKey
}

/* ── Error helpers ── */

class LLMError extends Error {
  constructor(code, message, status) {
    super(message)
    this.code = code
    this.status = status
  }
}

/* ── JSON extraction ── */

function extractJSON(rawText) {
  // Strategy 1: direct parse
  try {
    return JSON.parse(rawText)
  } catch {
    // continue
  }

  // Strategy 2: strip ```json fences
  let cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    // continue
  }

  // Strategy 3: find outermost { } or [ ]
  const firstBrace = cleaned.indexOf('{')
  const firstBracket = cleaned.indexOf('[')

  let start = -1
  let end = -1
  let isArray = false

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    start = firstBrace
    end = cleaned.lastIndexOf('}')
    isArray = false
  } else if (firstBracket !== -1) {
    start = firstBracket
    end = cleaned.lastIndexOf(']')
    isArray = true
  }

  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1))
    } catch {
      // continue
    }
  }

  throw new LLMError(
    'JSON_PARSE_ERROR',
    `无法解析 AI 返回的数据格式。原始响应片段: ${rawText.slice(0, 300)}`
  )
}

/* ── Core: chat completion ── */

export async function chatCompletion(
  messages,
  { temperature = 0.8, maxTokens = 2048, timeout = 45000 } = {}
) {
  const config = getLLMConfig()

  if (!config.apiKey) {
    throw new LLMError('NO_API_KEY', '未配置 API Key。请在设置中填入你的 API Key 或在项目根目录创建 .env 文件。')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  let response
  try {
    response = await fetch(`${config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') {
      throw new LLMError('TIMEOUT', '请求超时，AI 响应时间过长，请重试或尝试减少字数。')
    }
    throw new LLMError('NETWORK_ERROR', `网络连接失败: ${err.message}`)
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`
    try {
      const errBody = await response.json()
      errMsg = errBody.error?.message || errMsg
    } catch {
      // can't parse error body, use status
    }
    throw new LLMError('API_ERROR', `API 请求失败: ${errMsg}`, response.status)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content || ''

  if (!content.trim()) {
    throw new LLMError('API_ERROR', 'API 返回了空响应，请重试。')
  }

  return content
}

/* ── Domain: generate English article ── */

export async function generateArticle({ scenario, difficulty = 'medium', wordCount = 200 }) {
  const difficultyGuide = {
    easy: '初级 (A2-B1)，使用简单词汇和短句，适合英语初学者',
    medium: '中级 (B1-B2)，使用适中词汇和自然的句式，适合有一定基础的学习者',
    hard: '高级 (C1)，使用丰富词汇和复杂句式，适合高级学习者',
  }
  const levelGuide = difficultyGuide[difficulty] || difficultyGuide.medium

  const systemPrompt =
    `你是一位英语阅读材料生成专家。请根据以下要求写一篇英语短文：

- 主题/场景：${scenario}
- 难度级别：${levelGuide}
- 字数限制：大约 ${wordCount} 词
- 直接输出正文，不要有任何废话和前缀
- 写 3-5 个自然段落

重要：只返回一个 JSON 对象，不要任何其他文字：
{"title": "文章标题", "paragraphs": ["第一段...", "第二段...", "第三段..."]}`

  const userPrompt = `请写一篇关于"${scenario}"的英语短文。`

  const raw = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.85, maxTokens: 2048 }
  )

  const result = extractJSON(raw)

  if (!result.title || !Array.isArray(result.paragraphs)) {
    throw new LLMError('JSON_PARSE_ERROR', 'AI 返回的数据缺少 title 或 paragraphs 字段，请重试。')
  }

  return {
    title: result.title,
    paragraphs: result.paragraphs.filter((p) => typeof p === 'string' && p.trim()),
  }
}

/* ── Domain: generate topic suggestions ── */

const VALID_TOPICS = ['daily', 'business', 'academic', 'travel', 'technology', 'health', 'psychology']
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard']

export async function generateScenarioTopics(count = 5) {
  const systemPrompt = `你是一位英语课程设计师，负责为英语学习者推荐有趣的阅读话题。

请生成 ${count} 个新颖、多样的英语阅读话题。每个话题必须包含以下字段：
- id: 英文 kebab-case 标识符
- emoji: 一个相关的 emoji 字符
- title: 吸引人的英文标题（5-10 个单词）
- topic: 分类，必须是以下之一: ${VALID_TOPICS.join(', ')}
- difficulty: 难度，必须是以下之一: ${VALID_DIFFICULTIES.join(', ')}

要求：话题涵盖不同分类和难度，有创意，能引起阅读兴趣。

重要：只返回一个 JSON 数组，不要任何其他文字：
[{"id": "...", "emoji": "...", "title": "...", "topic": "...", "difficulty": "..."}]`

  const userPrompt = `请生成 ${count} 个新的英语阅读话题推荐。`

  const raw = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 1.0, maxTokens: 1024 }
  )

  const result = extractJSON(raw)

  if (!Array.isArray(result)) {
    throw new LLMError('JSON_PARSE_ERROR', 'AI 返回的话题列表格式不正确，请重试。')
  }

  // Normalize + validate each topic
  return result
    .filter((t) => t && t.title && t.topic)
    .map((t, i) => ({
      id: t.id && /^[a-z0-9-]+$/.test(t.id) ? t.id : `topic-${i}-${Date.now()}`,
      emoji: t.emoji || '📖',
      title: t.title,
      topic: VALID_TOPICS.includes(t.topic) ? t.topic : 'daily',
      difficulty: VALID_DIFFICULTIES.includes(t.difficulty) ? t.difficulty : 'medium',
    }))
}
