import React, { useMemo, useState, useEffect, useRef } from 'react'
import {
  Sparkles, BookOpen, FileText, RefreshCw, ArrowRight,
  Volume2, SlidersHorizontal, Zap, Star, Bookmark, X,
  Eye, EyeOff, XCircle, Settings, AlertCircle,
} from 'lucide-react'
import { useStorage } from '../hooks/useStorage'
import { playAudio } from '../utils/tts'
import {
  generateArticle,
  isLLMConfigured,
  fetchWordDefinition,
} from '../services/llmService'

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */

function normalizeTextWord(w) {
  return (w || '').trim()
}

function startOfDayISO(offsetDays = 0) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString()
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length
}

function splitIntoParagraphs(text) {
  return text.split(/\n+/).filter(Boolean)
}

function computeOutOfScope(text, poolSet) {
  if (!text || !text.trim()) return new Set()
  const sentences = text.split(/(?<=[.!?])\s+/)
  const whitelist = new Set()
  sentences.forEach((s) => {
    const parts = s.split(/\s+/)
    parts.forEach((p, idx) => {
      const m = p.match(/^([A-Z][a-z]+(?:[-'][A-Za-z]+)*)$/)
      if (m) {
        if (idx !== 0 || (parts[idx + 1] && parts[idx + 1].match(/^[A-Z][a-z]+$/))) {
          whitelist.add(m[1].toLowerCase())
        }
      }
      const m2 = p.match(/^([A-Z]{2,})$/)
      if (m2) whitelist.add(m2[1].toLowerCase())
    })
  })
  const outSet = new Set()
  const wordPattern = /\b[A-Za-z][A-Za-z'-]*\b/
  sentences.forEach((s) => {
    const parts = s.split(/(\b[A-Za-z][A-Za-z'-]*\b)/)
    parts.forEach((part) => {
      if (wordPattern.test(part)) {
        const key = normalizeTextWord(part).toLowerCase()
        const inPool = poolSet.has(key)
        const isWhitelisted = whitelist.has(key)
        const isProper = /[A-Z]/.test(part[0]) && !inPool && isWhitelisted
        if (!inPool && !isProper) outSet.add(key)
      }
    })
  })
  return outSet
}

/* ═══════════════════════════════════════════════════════════════
   Scenario data
   ═══════════════════════════════════════════════════════════════ */

function pickRandom(arr, n) {
  const shuffled = shuffle([...arr])
  return shuffled.slice(0, n)
}

const ALL_SCENARIOS_POOL = [
  { id: 'daily-routine', emoji: '🌅', title: 'A Perfect Morning Routine', topic: 'daily', difficulty: 'easy' },
  { id: 'tech-future', emoji: '🚀', title: 'How AI Is Changing Education', topic: 'technology', difficulty: 'medium' },
  { id: 'business-negotiation', emoji: '💼', title: 'The Art of Negotiation', topic: 'business', difficulty: 'medium' },
  { id: 'health-sleep', emoji: '😴', title: 'Why Sleep Is Your Superpower', topic: 'health', difficulty: 'hard' },
  { id: 'travel-solo', emoji: '✈️', title: 'The Joys of Traveling Alone', topic: 'travel', difficulty: 'easy' },
  { id: 'academic-research', emoji: '🔬', title: 'How to Read a Research Paper', topic: 'academic', difficulty: 'hard' },
  { id: 'ai-anxiety', emoji: '🤖', title: 'Unemployment Anxiety in the AI Era', topic: 'technology', difficulty: 'hard' },
  { id: 'mars-cafe', emoji: '☕', title: 'Opening a Coffee Shop on Mars', topic: 'travel', difficulty: 'medium' },
  { id: 'ielts-speaking', emoji: '🎤', title: 'IELTS Speaking Mock Interview', topic: 'academic', difficulty: 'hard' },
  { id: 'intro-linguistics', emoji: '📖', title: 'An Introduction to Cognitive Linguistics', topic: 'academic', difficulty: 'hard' },
  { id: 'vc-pitch', emoji: '💎', title: 'A Venture Capital Pitch in Silicon Valley', topic: 'business', difficulty: 'medium' },
  { id: 'deep-work', emoji: '🧠', title: 'Deep Work: How to Focus in a Distracted World', topic: 'daily', difficulty: 'medium' },
  { id: 'street-food', emoji: '🍜', title: 'A Food Tour Through Southeast Asia', topic: 'travel', difficulty: 'easy' },
  { id: 'climate-action', emoji: '🌍', title: 'Small Actions for a Greener Planet', topic: 'health', difficulty: 'medium' },
  { id: 'startup-culture', emoji: '🚀', title: 'Building a Startup from Zero', topic: 'business', difficulty: 'medium' },
  { id: 'remote-work', emoji: '🏠', title: 'The Remote Work Revolution', topic: 'daily', difficulty: 'easy' },
  { id: 'film-review', emoji: '🎬', title: 'Writing a Compelling Film Review', topic: 'daily', difficulty: 'easy' },
  { id: 'meditation', emoji: '🧘', title: 'Mindfulness and Meditation for Beginners', topic: 'health', difficulty: 'easy' },
  { id: 'data-privacy', emoji: '🔒', title: 'Why Data Privacy Matters More Than Ever', topic: 'technology', difficulty: 'medium' },
  { id: 'debate-club', emoji: '🗣️', title: 'How to Win a Formal Debate', topic: 'academic', difficulty: 'hard' },
]

const TOPIC_OPTIONS = [
  { value: 'all', label: '全部话题' },
  { value: 'daily', label: '日常闲谈' },
  { value: 'business', label: '商务' },
  { value: 'academic', label: '学术' },
  { value: 'travel', label: '旅游' },
  { value: 'technology', label: '科技' },
  { value: 'health', label: '健康' },
]

const DIFFICULTY_OPTIONS = [
  { value: 'all', label: '全部难度' },
  { value: 'easy', label: '初级' },
  { value: 'medium', label: '中级' },
  { value: 'hard', label: '高级' },
]

const LENGTH_OPTIONS = [
  { value: 100, label: '~100 词' },
  { value: 200, label: '~200 词' },
  { value: 300, label: '~300 词' },
]

/* ═══════════════════════════════════════════════════════════════
   Synthesis generator
   ═══════════════════════════════════════════════════════════════ */

const SYNTHESIS_TEMPLATES = [
  {
    title: 'A Story of Discovery',
    intro: 'Today, I want to share a short story that weaves together some of the words I\'ve been studying. As you read, pay attention to how each word fits naturally into the context.',
    outro: 'These words, though challenging at first, become much more memorable when you encounter them in a meaningful narrative. Try writing your own sentences using each one.',
  },
  {
    title: 'My Learning Journey',
    intro: 'Learning English is a journey filled with unexpected moments of clarity. Recently, several words have been giving me trouble — so I decided to explore them more deeply through writing.',
    outro: 'Each time I revisit these words in a new context, they become a little more familiar. The secret to vocabulary mastery is not memorization, but repeated, meaningful exposure.',
  },
  {
    title: 'Connections',
    intro: 'Languages are not collections of isolated words — they are webs of connection. Here is a short reflection that attempts to connect some of the vocabulary I\'ve found particularly challenging.',
    outro: 'When you see how words relate to one another in context, they stop being abstract symbols and start becoming tools you can actually use.',
  },
]

const SYNTHESIS_BODY_SENTENCES = [
  (w1, w2) => `I\'ve always found the word "${w1}" to be particularly interesting because of how it relates to the concept of ${w2} in everyday situations.`,
  (w1) => `The difference between merely recognizing "${w1}" and truly understanding it became clear to me after I encountered it in three different books over the course of a single week.`,
  (w1, w2) => `When I first learned "${w1}", I struggled to remember it. But once I connected it to the idea of ${w2}, everything clicked into place.`,
  (w1) => `There is something satisfying about finally mastering a word like "${w1}" — the kind of word that used to make me pause every time I saw it in a passage.`,
  (w1, w2) => `A friend once told me that the best way to learn "${w1}" is to use it alongside a familiar word like ${w2}, creating a bridge between the known and the unknown.`,
  (w1) => `One exercise I found helpful was to write a paragraph centered around "${w1}", forcing myself to understand not just the definition but the nuance of how it is used.`,
  (w1, w2) => `The relationship between "${w1}" and ${w2} is fascinating — understanding one deepens your appreciation of the other, like two sides of the same coin.`,
  (w1) => `I noticed that native speakers often use "${w1}" in contexts I would never have predicted, which reminded me that dictionaries only tell part of the story.`,
  (w1, w2) => `While reading an article about ${w2}, I unexpectedly came across "${w1}" — seeing it in that context made the definition suddenly feel intuitive rather than memorized.`,
  (w1) => `What fascinates me about "${w1}" is how its meaning shifts subtly depending on the surrounding words, almost like a chameleon adapting to its environment.`,
  (w1, w2) => `I used to confuse "${w1}" with similar-looking words, but associating it with ${w2} helped me build a mental model that makes the distinction permanent.`,
  (w1) => `Looking back at my notes on "${w1}", I realized I had written down the definition at least four times — yet it wasn\'t until I used it in a real conversation that it finally stuck.`,
  (w1, w2) => `The dictionary definition of "${w1}" barely scratches the surface. To truly grasp it, you need to see it deployed alongside related ideas like ${w2}, where the nuance becomes apparent.`,
  (w1) => `Language learners often underestimate the importance of encountering a word like "${w1}" across multiple contexts. A single definition is just the starting point of a much longer journey.`,
  (w1, w2) => `After discussing "${w1}" with a native speaker, I discovered a subtle connotation that no textbook had ever mentioned — it carries a hint of ${w2} that completely changes how I use it.`,
]

function generateSynthesisArticle(weakWords, targetWordCount) {
  const template = SYNTHESIS_TEMPLATES[Math.floor(Math.random() * SYNTHESIS_TEMPLATES.length)]
  const introOutroBudget = 55
  const wordsPerSentence = 32
  const targetBodyCount = Math.max(3, Math.min(12, Math.round((targetWordCount - introOutroBudget) / wordsPerSentence)))
  const bodySentences = shuffle(SYNTHESIS_BODY_SENTENCES).slice(0, targetBodyCount)
  const words = weakWords.length >= 2 ? weakWords : [...weakWords, ...weakWords]
  const shuffledWords = shuffle(words)
  const body = bodySentences.map((fn, i) => {
    const w1 = shuffledWords[i % shuffledWords.length] || 'practice'
    const w2 = shuffledWords[(i + 1) % shuffledWords.length] || 'context'
    return fn(w1, w2)
  })
  const allHighlightWords = [...new Set(shuffledWords.slice(0, bodySentences.length + 1))]
  const paragraphs = [template.intro, ...body, template.outro]
  return { title: template.title, paragraphs, highlightWords: allHighlightWords }
}

/* ═══════════════════════════════════════════════════════════════
   Shared: ImmersiveReader
   ═══════════════════════════════════════════════════════════════ */

function tokenizeParagraphs(paragraphs) {
  const sentencePattern = /(?<=[.!?])\s+/
  const wordPattern = /\b[A-Za-z][A-Za-z'-]*\b/
  const result = []

  paragraphs.forEach((para) => {
    const sentences = para.split(sentencePattern)
    const paraTokens = []

    sentences.forEach((rawSentence) => {
      const parts = rawSentence.split(/(\b[A-Za-z][A-Za-z'-]*\b)/)
      const sentenceTokens = []
      parts.forEach((part) => {
        if (wordPattern.test(part)) {
          sentenceTokens.push({ text: part, isWord: true, sentence: rawSentence })
        } else {
          sentenceTokens.push({ text: part, isWord: false })
        }
      })
      paraTokens.push(sentenceTokens)
    })

    result.push(paraTokens)
  })

  return result
}

function ImmersiveReader({
  paragraphs,
  poolMap,
  learningQueue,
  setLearningQueue,
  highlightSet,
}) {
  const [popup, setPopup] = useState(null)
  const popupRef = useRef(null)

  const tokenized = useMemo(() => tokenizeParagraphs(paragraphs), [paragraphs])

  useEffect(() => {
    if (!popup) return
    function handleClick(e) {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setPopup(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [popup])

  function handleWordClick(token, event) {
    const word = normalizeTextWord(token.text).toLowerCase()
    const entry = poolMap[word] || null
    const rect = event.target.getBoundingClientRect()
    setPopup({
      word: token.text,
      normalized: word,
      sentence: token.sentence,
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
      definitionEntry: entry,
      manualTranslation: '',
      isFetchingDef: false,
    })
  }

  async function handleAiDefinition() {
    if (!popup) return
    const capturedWord = popup.word
    const capturedSentence = popup.sentence
    setPopup((prev) => ({ ...prev, isFetchingDef: true }))
    try {
      const def = await fetchWordDefinition(capturedWord, capturedSentence)
      setPopup((prev) => {
        if (prev?.normalized !== capturedWord.toLowerCase()) return prev
        return { ...prev, manualTranslation: def, isFetchingDef: false }
      })
    } catch {
      setPopup((prev) => {
        if (prev?.normalized !== capturedWord.toLowerCase()) return prev
        return { ...prev, isFetchingDef: false }
      })
    }
  }

  function saveWordToQueue() {
    if (!popup) return
    const word = popup.word
    const exists = learningQueue.find(
      (it) => (it.word || '').toLowerCase() === word.toLowerCase()
    )
    if (exists) {
      const updated = learningQueue.map((it) =>
        (it.word || '').toLowerCase() === word.toLowerCase()
          ? { ...it, isFavorite: true }
          : it
      )
      setLearningQueue(updated)
    } else {
      const translations = popup.manualTranslation
        ? [{ type: 'AI释义', translation: popup.manualTranslation }]
        : popup.definitionEntry?.translations || []
      const item = {
        id: `${word}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        word,
        translations,
        phrases: [],
        isFavorite: true,
        nextReviewDate: startOfDayISO(0),
        level: 0,
        sourceSentence: popup.sentence,
      }
      setLearningQueue([...learningQueue, item])
    }
    setPopup(null)
  }

  function saveSentenceToQueue() {
    if (!popup) return
    const word = popup.word
    const sentence = popup.sentence
    const exists = learningQueue.find(
      (it) => (it.word || '').toLowerCase() === word.toLowerCase()
    )
    if (exists) {
      const updated = learningQueue.map((it) =>
        (it.word || '').toLowerCase() === word.toLowerCase()
          ? { ...it, sourceSentence: sentence }
          : it
      )
      setLearningQueue(updated)
    } else {
      const translations = popup.manualTranslation
        ? [{ type: 'AI释义', translation: popup.manualTranslation }]
        : popup.definitionEntry?.translations || []
      const item = {
        id: `${word}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        word,
        translations,
        phrases: [],
        isFavorite: false,
        nextReviewDate: startOfDayISO(0),
        level: 0,
        sourceSentence: sentence,
      }
      setLearningQueue([...learningQueue, item])
    }
    setPopup(null)
  }

  function isHighlighted(word) {
    if (!highlightSet) return false
    return highlightSet.has(normalizeTextWord(word).toLowerCase())
  }

  return (
    <div className="relative">
      {paragraphs.map((para, pi) => (
        <p key={pi} className="text-gray-700 leading-relaxed mb-5 text-base last:mb-0">
          {tokenized[pi]?.map((sentenceTokens, si) => (
            <React.Fragment key={si}>
              {sentenceTokens.map((token, ti) => {
                const key = `${si}-${ti}`
                if (!token.isWord) {
                  return <span key={key}>{token.text}</span>
                }
                return (
                  <span
                    key={key}
                    onClick={(e) => handleWordClick(token, e)}
                    className="cursor-pointer transition-colors rounded px-0.5 -mx-0.5 hover:bg-amber-50 hover:text-amber-900"
                    title="点击查看释义"
                  >
                    {token.text}
                  </span>
                )
              })}
              {si < (tokenized[pi]?.length || 0) - 1 ? ' ' : ''}
            </React.Fragment>
          ))}
        </p>
      ))}

      {popup && (
        <div
          ref={popupRef}
          className="fixed z-50 bg-white rounded-xl border border-gray-200 shadow-xl p-4 w-72"
          style={{
            left: Math.min(popup.x - 144, window.innerWidth - 304),
            top: Math.max(popup.y - 12, 16),
          }}
        >
          <button
            onClick={() => setPopup(null)}
            className="absolute top-2 right-2 text-gray-300 hover:text-gray-600 transition-colors"
          >
            <X size={16} />
          </button>

          <div className="flex items-center gap-2 mb-2 pr-5">
            <h4 className="text-base font-bold text-gray-900">{popup.word}</h4>
            <button
              onClick={() => playAudio(popup.word)}
              className="text-gray-400 hover:text-gray-700 transition-colors"
              title="发音"
            >
              <Volume2 size={15} />
            </button>
          </div>

          {popup.definitionEntry ? (
            <div className="mb-3 space-y-0.5">
              {(popup.definitionEntry.translations || []).slice(0, 3).map((t, i) => (
                <p key={i} className="text-sm text-gray-500">
                  <span className="text-xs text-gray-400 italic mr-1">{t.type}</span>
                  {t.translation}
                </p>
              ))}
            </div>
          ) : (
            <div className="mb-3">
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={popup.manualTranslation || ''}
                  onChange={(e) => setPopup((prev) => ({ ...prev, manualTranslation: e.target.value }))}
                  placeholder="输入中文释义..."
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-gray-400 transition-colors"
                />
                <button
                  onClick={handleAiDefinition}
                  disabled={popup.isFetchingDef}
                  className="flex-shrink-0 px-2 py-1.5 text-xs rounded-lg bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 text-purple-700 hover:from-purple-100 hover:to-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="AI 获取释义"
                >
                  {popup.isFetchingDef ? '...' : '✨ AI'}
                </button>
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400 mb-3 leading-relaxed line-clamp-2 border-l-2 border-gray-200 pl-2">
            {popup.sentence}
          </p>

          <div className="flex gap-2">
            <button
              onClick={saveWordToQueue}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-xs font-medium"
            >
              <Star size={14} />
              收藏词汇
            </button>
            <button
              onClick={saveSentenceToQueue}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-xs font-medium"
            >
              <Bookmark size={14} />
              收藏句子
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Main component
   ═══════════════════════════════════════════════════════════════ */

const LOADING_MESSAGES = [
  'AI 正在分析你的薄弱词...',
  'AI 正在为你编织语境...',
  '正在生成地道表达...',
  '正在润色句子结构...',
  '即将呈现，请稍候...',
]

const SCENARIO_LOADING_MESSAGES = [
  'AI 正在为你撰写文章...',
  '正在组织段落结构...',
  '正在润色地道表达...',
  '即将完成，请稍候...',
]

const GRAMMAR_LOADING_MESSAGES = [
  'AI 正在分析语法结构...',
  '正在编织包含目标语法的语境...',
  '正在润色句子...',
  '即将呈现，请稍候...',
]

const GRAMMAR_OPTIONS = [
  { id: 'subjunctive', label: '虚拟语气' },
  { id: 'attr-clause', label: '定语从句' },
  { id: 'non-predicate', label: '非谓语动词' },
  { id: 'inversion', label: '倒装句' },
  { id: 'emphatic', label: '强调句' },
  { id: 'absolute', label: '独立主格' },
  { id: 'compound-object', label: '复合宾语' },
  { id: 'passive', label: '被动语态' },
  { id: 'comparative', label: '比较结构' },
  { id: 'nominal-clause', label: '名词性从句' },
]

export default function Read() {
  /* ── ALL state declarations at top (no TDZ issues) ── */
  const [globalWordPool, setGlobalWordPool] = useStorage('globalWordPool', [])
  const [learningQueue, setLearningQueue] = useStorage('learningQueue', [])
  const [readCache, setReadCache] = useStorage('readCache', {})

  const [activeTab, setActiveTab] = useState('synthesis')
  const [synthesisArticle, setSynthesisArticle] = useState(null)
  const [synthesisLoading, setSynthesisLoading] = useState(false)
  const [synthWordCount, setSynthWordCount] = useState(150)
  const [showSynthConfig, setShowSynthConfig] = useState(false)

  const [selectedScenario, setSelectedScenario] = useState(null)
  const [llmArticle, setLlmArticle] = useState(null)
  const [scenarioTopic, setScenarioTopic] = useState('all')
  const [scenarioDifficulty, setScenarioDifficulty] = useState('all')
  const [customScenario, setCustomScenario] = useState('')
  const [scenarioLoading, setScenarioLoading] = useState(false)
  const [scenarioError, setScenarioError] = useState(null)
  const [lastGenParams, setLastGenParams] = useState(null)
  const [visibleScenarios, setVisibleScenarios] = useState(() => pickRandom(ALL_SCENARIOS_POOL, 4))
  const [scenarioWordCount, setScenarioWordCount] = useState(200)
  const [selectedGrammars, setSelectedGrammars] = useState([])
  const [grammarArticle, setGrammarArticle] = useState(null)
  const [grammarLoading, setGrammarLoading] = useState(false)
  const [grammarError, setGrammarError] = useState(null)
  const [grammarDifficulty, setGrammarDifficulty] = useState('medium')
  const [grammarWordCount, setGrammarWordCount] = useState(200)

  const [apiConfigured, setApiConfigured] = useState(() => isLLMConfigured())
  const [showScenarioTranslation, setShowScenarioTranslation] = useState(false)
  const [showGrammarTranslation, setShowGrammarTranslation] = useState(false)

  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0)
  const loadingTimerRef = useRef(null)

  /* ── loading animation ── */
  useEffect(() => {
    if (synthesisLoading || scenarioLoading || grammarLoading) {
      setLoadingMsgIdx(0)
      const messages = grammarLoading ? GRAMMAR_LOADING_MESSAGES : scenarioLoading ? SCENARIO_LOADING_MESSAGES : LOADING_MESSAGES
      let i = 0
      loadingTimerRef.current = setInterval(() => {
        i++
        if (i < messages.length) setLoadingMsgIdx(i)
      }, 700)
    } else {
      if (loadingTimerRef.current) clearInterval(loadingTimerRef.current)
    }
    return () => {
      if (loadingTimerRef.current) clearInterval(loadingTimerRef.current)
    }
  }, [synthesisLoading, scenarioLoading, grammarLoading])

  /* ── cache ── */

  // Restore synthesis from cache on mount
  useEffect(() => {
    if (readCache.synthesis && !synthesisArticle) {
      setSynthesisArticle(readCache.synthesis)
    }
    if (readCache.scenario && !llmArticle) {
      if (readCache.scenario.topic) setSelectedScenario(readCache.scenario.topic)
      if (readCache.scenario.article) setLlmArticle(readCache.scenario.article)
      if (readCache.scenario.customScenario) setCustomScenario(readCache.scenario.customScenario)
      if (readCache.scenario.lastGenParams) setLastGenParams(readCache.scenario.lastGenParams)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cache synthesis article
  useEffect(() => {
    if (synthesisArticle) {
      setReadCache((prev) => ({ ...prev, synthesis: synthesisArticle }))
    }
  }, [synthesisArticle]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cache scenario article
  useEffect(() => {
    if (llmArticle && selectedScenario) {
      setReadCache((prev) => ({
        ...prev,
        scenario: {
          topic: selectedScenario,
          article: llmArticle,
          customScenario,
          lastGenParams,
        },
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llmArticle, selectedScenario])

  /* ── derived ── */

  const poolSet = useMemo(() => {
    const s = new Set()
    for (const it of globalWordPool || []) {
      if (!it) continue
      const w = typeof it === 'string' ? it : it.word || it.en || it.text || ''
      if (w) s.add(w.toLowerCase())
    }
    return s
  }, [globalWordPool])

  const poolMap = useMemo(() => {
    const m = {}
    for (const it of globalWordPool || []) {
      if (!it || typeof it === 'string') continue
      const w = (it.word || '').toLowerCase()
      if (w) m[w] = it
    }
    return m
  }, [globalWordPool])

  const weakWordsAll = useMemo(() => {
    return learningQueue.filter((it) => it.level === 2 || it.level === 3).map((it) => it.word)
  }, [learningQueue])

  const weakWords = useMemo(() => weakWordsAll.slice(0, 12), [weakWordsAll])

  /* ── scenario filtering ── */

  const filteredForGrid = useMemo(() => {
    return visibleScenarios.filter((sc) => {
      if (scenarioTopic !== 'all' && sc.topic !== scenarioTopic) return false
      if (scenarioDifficulty !== 'all' && sc.difficulty !== scenarioDifficulty) return false
      return true
    })
  }, [visibleScenarios, scenarioTopic, scenarioDifficulty])

  const scenarioHighlightSet = useMemo(() => {
    if (!llmArticle?.english) return new Set()
    return computeOutOfScope(llmArticle.english, poolSet)
  }, [llmArticle, poolSet])

  function handleShuffle() {
    setVisibleScenarios(pickRandom(ALL_SCENARIOS_POOL, 4))
    setSelectedScenario(null)
    setLlmArticle(null)
    setScenarioError(null)
  }

  /* ── scenario handlers ── */

  function mapLLMError(error) {
    switch (error.code) {
      case 'NO_API_KEY':
        return '未配置 API Key。请在下方设置中填入你的 API Key。'
      case 'API_ERROR':
        if (error.status === 401) return 'API Key 无效，请检查后重试。'
        if (error.status === 429) return '请求过于频繁，请稍后重试。'
        if (error.status === 402) return 'API 账户余额不足。'
        return error.message || 'API 请求失败，请重试。'
      case 'NETWORK_ERROR':
        return '网络连接失败，请检查网络后重试。'
      case 'TIMEOUT':
        return '请求超时，请重试或尝试减少字数。'
      case 'JSON_PARSE_ERROR':
        return 'AI 返回格式异常，请重试。'
      default:
        return error.message?.slice(0, 150) || '未知错误，请重试。'
    }
  }

  async function handleGenerate(scenarioTitle, scObj) {
    setScenarioError(null)
    setScenarioLoading(true)
    setLlmArticle(null)
    const isCustom = !scObj
    const displayTitle = isCustom ? scenarioTitle : `${scObj.emoji} ${scObj.title}`
    const sc = isCustom ? { id: 'custom', emoji: '✨', title: scenarioTitle, topic: 'custom', difficulty: scenarioDifficulty } : scObj
    setSelectedScenario(sc)
    const finalDesc = customScenario.trim()
      ? `${displayTitle}（上下文：${customScenario.trim()}）`
      : displayTitle
    const params = { scenario: finalDesc, difficulty: sc.difficulty, wordCount: scenarioWordCount }
    setLastGenParams(params)
    try {
      const article = await generateArticle(params)
      setLlmArticle({ english: article.english, chinese: article.chinese, scenarioDesc: displayTitle, generatedAt: Date.now() })
    } catch (e) {
      setScenarioError(mapLLMError(e))
    } finally {
      setScenarioLoading(false)
    }
  }

  async function handleRegenerate() {
    if (!lastGenParams) return
    setScenarioError(null)
    setScenarioLoading(true)
    setLlmArticle(null)
    try {
      const article = await generateArticle(lastGenParams)
      setLlmArticle({ english: article.english, chinese: article.chinese, scenarioDesc: lastGenParams.scenario, generatedAt: Date.now() })
    } catch (e) {
      setScenarioError(mapLLMError(e))
      if (readCache.scenario?.article) {
        setLlmArticle(readCache.scenario.article)
      }
    } finally {
      setScenarioLoading(false)
    }
  }

  function handleBackToGrid() {
    setLlmArticle(null)
    setSelectedScenario(null)
    setScenarioError(null)
  }

  /* ── Smart Synthesis: generate ── */

  function handleGenerateSynthesis() {
    setSynthesisLoading(true)
    setSynthesisArticle(null)
    let words = weakWordsAll
    if (words.length === 0) {
      words = shuffle(learningQueue.map((it) => it.word)).slice(0, 5)
    }
    if (words.length === 0) {
      words = ['practice', 'context', 'memory', 'understanding', 'perspective']
    }
    setTimeout(() => {
      const article = generateSynthesisArticle(words, synthWordCount)
      setSynthesisArticle(article)
      setSynthesisLoading(false)
    }, 1600)
  }

  /* ── Grammar Focus: generate ── */

  function toggleGrammar(id) {
    setSelectedGrammars((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    )
  }

  async function handleGrammarGenerate() {
    if (selectedGrammars.length === 0) return
    setGrammarError(null)
    setGrammarLoading(true)
    setGrammarArticle(null)
    const prompt = {
      scenario: `请编写一篇英语短文。难度级别：${grammarDifficulty === 'easy' ? '初级' : grammarDifficulty === 'medium' ? '中级' : '高级'}。字数限制：大约 ${grammarWordCount} 词。核心要求：请在文章中极其自然地高频使用以下语法结构：${selectedGrammars.map((id) => GRAMMAR_OPTIONS.find((g) => g.id === id)?.label || id).join('、')}。直接输出正文，不要有任何前缀或解释。`,
      difficulty: grammarDifficulty,
      wordCount: grammarWordCount,
    }
    try {
      const article = await generateArticle(prompt)
      setGrammarArticle({ english: article.english, chinese: article.chinese, grammarFocus: [...selectedGrammars], generatedAt: Date.now() })
    } catch (e) {
      setGrammarError(mapLLMError(e))
    } finally {
      setGrammarLoading(false)
    }
  }

  async function handleGrammarRegenerate() {
    if (selectedGrammars.length === 0) return
    setGrammarError(null)
    setGrammarLoading(true)
    setGrammarArticle(null)
    const prompt = {
      scenario: `请编写一篇英语短文。难度级别：${grammarDifficulty === 'easy' ? '初级' : grammarDifficulty === 'medium' ? '中级' : '高级'}。字数限制：大约 ${grammarWordCount} 词。核心要求：请在文章中极其自然地高频使用以下语法结构：${selectedGrammars.map((id) => GRAMMAR_OPTIONS.find((g) => g.id === id)?.label || id).join('、')}。直接输出正文，不要有任何前缀或解释。`,
      difficulty: grammarDifficulty,
      wordCount: grammarWordCount,
    }
    try {
      const article = await generateArticle(prompt)
      setGrammarArticle({ english: article.english, chinese: article.chinese, grammarFocus: [...selectedGrammars], generatedAt: Date.now() })
    } catch (e) {
      setGrammarError(mapLLMError(e))
    } finally {
      setGrammarLoading(false)
    }
  }

  const grammarHighlightSet = useMemo(() => {
    if (!grammarArticle?.english) return new Set()
    return computeOutOfScope(grammarArticle.english, poolSet)
  }, [grammarArticle, poolSet])

  /* ── prompt preview ── */

  const synthesisPromptPreview = useMemo(() => {
    if (weakWordsAll.length === 0 && learningQueue.length === 0) return null
    const previewWords = weakWordsAll.slice(0, 5)
    return (
      `Write a coherent micro-essay of approximately ${synthWordCount} words in natural, idiomatic English. ` +
      'The essay must incorporate the following target vocabulary: ' +
      (previewWords.length > 0
        ? previewWords.map((w) => `"${w}"`).join(', ')
        : '(words drawn from your learning queue)') +
      '. Use each word in a meaningful context that demonstrates its typical usage and connotation.'
    )
  }, [weakWordsAll, learningQueue, synthWordCount])

  /* ── shared ── */

  const tabItem = (tab, icon, label) => (
    <button
      onClick={() => {
        setActiveTab(tab)
        setSelectedScenario(null)
        setLlmArticle(null)
        setScenarioError(null)
        setSynthesisArticle(null)
      }}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
        activeTab === tab
          ? 'bg-gray-900 text-white shadow-sm'
          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
      }`}
    >
      {icon}
      {label}
    </button>
  )

  const difficultyBadge = (difficulty) => {
    const map = {
      easy: { className: 'bg-emerald-50 text-emerald-700', label: '初级' },
      medium: { className: 'bg-amber-50 text-amber-700', label: '中级' },
      hard: { className: 'bg-red-50 text-red-700', label: '高级' },
    }
    const d = map[difficulty] || map.easy
    return (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${d.className}`}>
        {d.label}
      </span>
    )
  }

  /* ── Article shell (shared card for synthesis + scenario) ── */

  function ArticleCard({ title, meta, paragraphs, highlightSet, onRegenerate, chinese, showTranslation, onToggleTranslation }) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            {meta && <p className="text-xs text-gray-400 mt-0.5">{meta}</p>}
          </div>
          <div className="flex items-center gap-2">
            {chinese && (
              <button
                onClick={onToggleTranslation}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {showTranslation ? '👁️ 隐藏全文翻译' : '👁️ 查看全文翻译'}
              </button>
            )}
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <RefreshCw size={14} />
                换一篇
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 mb-6">
          <ImmersiveReader
            paragraphs={paragraphs}
            poolMap={poolMap}
            learningQueue={learningQueue}
            setLearningQueue={setLearningQueue}
            highlightSet={highlightSet}
          />
          {chinese && showTranslation && (
            <div className="mt-6 pt-6 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-3 font-medium">中文翻译</p>
              <div className="text-sm text-gray-500 italic leading-relaxed whitespace-pre-line">
                {chinese}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ═══════════════════════════════════════════════════════════════
     JSX
     ═══════════════════════════════════════════════════════════════ */

  return (
    <div className="min-h-screen pb-8">
      {/* ── Header + Tab Switcher ── */}
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Read</h2>
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {tabItem('synthesis', <Sparkles size={16} />, '智能合成')}
          {tabItem('scenario', <BookOpen size={16} />, '场景探索')}
          {tabItem('grammar', <Zap size={16} />, '语法专项')}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          Tab 1 — Smart Synthesis
          ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'synthesis' && (
        <div className="max-w-2xl mx-auto">
          {/* Weak words summary */}
          <div className="mb-6">
            <p className="text-sm text-gray-400 mb-3">
              基于你学习队列中标记为「模糊」或「忘记」的薄弱词汇，AI 将生成一篇逻辑连贯的微型短文，
              将这些词汇自然嵌入真实语境中。
            </p>
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
              <span>薄弱词汇池：<span className="font-semibold text-gray-600 ml-1">{weakWordsAll.length} 个</span></span>
              <span className="text-gray-300">|</span>
              <span>目标词数：<span className="font-semibold text-gray-600 ml-1">{synthWordCount} 词</span></span>
            </div>
            {weakWords.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {weakWords.map((w) => (
                  <span key={w} className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-100 rounded-full text-sm text-amber-800">
                    {w}
                    <button onClick={() => playAudio(w)} className="text-amber-400 hover:text-amber-600" title="发音">
                      <Volume2 size={12} />
                    </button>
                  </span>
                ))}
                {weakWordsAll.length > 12 && (
                  <span className="inline-flex items-center px-3 py-1 bg-gray-50 border border-gray-100 rounded-full text-xs text-gray-400">
                    +{weakWordsAll.length - 12} 更多
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">暂无薄弱词数据 — 将使用队列中的随机词汇</p>
            )}
          </div>

          {/* Config bar */}
          <div className="mb-6">
            <button
              onClick={() => setShowSynthConfig(!showSynthConfig)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              <SlidersHorizontal size={14} />
              {showSynthConfig ? '收起配置' : '生成配置'}
            </button>
            {showSynthConfig && (
              <div className="mt-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
                <label className="block text-xs text-gray-500 mb-2">目标词数</label>
                <div className="flex gap-2">
                  {[100, 150, 200].map((n) => (
                    <button
                      key={n}
                      onClick={() => setSynthWordCount(n)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        synthWordCount === n
                          ? 'bg-gray-900 text-white'
                          : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {n} 词
                    </button>
                  ))}
                </div>
                {synthesisPromptPreview && (
                  <div className="mt-4 p-3 bg-white rounded-lg border border-gray-200">
                    <p className="text-xs text-gray-400 mb-1.5 flex items-center gap-1">
                      <Zap size={12} /> Mock Prompt 预览
                    </p>
                    <p className="text-xs text-gray-500 leading-relaxed font-mono">{synthesisPromptPreview}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Generate / Loading / Article */}
          {!synthesisArticle && !synthesisLoading && (
            <div className="text-center py-16">
              <button
                onClick={handleGenerateSynthesis}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors text-sm font-medium"
              >
                <Sparkles size={18} />
                一键生成
              </button>
              {readCache.synthesis && (
                <p className="text-xs text-gray-400 mt-3">
                  检测到缓存的文章，
                  <button
                    onClick={() => setSynthesisArticle(readCache.synthesis)}
                    className="text-gray-600 underline hover:text-gray-900"
                  >
                    点击恢复
                  </button>
                </p>
              )}
            </div>
          )}

          {synthesisLoading && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="relative w-16 h-16 mb-6">
                <div className="absolute inset-0 border-4 border-gray-100 rounded-full" />
                <div className="absolute inset-0 border-4 border-transparent border-t-gray-900 rounded-full animate-spin" />
                <div className="absolute inset-2 border-4 border-transparent border-t-amber-300 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
              </div>
              <p className="text-sm font-medium text-gray-600 mb-1">正在生成</p>
              <p className="text-xs text-gray-400 animate-pulse transition-all duration-500" key={loadingMsgIdx}>
                {LOADING_MESSAGES[loadingMsgIdx]}
              </p>
            </div>
          )}

          {synthesisArticle && !synthesisLoading && (
            <div>
              <ArticleCard
                title={synthesisArticle.title}
                meta={`包含 ${synthesisArticle.highlightWords.length} 个目标词汇`}
                paragraphs={synthesisArticle.paragraphs}
                onRegenerate={handleGenerateSynthesis}
              />
              <div className="bg-amber-50/40 rounded-xl border border-amber-100 p-5">
                <p className="text-xs font-medium text-amber-700 mb-3 tracking-wide">文中目标词汇</p>
                <div className="flex flex-wrap gap-2">
                  {synthesisArticle.highlightWords.map((w) => (
                    <button
                      key={w}
                      onClick={() => playAudio(w)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-200 rounded-lg text-sm text-gray-700 hover:bg-amber-50 transition-colors"
                    >
                      {w}
                      <Volume2 size={12} className="text-gray-400" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          Tab 2 — Scenario Library
          ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'scenario' && (
        <div>
          {/* ── Grid mode: pick a scenario ── */}
          {!selectedScenario && (
            <div>
              <p className="text-sm text-gray-400 mb-5">
                输入自定义场景，或从下方主题中任选一个，AI 将为你生成一篇英语学习短文。
              </p>

              {/* Custom input + word count + generate button */}
              <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={customScenario}
                    onChange={(e) => setCustomScenario(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && customScenario.trim()) handleGenerate(customScenario.trim()) }}
                    placeholder="输入你感兴趣的场景，例如：在火星上开咖啡馆..."
                    className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 transition-shadow"
                  />
                  <button
                    onClick={() => { if (customScenario.trim()) handleGenerate(customScenario.trim()) }}
                    disabled={scenarioLoading || !customScenario.trim()}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                  >
                    {scenarioLoading ? '生成中...' : <><Sparkles size={16} /> 立即生成</>}
                  </button>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400">目标词数</label>
                    <select value={scenarioWordCount} onChange={(e) => setScenarioWordCount(Number(e.target.value))}
                      className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700">
                      <option value={100}>~100 词</option>
                      <option value={150}>~150 词</option>
                      <option value={200}>~200 词</option>
                      <option value={300}>~300 词</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400">难度</label>
                    <select value={scenarioDifficulty} onChange={(e) => setScenarioDifficulty(e.target.value)}
                      className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700">
                      <option value="easy">初级</option>
                      <option value="medium">中级</option>
                      <option value="hard">高级</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Filter bar + shuffle */}
              <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex items-center gap-3">
                  <label className="text-xs text-gray-400">话题</label>
                  <select value={scenarioTopic} onChange={(e) => setScenarioTopic(e.target.value)}
                    className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700">
                    <option value="all">全部话题</option>
                    <option value="daily">日常闲谈</option>
                    <option value="business">商务</option>
                    <option value="academic">学术</option>
                    <option value="travel">旅游</option>
                    <option value="technology">科技</option>
                    <option value="health">健康</option>
                  </select>
                  <label className="text-xs text-gray-400">难度</label>
                  <select value={scenarioDifficulty} onChange={(e) => setScenarioDifficulty(e.target.value)}
                    className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700">
                    <option value="all">全部难度</option>
                    <option value="easy">初级</option>
                    <option value="medium">中级</option>
                    <option value="hard">高级</option>
                  </select>
                </div>
                <button onClick={handleShuffle}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors">
                  <RefreshCw size={13} />
                  换一批灵感
                </button>
              </div>

              {/* Scenario grid */}
              {filteredForGrid.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
                  {filteredForGrid.map((sc) => (
                    <button key={sc.id} onClick={() => handleGenerate(sc.title, sc)}
                      className="group text-left bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:border-gray-300 hover:shadow-md transition-all">
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-2xl">{sc.emoji}</span>
                        {difficultyBadge(sc.difficulty)}
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-1">{sc.title}</h3>
                      <p className="text-xs text-gray-400 uppercase tracking-wide">
                        {TOPIC_OPTIONS.find((t) => t.value === sc.topic)?.label || sc.topic}
                      </p>
                      <div className="flex items-center gap-1 mt-3 text-xs text-gray-300 group-hover:text-gray-900 transition-colors">
                        <span>生成文章</span>
                        <ArrowRight size={14} />
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 flex items-center justify-center text-center">
                  <div>
                    <p className="text-4xl mb-4">🔍</p>
                    <p className="text-gray-400 text-sm">当前筛选条件下暂无场景，试试调整话题或难度</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Article mode: reading view ── */}
          {selectedScenario && (
            <div className="max-w-2xl mx-auto">
              {/* Back + regenerate header */}
              <div className="flex items-center justify-between mb-6">
                <button onClick={handleBackToGrid}
                  className="text-sm text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1">
                  ← 返回列表
                </button>
                {llmArticle && !scenarioLoading && (
                  <button onClick={handleRegenerate}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                    <RefreshCw size={14} />
                    换一篇
                  </button>
                )}
              </div>

              {/* Loading */}
              {scenarioLoading && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="relative w-16 h-16 mb-6">
                    <div className="absolute inset-0 border-4 border-gray-100 rounded-full" />
                    <div className="absolute inset-0 border-4 border-transparent border-t-gray-900 rounded-full animate-spin" />
                    <div className="absolute inset-2 border-4 border-transparent border-t-amber-300 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
                  </div>
                  <p className="text-sm font-medium text-gray-600 mb-1">AI 正在为你撰写文章</p>
                  <p className="text-xs text-gray-400 animate-pulse">{SCENARIO_LOADING_MESSAGES[loadingMsgIdx]}</p>
                </div>
              )}

              {/* Error */}
              {scenarioError && !scenarioLoading && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                  <div className="flex items-start gap-3">
                    <AlertCircle size={20} className="text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-red-700">{scenarioError}</p>
                      <div className="flex gap-3 mt-3">
                        <button onClick={handleBackToGrid}
                          className="text-sm text-red-600 underline hover:text-red-800">返回列表</button>
                        <button onClick={handleRegenerate}
                          className="text-sm text-red-600 underline hover:text-red-800">重试</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Article */}
              {llmArticle && !scenarioLoading && (
                <div>
                  <ArticleCard
                    title={selectedScenario.emoji + ' ' + selectedScenario.title}
                    meta={llmArticle.scenarioDesc ? `场景：${llmArticle.scenarioDesc}` : undefined}
                    paragraphs={splitIntoParagraphs(llmArticle.english)}
                    highlightSet={scenarioHighlightSet}
                    onRegenerate={handleRegenerate}
                    chinese={llmArticle.chinese}
                    showTranslation={showScenarioTranslation}
                    onToggleTranslation={() => setShowScenarioTranslation((v) => !v)}
                  />
                  <p className="text-xs text-gray-300">
                    约 {countWords(llmArticle.english)} 词
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          Tab 3 — Grammar Focus
          ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'grammar' && (
        <div className="max-w-2xl mx-auto">
          <p className="text-sm text-gray-400 mb-5">
            选择你想练习的语法点，AI 将生成一篇包含这些语法结构的短文。
          </p>

          {/* Grammar point selector grid */}
          <div className="mb-6">
            <p className="text-xs text-gray-500 mb-3 font-medium">选择语法结构（可多选）</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {GRAMMAR_OPTIONS.map((g) => {
                const active = selectedGrammars.includes(g.id)
                return (
                  <button key={g.id} onClick={() => toggleGrammar(g.id)}
                    className={`text-sm px-4 py-2.5 rounded-xl border transition-all text-left ${
                      active
                        ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {g.label}
                    {active && <span className="float-right text-white/70">✓</span>}
                  </button>
                )
              })}
            </div>
            {selectedGrammars.length > 0 && (
              <p className="text-xs text-gray-400 mt-2">
                已选 {selectedGrammars.length} 个语法点
              </p>
            )}
          </div>

          {/* Difficulty + word count */}
          <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">难度</label>
                <select value={grammarDifficulty} onChange={(e) => setGrammarDifficulty(e.target.value)}
                  className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700">
                  <option value="easy">初级</option>
                  <option value="medium">中级</option>
                  <option value="hard">高级</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">目标词数</label>
                <select value={grammarWordCount} onChange={(e) => setGrammarWordCount(Number(e.target.value))}
                  className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700">
                  <option value={100}>~100 词</option>
                  <option value={200}>~200 词</option>
                  <option value={300}>~300 词</option>
                </select>
              </div>
            </div>
          </div>

          {/* Generate button / Loading / Article */}
          {!grammarArticle && !grammarLoading && (
            <div className="text-center py-6">
              <button
                onClick={handleGrammarGenerate}
                disabled={selectedGrammars.length === 0}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                <Zap size={18} />
                按照选定语法生成
              </button>
              {selectedGrammars.length === 0 && (
                <p className="text-xs text-gray-400 mt-2">请先选择至少一个语法结构</p>
              )}
            </div>
          )}

          {grammarLoading && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="relative w-16 h-16 mb-6">
                <div className="absolute inset-0 border-4 border-gray-100 rounded-full" />
                <div className="absolute inset-0 border-4 border-transparent border-t-gray-900 rounded-full animate-spin" />
                <div className="absolute inset-2 border-4 border-transparent border-t-amber-300 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
              </div>
              <p className="text-sm font-medium text-gray-600 mb-1">正在生成</p>
              <p className="text-xs text-gray-400 animate-pulse transition-all duration-500" key={loadingMsgIdx}>
                {GRAMMAR_LOADING_MESSAGES[loadingMsgIdx]}
              </p>
            </div>
          )}

          {grammarError && !grammarLoading && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6">
              <div className="flex items-start gap-3">
                <AlertCircle size={20} className="text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-red-700">{grammarError}</p>
                  <button onClick={() => setGrammarError(null)}
                    className="text-sm text-red-600 underline mt-2 hover:text-red-800">清除错误</button>
                </div>
              </div>
            </div>
          )}

          {grammarArticle && !grammarLoading && (
            <div>
              <ArticleCard
                title={`语法练习 · ${grammarArticle.grammarFocus?.length || selectedGrammars.length} 个语法点`}
                meta={`难度：${grammarDifficulty === 'easy' ? '初级' : grammarDifficulty === 'medium' ? '中级' : '高级'} · 约 ${grammarWordCount} 词`}
                paragraphs={splitIntoParagraphs(grammarArticle.english)}
                highlightSet={grammarHighlightSet}
                onRegenerate={handleGrammarRegenerate}
                chinese={grammarArticle.chinese}
                showTranslation={showGrammarTranslation}
                onToggleTranslation={() => setShowGrammarTranslation((v) => !v)}
              />
              {grammarArticle.grammarFocus && (
                <div className="bg-indigo-50/40 rounded-xl border border-indigo-100 p-4">
                  <p className="text-xs font-medium text-indigo-700 mb-2">文中应包含的语法结构</p>
                  <div className="flex flex-wrap gap-2">
                    {grammarArticle.grammarFocus.map((gid) => {
                      const g = GRAMMAR_OPTIONS.find((o) => o.id === gid)
                      return g ? (
                        <span key={gid}
                          className="inline-flex items-center px-3 py-1 bg-white border border-indigo-200 rounded-lg text-xs text-indigo-700">
                          {g.label}
                        </span>
                      ) : null
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
