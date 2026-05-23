import.meta.env.VITE_LLM_API_KEY
import.meta.env.VITE_LLM_BASE_URL
import.meta.env.VITE_LLM_MODEL

function getLLMConfig() {
  return {
    apiKey: import.meta.env.VITE_LLM_API_KEY || '',
    baseURL: (import.meta.env.VITE_LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: import.meta.env.VITE_LLM_MODEL || 'gpt-4o-mini',
  }
}

export function isLLMConfigured() {
  return !!getLLMConfig().apiKey
}

class LLMError extends Error {
  constructor(code, message, status) {
    super(message)
    this.code = code
    this.status = status
  }
}

function extractJSON(rawText) {
  try {
    return JSON.parse(rawText)
  } catch {
    // continue
  }
  let cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    // continue
  }
  const firstBrace = cleaned.indexOf('{')
  const firstBracket = cleaned.indexOf('[')
  let start = -1, end = -1, isArray = false
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    start = firstBrace; end = cleaned.lastIndexOf('}'); isArray = false
  } else if (firstBracket !== -1) {
    start = firstBracket; end = cleaned.lastIndexOf(']'); isArray = true
  }
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)) } catch { /* */ }
  }
  throw new LLMError('JSON_PARSE_ERROR', `无法解析 AI 返回的数据格式。原始响应片段: ${rawText.slice(0, 300)}`)
}

export async function chatCompletion(
  messages,
  { temperature = 0.8, maxTokens = 2048, timeout = 45000 } = {}
) {
  const config = getLLMConfig()
  if (!config.apiKey) {
    throw new LLMError('NO_API_KEY', '未配置 API Key。请在项目根目录创建 .env.local 文件并设置 VITE_LLM_API_KEY。')
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
    try { const errBody = await response.json(); errMsg = errBody.error?.message || errMsg } catch { /* */ }
    throw new LLMError('API_ERROR', `API 请求失败: ${errMsg}`, response.status)
  }
  const data = await response.json()
  const content = data.choices?.[0]?.message?.content || ''
  if (!content.trim()) {
    throw new LLMError('API_ERROR', 'API 返回了空响应，请重试。')
  }
  return content
}

export async function generateArticle({ scenario, difficulty = 'medium', wordCount = 200 }) {
  const difficultyGuide = {
    easy: '初级 (A2-B1)，使用简单词汇和短句，适合英语初学者',
    medium: '中级 (B1-B2)，使用适中词汇和自然的句式，适合有一定基础的学习者',
    hard: '高级 (C1)，使用丰富词汇和复杂句式，适合高级学习者',
  }
  const levelGuide = difficultyGuide[difficulty] || difficultyGuide.medium
  const systemPrompt =
    `你是一位英语阅读材料生成专家。请根据以下要求写一篇英语短文并附带中文翻译：

- 主题/场景：${scenario}
- 难度级别：${levelGuide}
- 字数限制：英语正文大约 ${wordCount} 词
- 写 3-5 个自然段落
- 直接输出 JSON，不要有任何废话和前缀

重要：只返回一个 JSON 对象，不要任何其他文字，格式如下：
{"english": "英文正文...", "chinese": "对应的中文翻译..."}`

  const userPrompt = `请写一篇关于"${scenario}"的英语短文并附带中文翻译。`
  const raw = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.85, maxTokens: 3072 }
  )
  const result = extractJSON(raw)
  if (!result.english || !result.chinese) {
    throw new LLMError('JSON_PARSE_ERROR', 'AI 返回的数据缺少 english 或 chinese 字段，请重试。')
  }
  return {
    english: result.english.trim(),
    chinese: result.chinese.trim(),
  }
}

export async function fetchWordDefinition(word, contextSentence) {
  if (!word || !contextSentence) {
    throw new LLMError('INVALID_PARAMS', '单词和上下文句子不能为空')
  }
  const prompt = `请解释单词"${word}"在句子"${contextSentence}"中的准确含义。要求直接输出：【词性】+ 中文释义。不要任何多余的废话。例如：【动词】放弃、抛弃。`
  const raw = await chatCompletion(
    [
      { role: 'system', content: '你是一位英语词汇专家。请严格按照要求输出。' },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.3, maxTokens: 128 }
  )
  return raw.trim()
}
